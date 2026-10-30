// Close-up photo of one section (stage 7e): when a section of a reading is doubtful, the person takes
// a close-up of only that part; it is read alone and replaces that section in the earlier reading.

const SECTION_KEYS = {
  allergens: ['contains_statement', 'may_contain_statement', 'other_allergen_statements'],
  table: ['nutrition_table'],
  ingredients: ['ingredients'],
};

/** Which close-up an alert asks for (null if a close-up does not help). */
export function focusFor(alertCode) {
  if (/^allergen|contains_|may_contain/.test(alertCode)) return 'allergens';
  if (/^(value_|table_check|columns_disagree|serving_|header_|row_)/.test(alertCode)) return 'table';
  if (/^ingredients_/.test(alertCode)) return 'ingredients';
  return null;
}

/**
 * base: earlier transcription; closeUp: transcription of the close-up (read with focus).
 * The section is replaced only if the close-up found it; the rest of the base is kept.
 * Returns { transcription, replaced: boolean }.
 */
export function mergeCloseUp(base, closeUp, focus) {
  const keys = SECTION_KEYS[focus];
  if (!keys) throw new Error(`Unknown section: ${focus}`);
  const found = keys.some((k) => (Array.isArray(closeUp[k]) ? closeUp[k].length : closeUp[k]));
  if (!found) return { transcription: base, replaced: false };
  const out = { ...base, images: [...(base.images ?? []), ...(closeUp.images ?? []).map((i) => ({ ...i, closeUp: focus }))] };
  for (const k of keys) out[k] = closeUp[k] ?? (Array.isArray(base[k]) ? [] : null);
  return { transcription: out, replaced: true };
}
