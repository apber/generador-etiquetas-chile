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

/** Avisos que piden revisar algo (no confirmados). */
export function avisos(id) {
  const d = datosBase(id);
  if (d.error) return [{ code: 'error', message: d.error }];
  return (d.alerts ?? []).filter((a) => !a.confirmed && !SIN_MARCA.has(a.code) && (a.print === 'ask' || a.print === 'review' || d.incomplete));
}

const orden = (a, b) => a.product_name.localeCompare(b.product_name, 'es');
/** Productos que se venden (con etiqueta), en orden alfabético. */
export const vendibles = () => [...estado.products.values()].filter((p) => p.status !== 'inactive' && p.type !== 'management_only').sort(orden);
/** Los que no se venden solos (componentes). */
export const componentes = () => [...estado.products.values()].filter((p) => p.status === 'inactive').sort(orden);
export const porRevisar = () => vendibles().filter((p) => avisos(p.id).length > 0);
