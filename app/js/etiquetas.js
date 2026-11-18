// Etiquetas en la app: datos de cada presentación, vista previa, PDF de cada etiqueta y la hoja para imprimir (la arma
// el dispositivo, sin internet). Cada etiqueta hecha queda en la carpeta de datos (etiquetas/<clave>.pdf y .json,
// src/app-label.js), así que se sincroniza con el otro dispositivo; las que se hacen por adelantado
// (scripts/preparar-etiquetas.mjs) llegan igual. Solo una etiqueta que no está hecha se le pide al servidor.

import { labelMarkup, layoutLabel } from '../../src/template/label.js';
import { cleanLabel, LABEL_FONTS } from '../../src/render/label-pdf.js';
import { composeSheet } from '../../src/sheet/compose-pdf.js';
import { planSheet } from '../../src/sheet/plan.js';
import { appLabelData, companyForLabel, labelKey, labelFiles, labelMeta, labelParts, LABELS_FOLDER } from '../../src/app-label.js';
import { PDFDocument } from '../vendor/pdf-lib.js';
import { estado, tienda, imagenesEtiqueta, escribir, leerArchivo, borrarArchivo, avisarCambio } from './datos/almacen.js';
import { bd } from './datos/bd.js';
import { api } from './api.js';

/** Índice de la presentación con ese peso (o -1). */
export const indicePeso = (p, peso) => (p.presentations ?? []).findIndex((x) => x.net_weight_g === peso);

/** Partes de la etiqueta que la usuaria quitó (las que la norma no pide). */
export const partes = labelParts;

/**
 * Datos de la etiqueta de un producto. pedido: { peso, variante: { componente: alternativa } }.
 * Sin peso: la primera presentación.
 */
export const datosEtiqueta = (id, pedido = {}) => appLabelData(tienda(), id, pedido);

/** Empresa como la ve la plantilla (sin Síguenos si el producto lo quitó). */
const empresaPara = (id) => companyForLabel(estado.company, estado.products.get(id));

/** Clave de una etiqueta: cambia con los datos, la empresa, las imágenes de marca y la plantilla. */
export const claveEtiqueta = (id, d) => labelKey(d, empresaPara(id), estado.marca?.huella ?? '');

/** La etiqueta ya hecha con esa clave: { pdf (ArrayBuffer), html, result } o null. */
async function guardada(clave) {
  const f = labelFiles(clave);
  const meta = await leerArchivo(f.meta);
  const pdf = await leerArchivo(f.pdf);
  if (!meta?.html || !meta.result || !(pdf instanceof Blob)) return null;
  return { pdf: await pdf.arrayBuffer(), html: meta.html, result: meta.result };
}

/** Guarda una etiqueta nueva y borra las anteriores de la misma presentación (quedaron viejas). */
async function guardar(clave, id, pedido, d, r) {
  const f = labelFiles(clave);
  const peso = d.front?.netWeight?.g ?? pedido.peso ?? null;
  const variante = pedido.variante ?? {};
  const misma = (m) => m?.producto === id && m.peso === peso && JSON.stringify(m.variante ?? {}) === JSON.stringify(variante);
  for (const [k, v] of await bd.todos(`f:${LABELS_FOLDER}/`)) {
    if (!k.endsWith('.json') || k === `f:${f.meta}` || !misma(v.contenido)) continue;
    const ruta = k.slice(2);
    await borrarArchivo(ruta);
    await borrarArchivo(ruta.replace(/\.json$/, '.pdf'));
  }
  await escribir(f.pdf, new Blob([r.pdf], { type: 'application/pdf' }));
  await escribir(f.meta, labelMeta({ productId: id, peso, variante, html: r.html, result: r.result, fecha: new Date().toISOString() }));
  avisarCambio();   // para que se suba
}

// ---- Vista previa: la guardada (igual al PDF) o, si no hay, maquetada aquí mismo ----
const previasLocales = new Map();

/** Maqueta la etiqueta en este navegador (sin internet). Devuelve { html, result }. */
export async function maquetarAqui(id, d) {
  const assets = await imagenesEtiqueta();
  const { html, cfg } = labelMarkup(d, empresaPara(id), { assets: assets ?? undefined });
  const caja = document.createElement('div');
  caja.setAttribute('aria-hidden', 'true');
  caja.style.cssText = 'position:absolute;left:-20000px;top:0;width:1000px;visibility:hidden';
  caja.innerHTML = html;
  document.body.appendChild(caja);
  try {
    await Promise.all(LABEL_FONTS.map((f) => document.fonts.load(f).catch(() => null)));
    await Promise.all([...caja.querySelectorAll('img')].map((i) => i.decode().catch(() => null)));
    const result = await layoutLabel(caja.querySelector('.label'), cfg);
    if (result.error) throw new Error(result.error);
    return { html: cleanLabel(caja.querySelector('.label')), result };
  } finally {
    caja.remove();
  }
}

/** Etiqueta para mostrar: { html, result, guardada } (guardada = es la misma del PDF). */
export async function vistaPrevia(id, pedido = {}) {
  const d = datosEtiqueta(id, pedido);
  if (d.incomplete) return { incompleta: d };
  const clave = await claveEtiqueta(id, d);
  const meta = await leerArchivo(labelFiles(clave).meta);
  if (meta?.html && meta.result) return { html: await conImagenes(meta.html), result: meta.result, guardada: true, datos: d, clave };
  if (!previasLocales.has(clave)) previasLocales.set(clave, maquetarAqui(id, d));
  try {
    const v = await previasLocales.get(clave);
    return { ...v, guardada: false, datos: d, clave };
  } catch (e) { previasLocales.delete(clave); throw e; }
}

// El servidor devuelve la etiqueta con «@marca:archivo» en vez de las imágenes; aquí se ponen las del dispositivo
async function conImagenes(html) {
  const urls = estado.marca?.urls ?? {};
  return html.replace(/@marca:([\w.-]+)/g, (m, n) => urls[n] ?? '');
}

/**
 * PDF de una etiqueta: el guardado o uno nuevo del servidor. Devuelve { pdf (ArrayBuffer), result, html }.
 * Sin internet y sin PDF guardado: Error con code 'sin_conexion'.
 */
export async function etiquetaPdf(id, pedido = {}) {
  const d = datosEtiqueta(id, pedido);
  if (d.incomplete) { const e = new Error('incompleta'); e.code = 'incompleta'; e.datos = d; throw e; }
  const clave = await claveEtiqueta(id, d);
  const g = await guardada(clave);
  if (g) return g;
  const assets = await imagenesEtiqueta({ comoData: true });
  const r = await api.etiqueta({ labelData: d, company: empresaPara(id), assets, marca: nombresMarca() });
  await guardar(clave, id, pedido, d, r);
  return { pdf: r.pdf, html: r.html, result: r.result };
}

/** Para que el servidor devuelva la etiqueta con «@marca:archivo» en vez de cada imagen. */
function nombresMarca() {
  const a = estado.marca?.assets;
  if (!a) return {};
  return { logo: a.logo, signatureIcon: a.signatureIcon, ...Object.fromEntries(Object.entries(a.seals ?? {}).map(([k, v]) => [`seal:${k}`, v])),
    ...Object.fromEntries(Object.entries(a.icons ?? {}).map(([k, v]) => [`icon:${k}`, v])) };
}

/** Largo de cada etiqueta para calcular las hojas: el del PDF guardado o el de la vista local. */
export async function medida(id, pedido = {}) {
  const v = await vistaPrevia(id, pedido);
  if (v.incompleta) return null;
  return { cut: v.result.cut, freeEnd: v.result.freeEnd, lengthMm: v.result.lengthMm };
}

/** Cuántas hojas y cuántas caben de más en la última. lista: [{ id, n, peso, variante }]. */
export async function planHojas(lista) {
  const items = [];
  for (const it of lista) {
    const m = await medida(it.id, it);
    if (!m) continue;
    for (let k = 0; k < it.n; k++) items.push({ id: it.id, cut: m.cut, freeEnd: m.freeEnd });
  }
  if (!items.length) return { hojas: 0, libres: 0, plan: null };
  const plan = planSheet(items, { paper: 'letter' });
  const ultima = items[items.length - 1];
  let libres = 0;
  while (planSheet([...items, ...Array(libres + 1).fill(ultima)], { paper: 'letter' }).pages.length === plan.pages.length) libres++;
  return { hojas: plan.pages.length, libres, plan, porHoja: plan.pages.map((p) => p.items.length) };
}

/** La hoja para imprimir (PDF), armada en el dispositivo con los PDF de cada etiqueta. */
export async function hojaPdf(lista) {
  const items = [];
  for (const it of lista) {
    const e = await etiquetaPdf(it.id, it);
    for (let k = 0; k < it.n; k++) items.push({ id: `${it.id}|${it.peso}|${JSON.stringify(it.variante ?? {})}`, pdf: e.pdf, cut: e.result.cut, freeEnd: e.result.freeEnd });
  }
  const { bytes, plan } = await composeSheet(PDFDocument, items, { paper: 'letter', title: 'Etiquetas' });
  return { blob: new Blob([bytes], { type: 'application/pdf' }), plan };
}
