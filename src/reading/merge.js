import { rowKey, normalize } from './table.js';

// Close-up photo of one section (stage 7e): when a section of a reading is doubtful, the person takes
// a close-up of only that part (a section, a sentence, a row or a single number); it is read alone and
// replaces just what it shows in the earlier reading.

const SECTION_KEYS = {
  allergens: ['contains_statement', 'may_contain_statement', 'other_allergen_statements'],
  table: ['nutrition_table'],
  ingredients: ['ingredients'],
};

/**
 * Close-up of part of a table (a few rows, one row, one number): the rows it shows replace the same rows
 * of the earlier reading (matched by nutrient); the other rows, the serving line and headers are kept
 * unless the close-up shows them.
 */
function mergeRows(baseTable, closeTable) {
  const key = (r) => rowKey(r.label, r.unit) ?? normalize(r.label);
  const fresh = new Map((closeTable.rows ?? []).map((r) => [key(r), r]));
  const rows = (baseTable.rows ?? []).map((r) => fresh.get(key(r)) ?? r);
  const known = new Set(rows.map(key));
  for (const [k, r] of fresh) if (!known.has(k)) rows.push(r);
  const pick = (f) => (closeTable[f] != null && closeTable[f] !== '' ? closeTable[f] : baseTable[f]);
  return {
    ...baseTable,
    serving_text: closeTable.serving_text?.text ? closeTable.serving_text : baseTable.serving_text,
    serving_g: pick('serving_g'),
    household_measure: pick('household_measure'),
    per_100_header: pick('per_100_header'),
    per_serving_header: pick('per_serving_header'),
    rows,
  };
}

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
  if (focus === 'table' && base.nutrition_table) {
    out.nutrition_table = mergeRows(base.nutrition_table, closeUp.nutrition_table);
    return { transcription: out, replaced: true };
  }
  if (focus === 'allergens') {
    // A close-up of one sentence replaces that sentence only; the others are kept.
    for (const k of ['contains_statement', 'may_contain_statement']) out[k] = closeUp[k] ?? base[k] ?? null;
    const others = closeUp.other_allergen_statements ?? [];
    out.other_allergen_statements = others.length ? others : (base.other_allergen_statements ?? []);
    return { transcription: out, replaced: true };
  }
  for (const k of keys) out[k] = closeUp[k] ?? (Array.isArray(base[k]) ? [] : null);
  return { transcription: out, replaced: true };
}
