// Compares two readings of the same product (e.g. the fast reader and, later, the normal one).
// What agrees is confirmed by two models; what differs is what the person should check with the bag.

import { NUTRIENTS } from '../nutrients.js';

const valueOf = (f) => (!f || f.status === 'missing' ? null : f.value ?? null);
const list = (x) => (x === null || x === undefined ? null : [...x].sort().join(', '));

/**
 * a, b: drafts from transcriptionToDraft.
 * Returns [{ field, a, b }] with field = a nutrient key, 'serving_g', 'ingredients', 'contains',
 * 'may_contain' or 'country_of_origin'. Empty = the two readings agree.
 */
export function compareDrafts(a, b) {
  const out = [];
  for (const n of NUTRIENTS) {
    const va = valueOf(a.fields?.[n.key]);
    const vb = valueOf(b.fields?.[n.key]);
    if (va !== vb) out.push({ field: n.key, a: va, b: vb });
  }
  const sa = a.serving?.g ?? null;
  const sb = b.serving?.g ?? null;
  if (sa !== sb) out.push({ field: 'serving_g', a: sa, b: sb });
  const ca = a.draft?.composition ?? {};
  const cb = b.draft?.composition ?? {};
  const norm = (s) => (s ? s.replace(/\s+/g, ' ').trim().toLowerCase() : null);
  if (norm(ca.ingredients) !== norm(cb.ingredients)) out.push({ field: 'ingredients', a: ca.ingredients ?? null, b: cb.ingredients ?? null });
  for (const k of ['contains', 'may_contain']) {
    if (list(ca[k]) !== list(cb[k])) out.push({ field: k, a: list(ca[k]), b: list(cb[k]) });
  }
  if ((ca.country_of_origin ?? null) !== (cb.country_of_origin ?? null)) out.push({ field: 'country_of_origin', a: ca.country_of_origin ?? null, b: cb.country_of_origin ?? null });
  return out;
}
