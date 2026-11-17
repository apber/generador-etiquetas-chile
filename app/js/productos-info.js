// Lo que la app necesita saber de cada producto: orden, si tiene algo por revisar y los avisos para la usuaria.
import { estado, tienda } from './datos/almacen.js';
import { buildLabelData } from '../../src/label-data.js';

// Avisos que no piden nada a la usuaria (criterio con las pymes): se ven en su lugar, sin la marca «Por revisar»
const SIN_MARCA = new Set(['missing_ring_color', 'missing_barcode', 'reference_data', 'fiber_omitted', 'assumed_zero', 'seal_removed', 'inactive']);

let cache = { version: -1, datos: new Map() };
/** Datos de la etiqueta con su primera presentación (con caché mientras no cambie nada). */
export function datosBase(id) {
  if (cache.version !== estado.version) cache = { version: estado.version, datos: new Map() };
  if (!cache.datos.has(id)) {
    let d;
    try { d = buildLabelData(tienda(), { productId: id }); } catch (e) { d = { error: String(e.message ?? e), alerts: [] }; }
    cache.datos.set(id, d);
  }
  return cache.datos.get(id);
}

// Avisos de dato faltante que en realidad son un dato leído sin confirmar (se muestran como «Por confirmar» o «Dudoso»)
const CAMPO_AVISO = { missing_contains: 'contains', missing_may_contain: 'may_contain', missing_origin: 'country_of_origin',
  missing_ingredients: 'ingredients', missing_serving: 'serving' };
const campoDe = (a) => (a.code.startsWith('missing_nutrient') ? a.params?.key : a.code === 'seal_unknown' ? a.params?.nutrient : CAMPO_AVISO[a.code]);

/** Avisos que piden revisar algo (no confirmados), sin los de datos leídos que se muestran por su estado. */
export function avisos(id) {
  const d = datosBase(id);
  if (d.error) return [{ code: 'error', message: d.error }];
  const st = estado.products.get(id)?.field_states ?? {};
  return (d.alerts ?? []).filter((a) => !a.confirmed && !SIN_MARCA.has(a.code) && (a.print === 'ask' || a.print === 'review' || d.incomplete)
    && !(st[campoDe(a)] && st[campoDe(a)] !== 'confirmed'));
}

/** Datos leídos sin confirmar: { dudosos: [clave], porConfirmar: [clave] }. */
export function estadosPendientes(id) {
  const st = estado.products.get(id)?.field_states ?? {};
  const e = Object.entries(st);
  return { dudosos: e.filter(([, s]) => s === 'doubtful').map(([k]) => k), porConfirmar: e.filter(([, s]) => s === 'unconfirmed').map(([k]) => k) };
}
const pendiente = (id) => { const e = estadosPendientes(id); return avisos(id).length + e.dudosos.length + e.porConfirmar.length; };

const orden = (a, b) => a.product_name.localeCompare(b.product_name, 'es');
/** Productos que se venden (con etiqueta), en orden alfabético. */
export const vendibles = () => [...estado.products.values()].filter((p) => p.status !== 'inactive' && p.type !== 'management_only').sort(orden);
/** Los que no se venden solos (componentes). */
export const componentes = () => [...estado.products.values()].filter((p) => p.status === 'inactive').sort(orden);
export const porRevisar = () => vendibles().filter((p) => pendiente(p.id) > 0);
export const tienePendientes = (id) => pendiente(id) > 0;
