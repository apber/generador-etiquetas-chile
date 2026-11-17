// Texto corto de un aviso para la usuaria y el nombre de su botón.
import { T } from '../textos.js';
import { nutrientName } from '../../src/i18n/es.js';

export function textoAviso(a) {
  const A = T.avisos;
  const base = a.code.split(':')[0];
  if (base === 'missing_may_contain' || base === 'missing_contains' || base === 'missing_origin') return { texto: A[base], accion: A.confirmar };
  if (base === 'missing_ingredients' || base === 'missing_serving') return { texto: A[base], accion: A.revisar };
  if (base === 'missing_nutrient') return { texto: A.missing_nutrient(a.params?.key ? nutrientName(a.params.key) : 'un dato'), accion: A.revisar };
  if (base.startsWith('inconsistent')) return { texto: A.inconsistent, accion: A.revisar };
  if (base.startsWith('claim')) return { texto: A.claim, accion: A.revisar };
  return { texto: a.message || A.otro, accion: A.revisar };
}
