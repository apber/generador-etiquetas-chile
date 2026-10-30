// Transcription of a supplier label (what the AI returns, see schema.js) → draft record + alerts.
// The draft holds only what was read; the person confirms it before it is saved (stage 7f).

import { readTable } from './table.js';
import {
  allergensInStatement, allergensInIngredients, containsIds, formatIngredients,
  addedFromIngredients, formatStorage, shelfLife,
} from './text.js';
import { checkValues, declaredValues } from '../nutrients.js';
import { evaluateSeals } from '../seals.js';
import { catalogIndex } from '../allergens.js';
import { READING_ALERTS } from '../i18n/es-reading.js';
import { ALERT_TEXTS, SEAL_NAMES } from '../i18n/es.js';

/** Which alerts stop saving until the person acts (the others are shown but do not stop). */
const BLOCKING = new Set(['retake', 'review', 'fallback']);

function alert(code, data = {}) {
  const t = READING_ALERTS[code];
  return {
    code,
    action: t.action,
    blocking: BLOCKING.has(t.action),
    message: t.message(data),
    detail: t.detail(data),
    data,
  };
}

/**
 * options: {
 *   catalog: data/allergens.json,
 *   productName: name given by the user (helps put the main allergen first),
 *   sourceId, sourceKind ('label_photo' | 'web_capture' | 'technical_sheet'), files: [names], date: 'YYYY-MM-DD',
 *   model, promptVersion
 * }
 * Returns { draft, fields, alerts, summary }.
 */
export function transcriptionToDraft(t, options) {
  const { catalog } = options;
  const sourceId = options.sourceId ?? 'r1';
  const alerts = [];

  if (options.fallback) alerts.push(alert('fallback_model', { model: options.model }));

  // Image problems reported by the AI
  const withProblems = (t.images ?? []).filter((i) => i.problems?.length);
  if (withProblems.length) alerts.push(alert('image_problems', { list: withProblems }));

  // Nutrition table
  const table = readTable(t.nutrition_table);
  for (const issue of table.issues) {
    if (issue.code !== 'row_missing' && READING_ALERTS[issue.code]) alerts.push(alert(issue.code, issue));
  }
  const missingRows = table.issues.filter((i) => i.code === 'row_missing');
  if (missingRows.length) {
    alerts.push(alert('row_missing', { keys: missingRows.map((i) => i.key), fields: missingRows.map((i) => i.key),
      becauseFat: missingRows.filter((i) => i.mandatoryBecauseFat).map((i) => i.key) }));
  }
  resolveUnspecifiedCarbs(table, alerts);
  if (table.serving?.g && !table.serving.householdMeasure) alerts.push(alert('no_household_measure', { g: table.serving.g }));
  const byStatus = { doubtful: [], mismatch: [], derived: [] };
  for (const [key, f] of Object.entries(table.fields)) {
    const item = { key, text100: f.per100?.text, textServing: f.perServing?.text, servingG: table.serving?.g };
    if (f.status === 'doubtful') byStatus.doubtful.push(item);
    if (f.status === 'mismatch' && f.note !== 'columns_disagree_no_serving') byStatus.mismatch.push({ ...item, expected: Math.round(((f.per100.value * table.serving.g) / 100) * 100) / 100 });
    if (f.status === 'derived') byStatus.derived.push({ ...item, value: f.value });
  }
  for (const [status, items] of Object.entries(byStatus)) {
    if (items.length) alerts.push(alert(`value_${status}`, { keys: items.map((i) => i.key), fields: items.map((i) => i.key), items }));
  }
  for (const c of checkValues(table.values)) {
    const textT = ALERT_TEXTS[`inconsistent_${c.check}`];
    alerts.push(alert('table_check', { check: c.check, fields: c.fields, text: textT ? textT.detail(c.data) : c.check }));
  }

  // Ingredients and allergens
  const ingredientsText = t.ingredients?.text ?? null;
  const ingredients = formatIngredients(ingredientsText, catalog);
  if (!ingredients) alerts.push(alert('no_ingredients'));
  else if (t.ingredients.legibility !== 'clear' || ingredientsText.includes('?')) alerts.push(alert('ingredients_doubtful', { text: ingredientsText }));

  const index = catalogIndex(catalog);
  const names = (ids) => ids.map((id) => index.get(id)?.name.es ?? id).join(', ');
  const inIngredients = containsIds([...new Set(allergensInIngredients(ingredientsText ?? '', catalog).map((h) => h.id))]);
  // Allergen sentences are often in tiny print: a doubtful or repeated word may hide a missing allergen.
  const checkStatement = (block) => {
    if (!block?.text) return;
    const st = allergensInStatement(block.text, catalog);
    if (block.legibility !== 'clear' || block.text.includes('?') || st.repeated.length) {
      alerts.push(alert('allergen_statement_doubtful', { statement: block.text, repeated: st.repeated.map((id) => index.get(id)?.name.es ?? id) }));
    }
  };
  const others = (t.other_allergen_statements ?? []).map((x) => (typeof x === 'string' ? { text: x, legibility: 'clear' } : x));
  [t.contains_statement, t.may_contain_statement, ...others].forEach(checkStatement);
  const containsSt = allergensInStatement(t.contains_statement?.text, catalog);
  for (const phrase of containsSt.unknown) alerts.push(alert('allergen_unknown', { phrase, statement: t.contains_statement.text }));
  let contains;
  if (t.contains_statement?.text) {
    contains = containsIds(containsSt.ids);
    const extra = inIngredients.filter((id) => !contains.includes(id));
    if (extra.length) {
      contains.push(...extra);
      alerts.push(alert('contains_added_from_ingredients', { ids: extra, names: names(extra) }));
    }
  } else {
    contains = mainFirst(inIngredients, options.productName, catalog);
    if (contains.length) alerts.push(alert('contains_from_ingredients', { ids: contains, names: names(contains) }));
  }
  contains = mainFirst(contains, options.productName, catalog);

  let mayContain = null;
  if (t.may_contain_statement?.text) {
    const st = allergensInStatement(t.may_contain_statement.text, catalog);
    for (const phrase of st.unknown) alerts.push(alert('allergen_unknown', { phrase, statement: t.may_contain_statement.text }));
    mayContain = st.ids;
  }
  for (const { text: statement } of others) {
    const st = allergensInStatement(statement, catalog);
    for (const phrase of st.unknown) alerts.push(alert('allergen_unknown', { phrase, statement }));
    if (!st.ids.length) continue;
    mayContain = [...new Set([...(mayContain ?? []), ...st.ids])];
    alerts.push(alert('may_contain_from_statement', { statement, ids: st.ids }));
  }
  if (mayContain) mayContain = mayContain.filter((id) => !contains.includes(id));
  else alerts.push(alert('no_may_contain'));

  // Origin
  let country = null;
  if (t.origin?.explicit && t.origin.country) country = t.origin.country;
  else if (t.origin?.text) alerts.push(alert('origin_not_explicit', { text: t.origin.text }));
  else alerts.push(alert('no_origin'));

  // In shell (from the product name the user gave or the label)
  const inShell = /c[aá]scara/i.test(`${options.productName ?? ''} ${t.product_name ?? ''}`) && !/sin c[aá]scara/i.test(`${options.productName ?? ''} ${t.product_name ?? ''}`);
  if (inShell) alerts.push(alert('in_shell'));

  // Added sugar, fat, salt and seals compared with the supplier's
  const added = addedFromIngredients(ingredients);
  if (t.warning_seals?.length && Object.keys(table.values).length) {
    const seals = evaluateSeals(table.values, declaredValues(table.values), added).filter((s) => s.due).map((s) => SEAL_NAMES[s.id]);
    const supplier = t.warning_seals.map((s) => s.toUpperCase().replace(/\s+/g, ' ').trim()).sort();
    const computed = [...seals].sort();
    if (supplier.join('|') !== computed.join('|')) {
      alerts.push(alert('seals_differ', { supplier: supplier.join(', ') || 'ninguno', computed: computed.join(', ') || 'ninguno' }));
    }
  }
  if (t.front_claims?.length) alerts.push(alert('supplier_claims', { claims: t.front_claims }));
  if (t.remarks) alerts.push(alert('remarks', { text: t.remarks }));

  // Draft (record format; only what was read)
  const per100 = {};
  for (const [key, v] of Object.entries(table.values)) per100[key] = { value: v, source: sourceId };
  const life = shelfLife(t.shelf_life_text, t.production_date, t.expiry_date);
  const draft = {
    composition: {
      ingredients,
      contains,
      may_contain: mayContain,
      added,
      country_of_origin: country,
      in_shell: inShell,
      storage: formatStorage(t.storage?.text),
      usage_instructions: t.usage_instructions?.text ?? null,
      supplier_shelf_life: life ? { amount: life.amount, unit: life.unit } : null,
      source: sourceId,
    },
    nutrition: {
      serving: table.serving?.g ? { g: table.serving.g, household_measure: table.serving.householdMeasure, source: sourceId } : null,
      per_100g: per100,
    },
    sources: [{
      id: sourceId,
      level: 1,
      kind: options.sourceKind ?? 'label_photo',
      from: supplierName(t.supplier),
      date: options.date ?? new Date().toISOString().slice(0, 10),
      files: options.files ?? [],
      note: `Lectura automática (${options.model ?? 'IA'}, instrucciones v${options.promptVersion ?? '?'}).`,
    }],
  };

  // One close-up request per allergen sentence
  const doubtfulStatements = new Set(alerts.filter((a) => a.code === 'allergen_statement_doubtful').map((a) => a.data.statement));
  for (let i = alerts.length - 1; i >= 0; i--) {
    if (alerts[i].code === 'allergen_unknown' && doubtfulStatements.has(alerts[i].data.statement)) alerts.splice(i, 1);
  }

  const blocking = alerts.filter((a) => a.blocking).length;
  return {
    draft,
    fields: table.fields,
    serving: table.serving,
    alerts,
    summary: { blocking, confirm: alerts.filter((a) => a.action === 'confirm').length, ready: blocking === 0 },
  };
}

function supplierName(s) {
  if (!s?.name) return 'Proveedor (sin nombre en la foto)';
  return s.name;
}

/**
 * "H. de C." without "disponibles": the value is kept as printed. If the energy fits clearly better with
 * the fiber subtracted, it may be the total: the person checks it (the value is never changed silently).
 */
function resolveUnspecifiedCarbs(table, alerts) {
  const f = table.fields.available_carbohydrates_g;
  const v = table.values;
  if (f?.note !== 'unspecified') return;
  if ([v.dietary_fiber_g, v.energy_kcal, v.protein_g, v.total_fat_g, v.available_carbohydrates_g].some((x) => x === undefined)) return;
  const base = 4 * v.protein_g + 9 * v.total_fat_g;
  const asPrinted = base + 4 * v.available_carbohydrates_g;
  const minusFiber = base + 4 * (v.available_carbohydrates_g - v.dietary_fiber_g);
  const tolerance = Math.max(0.1 * v.energy_kcal, 5);
  if (Math.abs(asPrinted - v.energy_kcal) > tolerance && Math.abs(minusFiber - v.energy_kcal) <= tolerance) {
    alerts.push(alert('carbs_maybe_total', { asPrinted: Math.round(asPrinted), minusFiber: Math.round(minusFiber), declared: v.energy_kcal, fields: ['available_carbohydrates_g'] }));
  }
}

/** CONTIENE: the allergen that is the product itself first (maní in "maní con chocolate"), then in reading order. */
function mainFirst(ids, productName, catalog) {
  if (!productName || ids.length < 2) return ids;
  const inName = allergensInIngredients(productName.toLowerCase(), catalog).map((h) => h.id);
  const main = containsIds(inName).find((id) => ids.includes(id));
  return main ? [main, ...ids.filter((id) => id !== main)] : ids;
}
