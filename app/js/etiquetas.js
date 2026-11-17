// Etiquetas en la app: datos de cada presentación, vista previa, PDF de cada etiqueta (lo arma el servidor y queda
// guardado en el dispositivo) y la hoja para imprimir (la arma el dispositivo, sin internet).

import { buildLabelData } from '../../src/label-data.js';
import { labelMarkup, layoutLabel } from '../../src/template/label.js';
import { cleanLabel, LABEL_FONTS } from '../../src/render/label-pdf.js';
import { composeSheet } from '../../src/sheet/compose-pdf.js';
import { planSheet } from '../../src/sheet/plan.js';
import { PDFDocument } from '../vendor/pdf-lib.js';
import { estado, tienda, imagenesEtiqueta } from './datos/almacen.js';
import { bd } from './datos/bd.js';
import { api } from './api.js';

export const VERSION_PLANTILLA = 'v0.7-app1';   // cambia → se vuelven a pedir los PDF guardados

/** Índice de la presentación con ese peso (o -1). */
export const indicePeso = (p, peso) => (p.presentations ?? []).findIndex((x) => x.net_weight_g === peso);

/** Partes de la etiqueta que la usuaria quitó (las que la norma no pide). */
export const partes = (p) => ({ highlight: true, follow_us: true, ...(p.label_parts ?? {}) });

/**
 * Datos de la etiqueta de un producto. pedido: { peso, variante: { componente: alternativa } }.
 * Sin peso: la primera presentación.
 */
export function datosEtiqueta(id, { peso, variante } = {}) {
  const p = estado.products.get(id);
  let i = peso == null ? 0 : indicePeso(p, peso);
  const pedido = { productId: id, presentation: Math.max(0, i) };
  if (i < 0) pedido.netWeightG = peso;
  if (variante && Object.keys(variante).length) pedido.variant = variante;
  const d = buildLabelData(tienda(), pedido);
  if (d.incomplete) return d;
  const pt = partes(p);
  if (!pt.highlight) d.front = { ...d.front, highlight: [] };
  return d;
}

/** Empresa como la ve la plantilla (sin Síguenos si el producto lo quitó). */
function empresaPara(id) {
  const pt = partes(estado.products.get(id));
  return pt.follow_us ? estado.company : { ...estado.company, follow_us: {} };
}

// ---- Clave de una etiqueta: cambia con los datos, las imágenes de marca y la plantilla ----
async function sha(texto) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function huellaMarca() {
  const m = estado.marca;
  return m ? JSON.stringify(m.assets) + Object.keys(m.urls).sort().join() : '';
}
export async function claveEtiqueta(id, d) {
  const { alerts, blocking, ...datos } = d;
  return sha(JSON.stringify([VERSION_PLANTILLA, datos, empresaPara(id), huellaMarca()]));
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
  const g = await bd.leer(`etq:${clave}`);
  if (g) return { html: await conImagenes(g.html), result: g.result, guardada: true, datos: d, clave };
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
  const g = await bd.leer(`etq:${clave}`);
  if (g) return g;
  const assets = await imagenesEtiqueta({ comoData: true });
  const r = await api.etiqueta({ labelData: d, company: empresaPara(id), assets, marca: nombresMarca() });
  const reg = { pdf: r.pdf, html: r.html, result: r.result, producto: id, fecha: new Date().toISOString() };
  await bd.guardar(`etq:${clave}`, reg);
  return reg;
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
