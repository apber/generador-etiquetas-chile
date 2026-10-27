// Ingredient lists. Allergens are marked with braces {…} and print in bold.

/** Splits a list on the commas that are not inside parentheses. */
export function splitTopLevel(text) {
  const items = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

/** Problems with braces or parentheses (unbalanced, nested braces). Empty if OK. */
export function formatProblems(text) {
  const problems = [];
  let paren = 0;
  let brace = 0;
  for (const ch of text) {
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '{') { brace++; if (brace > 1) problems.push('nested_braces'); }
    if (ch === '}') brace--;
    if (paren < 0 || brace < 0) { problems.push('unbalanced'); break; }
  }
  if (paren !== 0 || brace !== 0) problems.push('unbalanced');
  return [...new Set(problems)];
}

/** True if the whole list is one ingredient marked as an allergen, e.g. "{maní}". */
export const isWholeMarked = (text) => /^\{[^{}]+\}$/.test(text.trim());

/** True if the first ingredient of the list is itself an allergen, e.g. "{pistacho} con cáscara, sal". */
export const startsWithAllergen = (text) => /^\{[^{}]+\}/.test(text.trim());

/**
 * How a component appears in a mix's ingredient list:
 *  - one ingredient, no sub-ingredients -> its name as ingredient ("almendras", bold if it was marked)
 *  - otherwise -> "name (its ingredients)", e.g. "pasas rubias (pasas, aceite de maravilla, {dióxido de azufre})"
 */
export function componentAsIngredient(name, ingredients) {
  const items = splitTopLevel(ingredients);
  if (items.length === 1 && !items[0].includes('(')) {
    return isWholeMarked(items[0]) ? `{${name}}` : name;
  }
  return `${name} (${ingredients})`;
}

/**
 * Splits marked text into segments for printing: [{ text, bold }].
 * "{maní}, sal" -> [{text:'maní', bold:true}, {text:', sal', bold:false}]
 */
export function segments(text) {
  const out = [];
  const re = /\{([^{}]*)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

/** Text without the braces. */
export const plainText = (text) => text.replace(/[{}]/g, '');

/** Number of words (to estimate if the list fits in the ingredients panel). */
export const wordCount = (text) => plainText(text).split(/\s+/).filter(Boolean).length;
