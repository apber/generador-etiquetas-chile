// Sincronización con la carpeta de OneDrive (en la cuenta de la usuaria). Primero sube lo
// cambiado en el dispositivo, después baja lo cambiado en OneDrive (consulta «delta»: solo lo nuevo desde la última vez).
// Si un archivo cambió en los dos lados, gana el último que se subió (OneDrive guarda las versiones anteriores).

import { ENTORNO, conOneDrive } from '../config.js';
import { bd } from './bd.js';
import { cargar, escribir, avisarCambio, estado } from './almacen.js';
import { tokenGraph } from './sesion.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const carpeta = () => ENTORNO.microsoft.carpeta;
const enc = (ruta) => ruta.split('/').map(encodeURIComponent).join('/');

export const sinc = { estado: 'nada', ultima: null, error: null };   // nada | sincronizando | al_dia | sin_conexion | error

async function graph(ruta, { metodo = 'GET', cuerpo, tipo, crudo = false } = {}) {
  const token = await tokenGraph();
  if (!token) { const e = new Error('sin sesión'); e.code = 'sin_sesion'; throw e; }
  const r = await fetch(ruta.startsWith('http') ? ruta : `${GRAPH}${ruta}`, {
    method: metodo, body: cuerpo,
    headers: { Authorization: `Bearer ${token}`, ...(tipo ? { 'Content-Type': tipo } : {}) },
  });
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error(`Graph ${r.status}`); e.status = r.status; throw e; }
  if (crudo) return r;
  return r.status === 204 ? null : r.json();
}

// Marca de versión de un archivo: la de su contenido (cTag), que no cambia cuando OneDrive solo toca los datos del
// archivo (al procesarlo después de subirlo, el eTag cambia y se volvería a bajar todo). Sin cTag, el eTag.
const marcaDe = (it) => it?.cTag ?? it?.eTag ?? null;

/** Sube un archivo (JSON o Blob). Devuelve su marca de versión. */
async function subir(ruta, contenido) {
  const esBlob = contenido instanceof Blob;
  const cuerpo = esBlob ? contenido : JSON.stringify(contenido, null, 2);
  const tipo = esBlob ? (contenido.type || 'application/octet-stream') : 'application/json';
  const it = await graph(`/me/drive/root:/${enc(`${carpeta()}/${ruta}`)}:/content`, { metodo: 'PUT', cuerpo, tipo });
  return marcaDe(it);
}

// La consulta delta no trae la dirección de descarga (@microsoft.graph.downloadUrl): sin ella se baja con /content.
// Nunca se guarda una página web en vez del archivo (18-11-2026: una dirección vacía bajaba la página de la app).
async function bajar(item) {
  const directa = item['@microsoft.graph.downloadUrl'];
  const r = directa ? await fetch(directa) : await graph(`/me/drive/items/${item.id}/content`, { crudo: true });
  if (!r || !r.ok) throw new Error(`descarga ${r?.status}`);
  if (item.name.endsWith('.json')) return r.json();
  const b = await r.blob();
  if (b.type.startsWith('text/html') && !/\.html?$/.test(item.name)) throw new Error(`descarga de ${item.name}: llegó una página web`);
  return b;
}

/** Arreglo de una vez: borra las copias locales que quedaron con una página web en vez del archivo (y vuelve a bajar todo). */
async function repararDescargas() {
  if (await bd.leer('reparado:descargas-1')) return;
  let malos = 0;
  for (const [k, v] of await bd.todos('f:')) {
    if (v.contenido instanceof Blob && v.contenido.type.startsWith('text/html') && !/\.html?$/.test(v.ruta)) { await bd.borrar(k); malos++; }
  }
  if (malos) await bd.borrar('delta');
  await bd.guardar('reparado:descargas-1', { fecha: new Date().toISOString(), malos });
}

function rutaRelativa(item) {
  const base = `/drive/root:/${carpeta()}`;
  const padre = decodeURIComponent(item.parentReference?.path ?? '');
  if (!padre.startsWith(base)) return null;
  const sub = padre.slice(base.length).replace(/^\//, '');
  return sub ? `${sub}/${item.name}` : item.name;
}

let enCurso = null;
/** Sube lo pendiente y baja lo nuevo. Se puede llamar seguido: si ya está corriendo, espera esa misma. */
export function sincronizar() {
  if (!conOneDrive()) return Promise.resolve();
  enCurso ??= (async () => {
    if (!navigator.onLine) { sinc.estado = 'sin_conexion'; avisarCambio('vista'); return; }
    sinc.estado = 'sincronizando'; sinc.error = null; avisarCambio('vista');
    try {
      await repararDescargas();
      // 1. Subir
      for (const [k, v] of await bd.todos('f:')) {
        if (!v.pendiente) continue;
        const eTag = await subir(v.ruta, v.contenido);
        const actual = await bd.leer(k);
        if (actual && actual.fecha === v.fecha) await bd.guardar(k, { ...actual, pendiente: false, eTag });
      }
      for (const [k, v] of await bd.todos('borrado:')) {
        await graph(`/me/drive/root:/${enc(`${carpeta()}/${v.ruta}`)}`, { metodo: 'DELETE' });
        await bd.borrar(k);
      }
      // 2. Bajar lo cambiado
      let url = (await bd.leer('delta')) ?? `/me/drive/root:/${enc(carpeta())}:/delta`;
      let cambios = 0;
      for (;;) {
        const pag = await graph(url);
        if (!pag) break;   // la carpeta todavía no existe: se crea al subir el primer archivo
        for (const it of pag.value ?? []) {
          if (it.folder) continue;
          const ruta = rutaRelativa(it);
          if (!ruta) continue;
          const local = await bd.leer(`f:${ruta}`);
          if (it.deleted) { if (local && !local.pendiente) { await bd.borrar(`f:${ruta}`); cambios++; } continue; }
          if (local?.pendiente) continue;            // cambiado aquí después de subir: se sube en la próxima
          if (local?.eTag && (local.eTag === it.cTag || local.eTag === it.eTag)) continue;
          await escribir(ruta, await bajar(it), { pendiente: false, eTag: marcaDe(it) });
          cambios++;
        }
        if (pag['@odata.nextLink']) { url = pag['@odata.nextLink']; continue; }
        if (pag['@odata.deltaLink']) await bd.guardar('delta', pag['@odata.deltaLink']);
        break;
      }
      if (cambios) await cargar();
      sinc.estado = 'al_dia'; sinc.ultima = new Date().toISOString();
    } catch (e) {
      sinc.estado = navigator.onLine ? 'error' : 'sin_conexion'; sinc.error = e;
      if (e.status === 410) await bd.borrar('delta');   // el delta venció: la próxima vez se revisa todo
    } finally {
      enCurso = null; avisarCambio('vista');
    }
  })();
  return enCurso;
}

let reloj = null;
/** Sincroniza en un rato (tras un cambio local), al volver la conexión y cada 5 minutos con la app abierta. */
export function sincronizarLuego(ms = 2000) {
  clearTimeout(reloj);
  reloj = setTimeout(() => sincronizar(), ms);
}
export function iniciarSincronizacion() {
  if (!conOneDrive()) return;
  window.addEventListener('online', () => sincronizarLuego(500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizarLuego(500); });
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 5 * 60_000);
  sincronizar();
}

/** ¿Hay algo sin subir? */
export async function pendientes() {
  const f = (await bd.todos('f:')).filter(([, v]) => v.pendiente).length;
  return f + (await bd.todos('borrado:')).length;
}
export { estado };
