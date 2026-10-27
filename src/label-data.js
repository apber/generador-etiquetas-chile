// Builds everything a label needs from a product record: the derived data
// (table, servings, seals, slogan, allergens, packer and origin text) and the alerts.
// Nothing here is stored back in the record.

import { DEFAULT_DECIMALS, formatPlain, servingsPerPackage } from './rounding.js';
import { NUTRIENT_KEYS, valuesOf, mixValues, nutritionTable, declaredValues, checkValues } from './nutrients.js';
import { evaluateSeals, LIMITS_SOLID } from './seals.js';
import { catalogIndex, cleanMayContain, allergenNames, mixAllergens } from './allergens.js';
import { componentAsIngredient, formatProblems, segments, startsWithAllergen, wordCount, plainText } from './ingredients.js';
import { checkClaims } from './claims.js';
import { ALERT_TEXTS, LABEL_TEXT, SEAL_NAMES } from './i18n/es.js';

export const DEFAULT_OPTIONS = {
  decimals: DEFAULT_DECIMALS,
  /** 'when_not_exact' (default) or 'when_rounded_up' (legal minimum). */
  servingsApprox: 'when_not_exact',
  /** Mix title: 'in_country' ("ELABORADO Y ENVASADO EN CHILE POR:") or 'plain' ("ELABORADO Y ENVASADO POR:"). */
  mixPackerTitle: 'in_country',
  limits: LIMITS_SOLID,
};

/**
 * kind: missing | inconsistent | reference | regulatory | info
 * print: 'ask' (warn; "Imprimir igual" / "Cancelar"), 'review' (fix it or confirm it first), 'none'.
 */
const ALERT_META = {
  missing_origin: ['missing', 'ask'],
  missing_ingredients: ['missing', 'ask'],
  missing_contains: ['missing', 'ask'],
  missing_may_contain: ['missing', 'ask'],
  missing_nutrient: ['missing', 'ask'],
  missing_serving: ['missing', 'review'],
  missing_edible_part: ['missing', 'ask'],
  missing_component: ['missing', 'review'],
  missing_ring_color: ['missing', 'none'],
  missing_barcode: ['missing', 'ask'],
  seal_unknown: ['missing', 'review'],
  inconsistent_energy: ['inconsistent', 'review'],
  inconsistent_fat_parts: ['inconsistent', 'review'],
  inconsistent_fat_parts_low: ['inconsistent', 'ask'],
  inconsistent_sugars: ['inconsistent', 'review'],
  inconsistent_over_100g: ['inconsistent', 'review'],
  inconsistent_ingredients_format: ['inconsistent', 'review'],
  reference_data: ['reference', 'ask'],
  claim_health: ['regulatory', 'review'],
  claim_no_sugar_added: ['regulatory', 'review'],
  claim_no_sugar_natural: ['regulatory', 'review'],
  claim_no_added_sugar_false: ['regulatory', 'review'],
  claim_no_salt_false: ['regulatory', 'review'],
  claim_same_nutrient: ['regulatory', 'review'],
  seal_removed: ['regulatory', 'none'],
  over_limit_not_added: ['info', 'none'],
  fiber_omitted: ['info', 'none'],
  assumed_zero: ['info', 'none'],
  component_storage: ['info', 'none'],
  serving_exceeds_package: ['info', 'none'],
  inactive: ['info', 'ask'],
};

/** Decision code that removes a seal that is due: confirmed_alerts[].alert = "remove_seal:<seal id>". */
export const REMOVE_SEAL = (seal) => `remove_seal:${seal}`;

function makeAlert(base, suffix, params, owner, fields = []) {
  const [kind, print] = ALERT_META[base];
  const texts = ALERT_TEXTS[base];
  const ownCode = suffix ? `${base}:${suffix}` : base;
  const code = params.component ? `${params.component}/${ownCode}` : ownCode;
  const decision = owner?.confirmed_alerts?.find((a) => a.alert === ownCode);
  return {
    code,
    kind,
    print: decision && print !== 'none' ? 'none' : print,
    confirmed: decision ? { decision: decision.decision, date: decision.date, note: decision.note } : null,
    fields,
    params,
    message: texts.message(params),
    detail: texts.detail(params),
  };
}

/** Composition, values and alerts of one simple record (as a product or as a mix component). */
function simpleData(product, ctx) {
  const comp = product.composition ?? {};
  const alerts = [];
  const where = ctx ? { component: product.id, componentName: comp.name_as_ingredient ?? product.product_name } : {};
  const add = (base, suffix, params = {}, fields = []) => alerts.push(makeAlert(base, suffix, { ...where, ...params }, product, fields));

  if (comp.ingredients == null) add('missing_ingredients', null, {}, ['composition.ingredients']);
  else if (formatProblems(comp.ingredients).length) add('inconsistent_ingredients_format', null, {}, ['composition.ingredients']);
  if (comp.contains == null) add('missing_contains', null, {}, ['composition.contains']);
  if (comp.may_contain == null) add('missing_may_contain', null, {}, ['composition.may_contain']);
  if (comp.country_of_origin == null) add('missing_origin', null, {}, ['composition.country_of_origin']);

  const values = valuesOf(product);
  for (const c of checkValues(values)) add(`inconsistent_${c.check}`, null, c.data, c.fields.map((f) => `nutrition.per_100g.${f}`));

  // Data from sources below level 1 (reference data)
  const sources = new Map((product.sources ?? []).map((s) => [s.id, s]));
  const bySource = new Map();
  const note = (sourceId, field) => {
    const s = sources.get(sourceId);
    if (!s || s.level === 1) return;
    if (!bySource.has(s.id)) bySource.set(s.id, { source: s, fields: [] });
    bySource.get(s.id).fields.push(field);
  };
  if (comp.source) note(comp.source, 'composición');
  if (product.nutrition?.serving?.source) note(product.nutrition.serving.source, 'porción');
  for (const key of NUTRIENT_KEYS) {
    const v = product.nutrition?.per_100g?.[key];
    if (v) note(v.source, key);
  }
  for (const { source, fields } of bySource.values()) {
    add('reference_data', source.id, { level: source.level, from: source.from, fields }, fields);
  }

  return { product, comp, values, alerts };
}

/** Texts for the ingredients panel from contains / may contain ids. */
function allergenTexts(containsIds, mayIds, index) {
  const containsNames = allergenNames(containsIds, containsIds, index);
  const mayNames = allergenNames(mayIds, containsIds, index);
  return {
    contains: { ids: containsIds, names: containsNames, text: containsNames.length ? containsNames.join(', ') : null },
    mayContain: { ids: mayIds, names: mayNames, text: mayNames.length ? mayNames.join(', ') : null },
  };
}

/**
 * store: { company, products: Map(id -> record), catalog }
 * request: { productId, presentation (index, default 0), netWeightG (override), variant: { componentId: alternativeId } }
 * Returns the label data with alerts; never writes to the records.
 */
export function buildLabelData(store, request, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { company, products, catalog } = store;
  const product = products.get(request.productId);
  if (!product) throw new Error(`Unknown product "${request.productId}"`);
  if (product.type === 'management_only') throw new Error(`"${product.id}" is a management-only product: it has no label`);

  const presentation = product.presentations[request.presentation ?? 0];
  if (!presentation) throw new Error(`"${product.id}" has no presentation ${request.presentation}`);
  const netWeightG = request.netWeightG ?? presentation.net_weight_g;
  const index = catalogIndex(catalog);
  const alerts = [];
  const add = (base, suffix, params = {}, fields = []) => alerts.push(makeAlert(base, suffix, params, product, fields));

  if (product.status === 'inactive') add('inactive');
  if (!product.ring_color) add('missing_ring_color', null, {}, ['ring_color']);
  if (!presentation.barcode) add('missing_barcode', null, {}, ['presentations.barcode']);

  // --- Composition and values per 100 g ---------------------------------------
  let raw;
  let ingredientsText;
  let containsIds;
  let mayIds;
  let added;
  let origin;
  let storage;
  let inShell = false;
  let edibleGPer100g = null;
  let variantUsed = null;
  let missingIn = new Map(); // nutrient key -> components that lack it (mixes)

  if (product.type === 'simple') {
    const d = simpleData(product, null);
    alerts.push(...d.alerts);
    raw = d.values;
    ingredientsText = d.comp.ingredients ?? null;
    containsIds = d.comp.contains ?? [];
    mayIds = cleanMayContain(containsIds, d.comp.may_contain ?? []);
    added = d.comp.added ?? [];
    origin = { title: LABEL_TEXT.origin, text: d.comp.country_of_origin ?? null };
    storage = d.comp.storage ?? company.default_storage;
    inShell = !!d.comp.in_shell;
    edibleGPer100g = d.comp.edible_g_per_100g ?? null;
  } else {
    // Mix: resolve the variant and the component records
    const variant = request.variant ?? {};
    const chosen = product.recipe.components.map((c, order) => {
      const alt = variant[c.product];
      if (alt && !(c.alternatives ?? []).includes(alt)) throw new Error(`"${alt}" is not an alternative of "${c.product}" in "${product.id}"`);
      return { recipeProduct: c.product, id: alt ?? c.product, g: c.g_per_100g, order };
    });
    variantUsed = chosen.map((c) => ({ component: c.recipeProduct, used: c.id }));
    const missingComponents = chosen.filter((c) => !products.get(c.id));
    for (const c of missingComponents) add('missing_component', c.id, { componentId: c.id });
    if (missingComponents.length) {
      return { productId: product.id, type: product.type, incomplete: true, variant: variantUsed, alerts, blocking: blocking(alerts) };
    }

    // Heaviest first; ties keep the recipe order
    const parts = chosen
      .map((c) => ({ ...c, data: simpleData(products.get(c.id), true) }))
      .sort((a, b) => b.g - a.g || a.order - b.order);
    for (const p of parts) alerts.push(...p.data.alerts);

    const mixed = mixValues(parts.map((p) => ({ id: p.id, values: p.data.values, g: p.g })));
    raw = mixed.values;
    if (mixed.fiberOmitted) add('fiber_omitted', null, { components: mixed.fiberOmitted });
    for (const z of mixed.assumedZero) add('assumed_zero', z.key, z);
    missingIn = new Map(mixed.missing.map((m) => [m.key, m.components]));

    const named = parts.map((p) => ({ p, name: p.data.comp.name_as_ingredient ?? p.data.product.product_name }));
    const known = named.filter(({ p }) => p.data.comp.ingredients != null);
    ingredientsText = known.length === parts.length
      ? known.map(({ p, name }) => componentAsIngredient(name, p.data.comp.ingredients)).join(', ')
      : null;

    const al = mixAllergens(parts.map((p) => ({
      id: p.id,
      contains: p.data.comp.contains,
      mayContain: p.data.comp.may_contain,
      mainIsAllergen: p.data.comp.ingredients != null && startsWithAllergen(p.data.comp.ingredients),
    })));
    containsIds = al.contains;
    mayIds = al.mayContain;

    added = parts.flatMap((p) => (p.data.comp.added ?? []).map((a) => ({ ...a, ingredient: `${a.ingredient} (${named.find((n) => n.p === p).name})` })));

    // Origin of the ingredients, grouped by country
    const byCountry = new Map();
    for (const { p, name } of named) {
      const country = p.data.comp.country_of_origin;
      if (!country) continue;
      if (!byCountry.has(country)) byCountry.set(country, []);
      byCountry.get(country).push(name);
    }
    const originText = byCountry.size === 0 ? null
      : byCountry.size === 1 && [...byCountry.values()][0].length === named.length ? [...byCountry.keys()][0]
      : [...byCountry].map(([country, names]) => `${country} (${names.join(', ')})`).join('; ');
    origin = { title: LABEL_TEXT.originOfIngredients, text: originText };

    storage = product.composition?.storage ?? company.default_storage;
    for (const { p, name } of named) {
      const s = p.data.comp.storage;
      if (s && s !== storage) add('component_storage', p.id, { componentName: name, storage: s });
    }
  }

  // --- Nutrition table and servings --------------------------------------------
  const serving = product.nutrition?.serving;
  if (!serving) add('missing_serving', null, {}, ['nutrition.serving']);
  const servingG = serving?.g ?? 100;
  const table = nutritionTable(raw, servingG, opts.decimals);
  for (const key of table.missing) {
    const mandatoryBecauseFat = !['energy_kcal', 'protein_g', 'total_fat_g', 'available_carbohydrates_g', 'total_sugars_g', 'sodium_mg'].includes(key);
    const lacking = missingIn.get(key);
    const params = { key, mandatoryBecauseFat };
    if (lacking) Object.assign(params, { component: lacking.join('+'), componentName: lacking.join(', ') });
    add('missing_nutrient', key, params, [`nutrition.per_100g.${key}`]);
  }

  let contentG = netWeightG;
  if (inShell) {
    if (edibleGPer100g) contentG = (netWeightG * edibleGPer100g) / 100;
    else add('missing_edible_part', null, {}, ['composition.edible_g_per_100g']);
  }
  const servings = serving ? servingsPerPackage(contentG, servingG, opts.servingsApprox) : null;
  if (serving && servingG > contentG) add('serving_exceeds_package', null, { serving: servingG, content: formatPlain(Number(contentG.toPrecision(6))) });

  // --- Seals and slogan --------------------------------------------------------
  const declared = declaredValues(raw, opts.decimals);
  const sealEval = evaluateSeals(raw, declared, added, opts.limits);
  const due = sealEval.filter((s) => s.due).map((s) => s.id);
  const removed = [];
  for (const s of sealEval) {
    if (s.unknown) add('seal_unknown', s.id, { seal: s.id, nutrient: s.nutrient, addedBy: s.addedBy });
    if (s.exceeds && !s.evaluated) {
      add('over_limit_not_added', s.id, { seal: s.id, nutrient: s.nutrient, value: formatPlain(s.declared), limit: s.limit });
    }
    if (s.due) {
      const decision = product.confirmed_alerts?.find((a) => a.alert === REMOVE_SEAL(s.id) && a.decision === 'remove_seal');
      if (decision) {
        removed.push(s.id);
        alerts.push({
          ...makeAlert('seal_removed', s.id, { seal: s.id, nutrient: s.nutrient, addedBy: s.addedBy, value: formatPlain(s.declared), limit: s.limit, date: decision.date }, null),
          confirmed: { decision: decision.decision, date: decision.date, note: decision.note },
        });
      }
    }
  }
  const printed = due.filter((id) => !removed.includes(id));
  // The slogan follows the seals that are due by law, even if one was removed.
  const slogan = due.length ? company.slogan.with_seals : company.slogan.no_seals;

  // --- Text checks ---------------------------------------------------------------
  const texts = [
    { where: 'product_name', text: product.product_name },
    ...(product.description ?? []).map((t) => ({ where: 'description', text: t })),
    ...(product.highlight ?? []).map((t) => ({ where: 'highlight', text: t })),
    { where: 'extra_text', text: product.composition?.extra_text },
  ];
  const sugarsPerServing = raw.total_sugars_g === undefined ? undefined : (raw.total_sugars_g * servingG) / 100;
  for (const c of checkClaims(texts, { dueSeals: due, added: new Set(added.map((a) => a.nutrient)), sugarsPerServing })) {
    add(c.check, [c.where, c.seal].filter(Boolean).join(':'), { text: c.text, seal: c.seal }, [c.where]);
  }

  // --- Packer and origin -----------------------------------------------------------
  const { packer } = company;
  const packerLine = product.type === 'mix'
    ? {
        title: opts.mixPackerTitle === 'plain' ? LABEL_TEXT.madeAndPackedBy : LABEL_TEXT.madeAndPackedIn(packer.country),
        text: opts.mixPackerTitle === 'plain' ? `${packer.name}, ${packer.address}, ${packer.country}.` : `${packer.name}, ${packer.address}.`,
      }
    : { title: LABEL_TEXT.packedBy, text: `${packer.name}, ${packer.address}, ${packer.country}.` };

  const allergenData = allergenTexts(containsIds, mayIds, index);

  return {
    productId: product.id,
    type: product.type,
    incomplete: false,
    variant: variantUsed,
    front: {
      productName: product.product_name,
      description: product.description ?? [],
      highlight: product.highlight ?? [],
      ringColor: product.ring_color ?? null,
      slogan,
      seals: printed,
      sealNames: printed.map((id) => SEAL_NAMES[id]),
      netWeight: { g: netWeightG, text: `${formatPlain(netWeightG)} g` },
    },
    seals: { due, printed, removed, evaluation: sealEval },
    nutrition: {
      serving: serving ? { g: servingG, householdMeasure: serving.household_measure, text: LABEL_TEXT.serving(serving.household_measure, formatPlain(servingG)) } : null,
      servingsPerPackage: servings ? { ...servings, label: LABEL_TEXT.servingsPerPackage(servings.text), basedOnG: Number(contentG.toPrecision(6)) } : null,
      note: inShell ? LABEL_TEXT.edibleNote : null,
      fatBreakdownRequired: table.fatBreakdownRequired,
      rows: table.rows,
      per100gRaw: raw,
    },
    ingredients: ingredientsText == null ? null : {
      text: ingredientsText,
      plain: plainText(ingredientsText),
      segments: segments(ingredientsText),
      words: wordCount(ingredientsText),
    },
    contains: allergenData.contains,
    mayContain: allergenData.mayContain,
    storage,
    usageInstructions: product.composition?.usage_instructions ?? null,
    extraText: product.composition?.extra_text ?? null,
    packer: packerLine,
    origin,
    healthPermit: company.health_permit.text,
    followUs: company.follow_us ?? null,
    barcode: presentation.barcode ?? null,
    alerts,
    blocking: blocking(alerts),
  };
}

/** Summary for printing: what must be fixed first and what only needs "Imprimir igual". */
function blocking(alerts) {
  return {
    review: alerts.filter((a) => a.print === 'review').map((a) => a.code),
    ask: alerts.filter((a) => a.print === 'ask').map((a) => a.code),
  };
}
