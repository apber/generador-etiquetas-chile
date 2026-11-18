// Datos de la empresa en el dispositivo. Son los mismos archivos de la carpeta de OneDrive (la que dice la configuración del entorno):
//   company.json · products/<id>.json · marca/assets.json y sus imágenes · registro/impresiones.json · para-imprimir/<id>.json
// Cada archivo se guarda en la copia local con la clave «f:<ruta>»; los cambios quedan marcados para subirlos.
// Lo propio de este dispositivo (tamaño de letra, lo elegido para imprimir) no se sube.

import { useEffect, useState } from '../../vendor/preact-htm.js';
import { bd } from './bd.js';
import { M } from '../../textos.js';
import { filterForLabel, brandFileNames, brandFingerprint, sha256Hex } from '../../../src/app-label.js';

export const estado = {
  listo: false,
  company: null,
  products: new Map(),
  catalog: null,
  marca: null,          // { assets (assets.json), urls: { archivo: blob URL }, textos: { archivo.svg: texto }, huella }
  impresiones: [],      // registro de impresiones, la más nueva al final
  paraImprimir: [],     // trabajos mandados desde el teléfono al computador
  ajustes: { ts: 1 },
  seleccion: {},        // { productId: { n, peso, variante } }
  version: 0,
};

const oyentes = new Set();
/**
 * Avisa un cambio. tipo: 'datos' (cambió algo de los datos: se vuelve a calcular y se sincroniza), 'subir' (hay un
 * archivo nuevo que subir, sin cambio en lo que se ve) o 'vista' (solo cambió lo que se muestra, p. ej. el estado de
 * la sincronización: no se vuelve a sincronizar, para no quedar en un ciclo).
 */
export function avisarCambio(tipo = 'datos') {
  if (tipo === 'datos') estado.version++;
  oyentes.forEach((f) => f(tipo));
}
export function suscribir(f) { oyentes.add(f); return () => oyentes.delete(f); }

/** Vuelve a dibujar el componente cuando cambian los datos. */
export function useAlmacen() {
  const [, set] = useState(0);
  useEffect(() => suscribir(() => set((v) => v + 1)), []);
  return estado;
}

/** Datos con la forma que usa buildLabelData (con los datos leídos que todavía no pueden ir a la etiqueta, fuera). */
export const tienda = () => ({ company: estado.company, products: paraEtiqueta(), catalog: estado.catalog });

let cacheEt = { version: -1, mapa: null };
function paraEtiqueta() {
  if (cacheEt.version === estado.version) return cacheEt.mapa;
  const mapa = new Map();
  for (const [id, p] of estado.products) mapa.set(id, filterForLabel(p));
  cacheEt = { version: estado.version, mapa };
  return mapa;
}

const esJson = (ruta) => ruta.endsWith('.json');

/** Guarda un archivo en la copia local. contenido: objeto (JSON) o Blob. */
export async function escribir(ruta, contenido, { pendiente = true, eTag = null } = {}) {
  const prev = await bd.leer(`f:${ruta}`);
  await bd.guardar(`f:${ruta}`, { ruta, contenido, pendiente, eTag: eTag ?? prev?.eTag ?? null, fecha: new Date().toISOString() });
}
export async function borrarArchivo(ruta) {
  await bd.borrar(`f:${ruta}`);
  if (await sincronizable()) await bd.guardar(`borrado:${ruta}`, { ruta, fecha: new Date().toISOString() });
}
const sincronizable = async () => Boolean(await bd.leer('sesion'));

export async function leerArchivo(ruta) { return (await bd.leer(`f:${ruta}`))?.contenido; }

/** Lee todo desde la copia local. */
export async function cargar() {
  if (!estado.catalog) estado.catalog = await (await fetch(new URL('../../../data/allergens.json', import.meta.url))).json();
  estado.company = (await leerArchivo('company.json')) ?? null;
  // app.json (opcional): ajustes de la app para la empresa, p. ej. { "impresora": "Nombre de la impresora en Windows",
  // "papel": "papel fotográfico autoadhesivo" }
  estado.app = (await leerArchivo('app.json')) ?? {};
  M.marca = estado.company?.brand ?? 'la empresa';
  M.impresora = estado.app.impresora ?? 'la impresora de etiquetas';
  M.papel = estado.app.papel ?? 'papel de las etiquetas';
  estado.products = new Map();
  for (const [, v] of (await bd.todos('f:products/')).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (v.contenido?.id) estado.products.set(v.contenido.id, v.contenido);
  }
  estado.impresiones = (await leerArchivo('registro/impresiones.json')) ?? [];
  estado.paraImprimir = (await bd.todos('f:para-imprimir/')).map(([, v]) => v.contenido).filter(Boolean)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  estado.ajustes = { ts: 1, ...((await bd.leer('ajustes')) ?? {}) };
  estado.seleccion = (await bd.leer('seleccion')) ?? {};
  await cargarMarca();
  estado.listo = true;
  avisarCambio();
}

async function cargarMarca() {
  Object.values(estado.marca?.urls ?? {}).forEach((u) => URL.revokeObjectURL(u));
  const assets = await leerArchivo('marca/assets.json');
  if (!assets) { estado.marca = null; return; }
  const urls = {}, textos = {};
  for (const [k, v] of await bd.todos('f:marca/')) {
    const nombre = k.slice('f:marca/'.length);
    if (!(v.contenido instanceof Blob)) continue;
    urls[nombre] = URL.createObjectURL(v.contenido);
    if (nombre.endsWith('.svg')) textos[nombre] = await v.contenido.text();
  }
  // Huella de las imágenes que usa la etiqueta (su contenido): parte de la clave de cada etiqueta hecha
  const hashes = {};
  for (const n of brandFileNames(assets)) {
    const b = (await bd.leer(`f:marca/${n}`))?.contenido;
    if (b instanceof Blob) hashes[n] = await sha256Hex(await b.arrayBuffer());
  }
  estado.marca = { assets, urls, textos, huella: brandFingerprint(assets, hashes) };
}

/** Imágenes de marca para la plantilla: direcciones (vista previa) o data: (para mandarlas al servidor). */
export async function imagenesEtiqueta({ comoData = false } = {}) {
  const m = estado.marca;
  if (!m) return null;
  const a = m.assets;
  const blobDe = async (nombre) => (await bd.leer(`f:marca/${nombre}`))?.contenido;
  const url = async (nombre) => {
    if (!nombre) return null;
    if (!comoData) return m.urls[nombre] ?? null;
    const b = await blobDe(nombre);
    return b ? aData(b) : null;
  };
  // Un ícono .svg va dentro de la etiqueta (como en la versión de Node: render-label.js)
  const icono = async (nombre) => (nombre?.endsWith('.svg') && m.textos[nombre]
    ? m.textos[nombre].replace(/<\?xml[^>]*>\s*/, '').trim() : url(nombre));
  const sellos = {};
  for (const [k, v] of Object.entries(a.seals ?? {})) sellos[k] = await url(v);
  const iconos = {};
  for (const [k, v] of Object.entries(a.icons ?? {})) iconos[k] = await icono(v);
  return { logo: await url(a.logo), signatureIcon: await url(a.signatureIcon), seals: sellos, icons: iconos };
}

export const aData = (blob) => new Promise((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => mal(r.error);
  r.readAsDataURL(blob);
});

export async function guardarProducto(p) {
  await escribir(`products/${p.id}.json`, p);
  estado.products.set(p.id, p);
  avisarCambio();
}
export async function eliminarProducto(id) {
  await borrarArchivo(`products/${id}.json`);
  estado.products.delete(id);
  avisarCambio();
}
export async function guardarEmpresa(c) {
  await escribir('company.json', c);
  estado.company = c;
  avisarCambio();
}
export async function anotarImpresion(reg) {
  estado.impresiones = [...estado.impresiones, reg];
  await escribir('registro/impresiones.json', estado.impresiones);
  avisarCambio();
}
export async function guardarAjustes(cambios) {
  estado.ajustes = { ...estado.ajustes, ...cambios };
  await bd.guardar('ajustes', estado.ajustes);
  avisarCambio();
}
export async function guardarSeleccion(sel) {
  estado.seleccion = sel;
  await bd.guardar('seleccion', sel);
  avisarCambio();
}
export async function agregarParaImprimir(trabajo) {
  await escribir(`para-imprimir/${trabajo.id}.json`, trabajo);
  estado.paraImprimir = [...estado.paraImprimir, trabajo];
  avisarCambio();
}
export async function quitarParaImprimir(id) {
  await borrarArchivo(`para-imprimir/${id}.json`);
  estado.paraImprimir = estado.paraImprimir.filter((t) => t.id !== id);
  avisarCambio();
}

/**
 * Carga una carpeta completa (primera vez o datos de prueba). archivos: [{ ruta, contenido (texto, objeto o Blob) }].
 * Rutas como en OneDrive: company.json, products/x.json, marca/…
 */
export async function importar(archivos, { pendiente = false } = {}) {
  for (const { ruta, contenido } of archivos) {
    let c = contenido;
    if (esJson(ruta) && typeof c === 'string') c = JSON.parse(c);
    if (esJson(ruta) && c instanceof Blob) c = JSON.parse(await c.text());
    await escribir(ruta, c, { pendiente });
  }
  await cargar();
}

/** Borra la copia local (Ajustes, o al cambiar de cuenta). */
export async function borrarTodo() {
  await bd.vaciar();
  estado.products = new Map(); estado.company = null; estado.marca = null;
  await cargar();
}
