// Lo común de las etiquetas de la app y de scripts/preparar-etiquetas.mjs: qué datos van a la etiqueta (solo los
// datos leídos que pueden ir), con qué empresa, y la clave de cada etiqueta ya hecha.
//
// Cada etiqueta hecha (PDF vectorial de una presentación: producto + peso, y en una mezcla + variante) se guarda en la
// carpeta de datos como etiquetas/<clave>.pdf y etiquetas/<clave>.json (la etiqueta en HTML, sus medidas y de qué
// producto es). La clave cambia si cambia cualquier cosa que sale en la etiqueta: los datos, la empresa, las imágenes
// de marca o la plantilla. Así una etiqueta hecha por adelantado (o en el otro dispositivo) sirve sin internet.
// Funciona igual en el navegador y en Node (crypto.subtle).

import { buildLabelData } from './label-data.js';

/** Cambia cuando cambia la plantilla: todas las etiquetas hechas se vuelven a hacer. */
export const LABEL_TEMPLATE_VERSION = 'v0.8-app1';

export const LABELS_FOLDER = 'etiquetas';
export const labelFiles = (key) => ({ meta: `${LABELS_FOLDER}/${key}.json`, pdf: `${LABELS_FOLDER}/${key}.pdf` });

// Datos críticos (alérgenos, filas obligatorias de la tabla, origen): solo confirmados. Cualquier dato dudoso: fuera.
const CRITICAL = new Set(['contains', 'may_contain', 'country_of_origin', 'energy_kcal', 'protein_g', 'total_fat_g',
  'available_carbohydrates_g', 'total_sugars_g', 'sodium_mg']);

/** La ficha como va a la etiqueta: sin los datos leídos que todavía no pueden ir (field_states). */
export function filterForLabel(p) {
  const st = p.field_states;
  if (!st || !Object.values(st).some((s) => s !== 'confirmed')) return p;
  const q = structuredClone(p);
  for (const [k, s] of Object.entries(st)) {
    if (s === 'confirmed' || (s === 'unconfirmed' && !CRITICAL.has(k))) continue;
    if (q.nutrition?.per_100g && k in q.nutrition.per_100g) delete q.nutrition.per_100g[k];
    else if (k === 'serving') q.nutrition.serving = null;
    else if (q.composition && k in q.composition) q.composition[k] = null;
  }
  return q;
}

/** Partes de la etiqueta que la usuaria quitó (las que la norma no pide). */
export const labelParts = (p) => ({ highlight: true, follow_us: true, ...(p?.label_parts ?? {}) });

/**
 * Datos de la etiqueta de una presentación. store: { company, products (ya filtradas con filterForLabel), catalog }.
 * pedido: { peso, variante: { componente: alternativa } }. Sin peso: la primera presentación.
 */
export function appLabelData(store, id, { peso, variante } = {}) {
  const p = store.products.get(id);
  const i = peso == null ? 0 : (p.presentations ?? []).findIndex((x) => x.net_weight_g === peso);
  const pedido = { productId: id, presentation: Math.max(0, i) };
  if (i < 0) pedido.netWeightG = peso;
  if (variante && Object.keys(variante).length) pedido.variant = variante;
  const d = buildLabelData(store, pedido);
  if (d.incomplete) return d;
  if (!labelParts(p).highlight) d.front = { ...d.front, highlight: [] };
  return d;
}

/** La empresa como la ve la plantilla (sin Síguenos si el producto lo quitó). */
export function companyForLabel(company, product) {
  return labelParts(product).follow_us ? company : { ...company, follow_us: {} };
}

/** SHA-256 en hexadecimal de un texto o de bytes (ArrayBuffer o Uint8Array). */
export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const b = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Nombres de los archivos de marca que usa la etiqueta (los de assets.json). */
export function brandFileNames(assets) {
  if (!assets) return [];
  return [assets.logo, assets.signatureIcon, ...Object.values(assets.seals ?? {}), ...Object.values(assets.icons ?? {})]
    .filter(Boolean);
}

/**
 * Huella de las imágenes de marca: qué archivo va en cada lugar y el contenido de cada uno.
 * hashes: { archivo: sha256Hex(contenido) }. Otros archivos de la carpeta marca/ no cuentan.
 */
export function brandFingerprint(assets, hashes) {
  if (!assets) return '';
  const { logo = null, signatureIcon = null, seals = {}, icons = {} } = assets;
  return JSON.stringify([{ logo, signatureIcon, seals, icons }, brandFileNames(assets).sort().map((n) => [n, hashes[n] ?? null])]);
}

/** Clave de una etiqueta (32 caracteres). company: la de companyForLabel; brand: brandFingerprint. */
export async function labelKey(labelData, company, brand) {
  const { alerts, blocking, ...datos } = labelData;
  const { barcodes, ...empresa } = company ?? {};   // la lista de códigos libres no sale en la etiqueta
  return (await sha256Hex(JSON.stringify([LABEL_TEMPLATE_VERSION, datos, empresa, brand]))).slice(0, 32);
}

/** Lo que se guarda junto al PDF (etiquetas/<clave>.json). */
export function labelMeta({ productId, peso, variante, html, result, fecha }) {
  return { producto: productId, peso, variante: variante && Object.keys(variante).length ? variante : {}, plantilla: LABEL_TEMPLATE_VERSION,
    fecha, html, result };
}
