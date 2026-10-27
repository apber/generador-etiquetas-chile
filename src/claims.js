// Checks on the label texts (product name, description, highlight, extra text).
// Basis: RSA art. 120 and 120 bis, Manual de Etiquetado MINSAL 2017, Ley 19.496 (truthful claims).
// These checks flag likely problems for review; they do not replace a regulatory review.

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Libre de azúcar" (sin azúcar): less than 0.5 g of sugars per serving (RSA art. 120, strict reading). */
export const SUGAR_FREE_MAX_G_PER_SERVING = 0.5;

const HEALTH_WORDS = /\b(saludables?|san[oa]s?|bienestar|cardioprotect\w*|protege\w*|previene\w*|fortalece\w*|inmun\w*)\b/;
const NO_SUGAR = /\bsin azucar(es)?\b(?! a[nñ]adid)/;
const NO_ADDED_SUGAR = /\bsin azucar(es)? a[nñ]adid/;
const NO_SALT = /\bsin (sal|sodio)\b/;

/** Descriptors of the same nutrient as each seal: not allowed together with that seal. */
const SAME_NUTRIENT = {
  energy: /\b(light|liviano|baj[oa] en (calorias|energia)|reducid[oa] en (calorias|energia)|sin calorias|libre de (calorias|energia))\b/,
  sugars: /\b(light|sin azucar(es)?|baj[oa] en azucar(es)?|reducid[oa] en azucar(es)?|libre de azucar(es)?)\b/,
  saturated_fat: /\b(light|sin grasas?|baj[oa] en grasas?|reducid[oa] en grasas?|libre de grasas?)\b/,
  sodium: /\b(light|sin (sal|sodio)|baj[oa] en (sal|sodio)|reducid[oa] en (sal|sodio)|libre de (sal|sodio))\b/,
};

/**
 * texts: [{ where, text }]; dueSeals: seal ids; added: Set of 'sugar' | 'fat' | 'sodium';
 * sugarsPerServing: grams (or undefined).
 * Returns [{ check, where, text, seal? }].
 */
export function checkClaims(texts, { dueSeals, added, sugarsPerServing }) {
  const found = [];
  for (const { where, text } of texts) {
    if (!text) continue;
    const t = normalize(text);
    if (dueSeals.length && HEALTH_WORDS.test(t)) found.push({ check: 'claim_health', where, text });
    if (NO_SUGAR.test(t) && (added.has('sugar') || (sugarsPerServing ?? 0) >= SUGAR_FREE_MAX_G_PER_SERVING)) {
      found.push({ check: added.has('sugar') ? 'claim_no_sugar_added' : 'claim_no_sugar_natural', where, text });
    }
    if (NO_ADDED_SUGAR.test(t) && added.has('sugar')) found.push({ check: 'claim_no_added_sugar_false', where, text });
    if (NO_SALT.test(t) && added.has('sodium')) found.push({ check: 'claim_no_salt_false', where, text });
    for (const seal of dueSeals) {
      if (SAME_NUTRIENT[seal]?.test(t)) found.push({ check: 'claim_same_nutrient', seal, where, text });
    }
  }
  return found;
}
