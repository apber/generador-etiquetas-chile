// Photo reading (stage 7e): transcription → draft record, validations and alerts.
// All label data here is invented (demo brand).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNumber, rowKey, rowUnit, readTable, fitsPattern, normalizeMeasure, parseServingGrams } from '../src/reading/table.js';
import { allergensInStatement, formatIngredients, addedFromIngredients, formatStorage, shelfLife } from '../src/reading/text.js';
import { transcriptionToDraft } from '../src/reading/convert.js';
import { measureImage, judgeImage } from '../src/reading/image-quality.js';
import { buildRequest, readWithGemini, readWithFallback, parseResponse, timeoutFor, DEFAULT_MODEL, FALLBACK_MODEL } from '../src/reading/gemini.js';
import { mergeCloseUp, focusFor } from '../src/reading/merge.js';
import { scoreReading } from '../src/reading/score.js';
import { pacificMidnightAfter, nextAttemptAt, quotaLimit, BUSY_RETRY_MS, AFTER_RESET_MS, MINUTE_EXTRA_MS } from '../src/reading/retry.js';
import { compareDrafts } from '../src/reading/compare.js';
import { parseName, groupBatch } from '../lectura/batch.js';

const catalog = JSON.parse(readFileSync(new URL('../data/allergens.json', import.meta.url)));

const cell = (text, legibility = 'clear') => ({ text, value: parseNumber(text).value, legibility });
const row = (label, unit, a, b, la, lb) => ({ label, unit, per_100: a === null ? null : cell(a, la), per_serving: b === null ? null : cell(b, lb) });

/** Invented table: 30 g serving, values per 100 g and per serving consistent. */
function demoTable(overrides = {}) {
  return {
    title: 'INFORMACIÓN NUTRICIONAL',
    serving_text: { text: 'Porción: 1/4 taza (30 g)', legibility: 'clear' },
    serving_g: 30,
    household_measure: '1/4 taza',
    servings_per_package_text: 'Porciones por envase: aprox. 166',
    per_100_header: '100 g',
    per_serving_header: '1 porción',
    other_column_headers: [],
    rows: [
      row('Energía', 'kcal', '560', '168'),
      row('Proteínas', 'g', '12,0', '3,6'),
      row('Grasa Total', 'g', '38,0', '11,4'),
      row('Grasa Saturada', 'g', '15,0', '4,5'),
      row('Grasa Monoinsaturada', 'g', '17,0', '5,1'),
      row('Grasa Poliinsaturada', 'g', '4,0', '1,2'),
      row('Grasa Trans', 'g', '0', '0'),
      row('Colesterol', 'mg', '5', '1,5'),
      row('H. de C. disponibles', 'g', '40,0', '12,0'),
      row('Azúcares totales', 'g', '35,0', '10,5'),
      row('Fibra dietética', 'g', '5,0', '1,5'),
      row('Sodio', 'mg', '40', '12'),
    ],
    notes_below_table: [],
    ...overrides,
  };
}

function demoTranscription(overrides = {}) {
  return {
    images: [{ index: 1, shows: ['nutrition_table', 'ingredients'], problems: [] }],
    product_name: 'ALMENDRAS CUBIERTAS CHOCOLATE DE LECHE',
    nutrition_table: demoTable(),
    ingredients: { text: 'Cobertura de chocolate de leche (azúcar, manteca de cacao, LECHE entera en polvo, pasta de cacao, LECITINA DE SOYA, vainillina), ALMENDRAS, goma laca, aceite vegetal, jarabe de glucosa.', legibility: 'clear' },
    contains_statement: { text: 'leche, soya', legibility: 'clear' },
    may_contain_statement: { text: 'maní, otros frutos secos, gluten', legibility: 'clear' },
    other_allergen_statements: [],
    origin: { text: 'Origen: Chile', country: 'Chile', explicit: true },
    storage: { text: 'conservar en lugar fresco y seco', legibility: 'clear' },
    usage_instructions: null,
    shelf_life_text: 'Duración: 12 meses',
    production_date: null,
    expiry_date: null,
    supplier: { name: 'Proveedor Demo SpA', role: 'Elaborado por', address: null, health_permit: null, website: null },
    package_size_text: '5 kg',
    front_claims: [],
    warning_seals: [],
    remarks: null,
    ...overrides,
  };
}

const options = { catalog, productName: 'Almendras con chocolate', date: '2026-10-30', model: 'test', promptVersion: 1 };

test('numbers: comma decimals, dot thousands, qualifiers and unreadable digits', () => {
  assert.equal(parseNumber('18,8').value, 18.8);
  assert.equal(parseNumber('1.181,1').value, 1181.1);
  assert.equal(parseNumber('558').value, 558);
  assert.equal(parseNumber('0,0').value, 0);
  assert.equal(parseNumber('18.8').value, 18.8);
  const t = parseNumber('1.181');
  assert.equal(t.value, 1181);
  assert.equal(t.ambiguous, true);
  assert.deepEqual([parseNumber('<0,1').value, parseNumber('<0,1').qualifier], [0.1, '<']);
  assert.equal(parseNumber('-').value, null);
  assert.equal(parseNumber('1?,5').value, null);
  assert.equal(parseNumber('1?,5').unreadable, true);
  assert.deepEqual([parseNumber('9 4g').value, parseNumber('9 4g').ambiguous], [9.4, true]);
});

test('supplier: the site of a web capture names the supplier when the company name is not shown', () => {
  const r = transcriptionToDraft(demoTranscription({ supplier: { name: null, role: null, address: null, health_permit: null, website: 'proveedor-demo.cl' } }), options);
  assert.equal(r.draft.sources[0].from, 'proveedor-demo.cl');
  const none = transcriptionToDraft(demoTranscription({ supplier: null }), options);
  assert.equal(none.draft.sources[0].from, 'Proveedor (sin nombre en la foto)');
});

test('rows: names and units of supplier tables', () => {
  assert.equal(rowKey('Energía', 'kcal'), 'energy_kcal');
  assert.equal(rowKey('Energía', 'kJ'), 'energy_kj');
  assert.equal(rowKey('Grasa Saturada', 'g'), 'saturated_fat_g');
  assert.equal(rowKey('Grasas totales', 'g'), 'total_fat_g');
  assert.equal(rowKey('Ác. grasos monoinsaturados', 'g'), 'monounsaturated_fat_g');
  assert.equal(rowKey('H. de C. disponibles', 'g'), 'available_carbohydrates_g');
  assert.equal(rowKey('Hidratos de carbono totales', 'g'), 'carbohydrates_total_g');
  assert.equal(rowKey('H. de C.', 'g'), 'carbohydrates_unspecified_g');
  assert.equal(rowKey('Azúcares totales', 'g'), 'total_sugars_g');
  assert.equal(rowKey('Sal', 'g'), 'salt_g');
  assert.equal(rowKey('Vitamina E', 'mg'), null);
  assert.equal(rowKey('Colesterol / Trans Fatty acids', 'g'), 'cholesterol_mg');
  assert.equal(rowKey('Grasas Monounsaturadas (g)', 'g'), 'monounsaturated_fat_g');
  assert.equal(rowKey('Grasas Poliinsaturadas (g)', 'g'), 'polyunsaturated_fat_g');
  assert.equal(rowKey('Hidrato de carbono disponible', 'g'), 'available_carbohydrates_g');
  assert.equal(rowKey('H de carbono', 'g'), 'carbohydrates_unspecified_g');
  assert.equal(rowUnit('Sodio (mg)', null), 'mg');
});

test('table: consistent columns give status ok and the values per 100 g', () => {
  const r = readTable(demoTable());
  assert.equal(r.values.energy_kcal, 560);
  assert.equal(r.values.cholesterol_mg, 5);
  assert.ok(Object.values(r.fields).every((f) => f.status === 'ok'), JSON.stringify(r.fields));
  assert.equal(r.serving.g, 30);
  assert.equal(r.serving.householdMeasure, '¼ taza');
  assert.deepEqual(r.issues, []);
});

test('table: a doubtful serving cell is confirmed by the 100 g column ("1?,5" fits 18.5)', () => {
  assert.equal(fitsPattern('1?,5', 18.51), true);
  assert.equal(fitsPattern('1?,5', 17.4), false);
  const t = demoTable();
  t.rows[8] = { label: 'H. de C. disponibles', unit: 'g', per_100: cell('61,7'), per_serving: { text: '1?,5', value: null, legibility: 'doubtful' } };
  const r = readTable(t);
  assert.equal(r.fields.available_carbohydrates_g.status, 'ok');
  assert.equal(r.values.available_carbohydrates_g, 61.7);
});

test('table: an unreadable value per 100 g is derived from the serving column (with alert)', () => {
  const t = demoTable();
  t.rows[0] = { label: 'Energía', unit: 'kcal', per_100: { text: '5?0', value: null, legibility: 'doubtful' }, per_serving: cell('168') };
  const r = readTable(t);
  assert.equal(r.fields.energy_kcal.status, 'derived');
  assert.equal(r.values.energy_kcal, 560);
});

test('table: a doubtful value per 100 g is confirmed only if the serving column can tell it apart', () => {
  // Arreglo 14 (10-11-2026): «0,3» in 30 g fits 0,8 to 1,2 per 100 g; «11,4» fits 37,x to 38,x: neither confirms.
  const t = demoTable();
  t.rows[2] = { label: 'Grasa Total', unit: 'g', per_100: { text: '1,2', value: 1.2, legibility: 'doubtful' }, per_serving: cell('0,3') };
  let r = readTable(t);
  assert.equal(r.fields.total_fat_g.status, 'doubtful');
  assert.equal(r.fields.total_fat_g.note, 'other_column_imprecise');
  assert.equal(r.values.total_fat_g, undefined);
  t.rows[2] = { label: 'Grasa Total', unit: 'g', per_100: { text: '38,0', value: 38, legibility: 'doubtful' }, per_serving: cell('11,4') };
  assert.equal(readTable(t).fields.total_fat_g.status, 'doubtful');
  // A whole number per 100 g and a serving cell with a decimal: only 5 fits «1,5» in 30 g.
  t.rows[7] = { label: 'Colesterol', unit: 'mg', per_100: { text: '5', value: 5, legibility: 'doubtful' }, per_serving: cell('1,5') };
  r = readTable(t);
  assert.equal(r.fields.cholesterol_mg.status, 'ok');
  assert.equal(r.fields.cholesterol_mg.note, 'confirmed_by_other_column');
  // The serving cell tells a different value apart: it is derived from it.
  t.rows[7] = { label: 'Colesterol', unit: 'mg', per_100: { text: '6', value: 6, legibility: 'doubtful' }, per_serving: cell('1,5') };
  r = readTable(t);
  assert.equal(r.fields.cholesterol_mg.status, 'derived');
  assert.equal(r.values.cholesterol_mg, 5);
});

test('table: two doubtful cells never confirm each other; a clear pair needs the precision of the 100 g cell', () => {
  // Invented: a photo from afar, two doubtful cells that agree with each other.
  const t = demoTable();
  t.rows[9] = { label: 'Azúcares totales', unit: 'g', per_100: { text: '2,1', value: 2.1, legibility: 'doubtful' }, per_serving: { text: '0,6', value: 0.6, legibility: 'doubtful' } };
  let r = readTable(t);
  assert.equal(r.fields.total_sugars_g.status, 'doubtful');
  assert.equal(r.fields.total_sugars_g.note, 'both_doubtful');
  // Invented: «70,0 | 17» in 25 g (17 accepts 16,5 to 17,5 per serving, i.e. 66 to 70 per 100 g).
  t.serving_text = { text: 'Porción 25 g', legibility: 'clear' };
  t.serving_g = 25;
  t.rows = [row('Energía', 'kcal', '320,0', '80,0'), row('H. de C. disponibles', 'g', '70,0', '17'), row('Azúcares totales', 'g', '60,0', '15,0')];
  r = readTable(t);
  assert.equal(r.fields.available_carbohydrates_g.status, 'unverified');
  assert.equal(r.fields.available_carbohydrates_g.note, 'serving_cell_imprecise');
  // A pair that fits only with the 2 % allowance, not with the rounding of its digits.
  t.rows = [row('Energía', 'kcal', '320,0', '80,0'), row('H. de C. disponibles', 'g', '70,0', '17,8'), row('Azúcares totales', 'g', '60,0', '15,0')];
  r = readTable(t);
  assert.equal(r.fields.available_carbohydrates_g.note, 'serving_cell_edge');
  assert.equal(r.fields.energy_kcal.status, 'ok');
});

test('table: columns that disagree are not used', () => {
  const t = demoTable();
  t.rows[1] = row('Proteínas', 'g', '21,0', '3,6');
  const r = readTable(t);
  assert.equal(r.fields.protein_g.status, 'mismatch');
  assert.equal(r.values.protein_g, undefined);
});

test('table: serving column calculated for another weight (30 g declared, 20 g used)', () => {
  const t = demoTable();
  t.rows = t.rows.map((x) => {
    const v = parseNumber(x.per_100.text).value;
    const s = Math.round(v * 0.2 * 10) / 10;
    return row(x.label, x.unit, x.per_100.text, String(s).replace('.', ','));
  });
  const r = readTable(t);
  assert.ok(r.issues.some((i) => i.code === 'serving_column_other_weight' && i.computed === 20));
  assert.equal(r.values.energy_kcal, 560);
  assert.ok(Object.values(r.fields).every((f) => f.status !== 'mismatch'));
});

test('table: total carbohydrates minus fiber; sodium in g; salt only; missing mandatory rows', () => {
  const t = demoTable();
  t.rows[8] = row('Hidratos de carbono totales', 'g', '45,0', '13,5');
  t.rows[11] = row('Sodio', 'g', '0,04', '0,012');
  const r = readTable(t);
  assert.equal(r.values.available_carbohydrates_g, 40);
  assert.equal(r.values.sodium_mg, 40);
  assert.ok(r.issues.some((i) => i.code === 'carbs_total_converted'));

  const t2 = demoTable();
  t2.rows[11] = row('Sal', 'g', '0,1', '0,03');
  assert.equal(readTable(t2).values.sodium_mg, 40);

  const t3 = demoTable();
  t3.rows = t3.rows.filter((x) => !/Saturada|Sodio/.test(x.label));
  const r3 = readTable(t3);
  assert.deepEqual(r3.issues.filter((i) => i.code === 'row_missing').map((i) => i.key), ['saturated_fat_g', 'sodium_mg']);
});

test('table: only the 100 g column (web pages) gives unverified values', () => {
  const t = demoTable({ per_serving_header: null });
  t.rows = t.rows.map((x) => ({ ...x, per_serving: null }));
  const r = readTable(t);
  assert.equal(r.fields.energy_kcal.status, 'unverified');
  assert.equal(r.values.energy_kcal, 560);
  assert.ok(r.issues.some((i) => i.code === 'no_serving_column'));
});

test('table: serving column without serving weight must keep one proportion', () => {
  const t = demoTable({ serving_text: null, serving_g: null, household_measure: null });
  const r = readTable(t);
  assert.equal(r.serving.g, 30);
  assert.ok(r.issues.some((i) => i.code === 'serving_inferred'));
  const bad = demoTable({ serving_text: null, serving_g: null, household_measure: null });
  bad.rows[1] = row('Proteínas', 'g', '9', '49');
  bad.rows[2] = row('Grasa Total', 'g', '4', '9');
  const rb = readTable(bad);
  assert.ok(rb.issues.some((i) => i.code === 'columns_disagree_no_serving'));
  assert.equal(rb.values.protein_g, undefined);
});

test('serving line and household measure', () => {
  assert.equal(parseServingGrams('Porción: 1/4 taza (30 g)'), 30);
  assert.equal(normalizeMeasure('1/4 taza (30 g)'), '¼ taza');
  assert.equal(normalizeMeasure('5 Unidades'), '5 unidades');
});

test('allergen statements → catalog ids (strict: "frutos secos" = tree nuts + peanut)', () => {
  assert.deepEqual(allergensInStatement('MANÍ, SOYA, GLUTEN (jarabe de glucosa)', catalog).ids, ['peanut', 'soy', 'gluten']);
  assert.deepEqual(allergensInStatement('sésamo, leche, otros frutos secos, sulfitos y mostaza', catalog).ids,
    ['sesame', 'milk', 'tree_nuts', 'peanut', 'sulphites', 'mustard']);
  assert.deepEqual(allergensInStatement('trigo, cebada y centeno', catalog).ids, ['wheat', 'barley', 'rye']);
  assert.deepEqual(allergensInStatement('Elaborado en líneas que también procesan frutos secos, lácteos, soya y otros derivados', catalog).ids,
    ['tree_nuts', 'peanut', 'milk', 'soy']);
  assert.deepEqual(allergensInStatement('dióxido de azufre', catalog).ids, ['sulphites']);
  const st = allergensInStatement('Envasado en líneas donde se procesan y envasan productos con sulfitos, almendras, nueces y sus derivados.', catalog);
  assert.deepEqual([st.ids, st.unknown], [['sulphites', 'almond', 'walnut'], []]);
  assert.deepEqual(allergensInStatement('apio', catalog).unknown, ['apio']);
});

test('ingredients: supplier capitals become allergen marks; otherwise allergens are found', () => {
  assert.equal(
    formatIngredients('Cobertura de chocolate bitter (pasta de cacao, azúcar, LECITINA DE SOYA), MANÍ, jarabe de glucosa (GLUTEN).', catalog),
    'cobertura de chocolate bitter (pasta de cacao, azúcar, {lecitina de soya}), {maní}, jarabe de glucosa ({gluten})',
  );
  assert.equal(formatIngredients('pasa, aceite de maravilla, dióxido de azufre', catalog), 'pasa, aceite de maravilla, {dióxido de azufre}');
  assert.equal(formatIngredients('MANÍ, SAL', catalog), '{maní}, sal');
  assert.equal(formatIngredients('nuez moscada, almendras', catalog), 'nuez moscada, {almendras}');
  assert.equal(formatIngredients('Avena', catalog), '{avena}');
});

test('added sugar, fat and salt in an ingredient list', () => {
  assert.deepEqual(addedFromIngredients('cobertura (pasta de cacao, azúcar, {lecitina de soya}), {maní}, azúcar impalpable, aceite vegetal, jarabe de glucosa ({gluten}), sorbato de potasio'), [
    { nutrient: 'sugar', ingredient: 'azúcar, azúcar impalpable, jarabe de glucosa' },
    { nutrient: 'fat', ingredient: 'aceite vegetal' },
  ]);
  assert.deepEqual(addedFromIngredients('pistacho con cáscara, sal'), [{ nutrient: 'sodium', ingredient: 'sal' }]);
  assert.deepEqual(addedFromIngredients('pasas morenas, aceite mineral'), []);
  assert.deepEqual(addedFromIngredients('cranberries, jarabe de piña, concentrado de jugo de piña clarificado, aceite de maravilla'), [
    { nutrient: 'sugar', ingredient: 'jarabe de piña, concentrado de jugo de piña' },
    { nutrient: 'fat', ingredient: 'aceite de maravilla' },
  ]);
});

test('storage and shelf life', () => {
  assert.equal(formatStorage('conservar en lugar fresco y seco'), 'Conservar en lugar fresco y seco.');
  assert.equal(formatStorage('CONSERVAR EN LUGAR FRESCO Y SECO'), 'Conservar en lugar fresco y seco.');
  assert.equal(formatStorage('Conservar en un lugar fresco y seco Se recomienda mantener refrigerado'), 'Conservar en un lugar fresco y seco. Se recomienda mantener refrigerado.');
  assert.equal(formatStorage('Condiciones Almacenamiento: Mantener en lugar fresco y seco'), 'Mantener en lugar fresco y seco.');
  assert.deepEqual(shelfLife('Duración: 12 meses'), { amount: 12, unit: 'months', from: 'text' });
  assert.deepEqual(shelfLife(null, '29-07-2026', '29-01-2028'), { amount: 18, unit: 'months', from: 'dates' });
});

test('draft: full reading of a clear label has no pending alert', () => {
  const r = transcriptionToDraft(demoTranscription(), options);
  const c = r.draft.composition;
  assert.equal(r.summary.pending, 0, JSON.stringify(r.alerts, null, 1));
  // Main allergen first (the product is almonds), then the order of the statement
  assert.deepEqual(c.contains, ['almond', 'milk', 'soy']);
  assert.deepEqual(c.may_contain, ['peanut', 'tree_nuts', 'gluten']);
  assert.equal(c.country_of_origin, 'Chile');
  assert.deepEqual(c.supplier_shelf_life, { amount: 12, unit: 'months' });
  assert.deepEqual(c.added.map((a) => a.nutrient), ['sugar', 'fat']);
  assert.equal(r.draft.nutrition.per_100g.energy_kcal.value, 560);
  assert.deepEqual(r.draft.nutrition.serving, { g: 30, household_measure: '¼ taza', source: 'r1' });
  assert.ok(r.alerts.some((a) => a.code === 'contains_added_from_ingredients'));
});

test('draft: missing origin, allergen line from shared-lines sentence, seals compared with the supplier', () => {
  const r = transcriptionToDraft(demoTranscription({
    origin: null,
    may_contain_statement: null,
    other_allergen_statements: ['Elaborado en líneas que también procesan maní y sésamo.'],
    warning_seals: ['ALTO EN AZÚCARES', 'ALTO EN CALORÍAS'],
  }), options);
  const codes = r.alerts.map((a) => a.code);
  assert.ok(codes.includes('no_origin'));
  assert.ok(codes.includes('may_contain_from_statement'));
  assert.deepEqual(r.draft.composition.may_contain, ['peanut', 'sesame']);
  // 15 g saturated fat with added fat: the calculation also gives ALTO EN GRASAS SATURADAS
  assert.ok(codes.includes('seals_differ'));
  assert.ok(r.summary.pending > 0);
});

test('draft: a repeated or doubtful allergen word asks for review', () => {
  const r = transcriptionToDraft(demoTranscription({
    may_contain_statement: null,
    other_allergen_statements: [{ text: 'Elaborado en líneas que también procesan maní, soya, sésamo/sésamo, otros frutos secos y mostaza.', legibility: 'clear' }],
  }), options);
  const a = r.alerts.find((x) => x.code === 'allergen_statement_doubtful');
  assert.ok(a && a.pending);
  assert.deepEqual(a.data.repeated, ['sésamo']);
  // A group word that repeats an allergen named before ("maní … otros frutos secos") is fine
  const ok = transcriptionToDraft(demoTranscription({ may_contain_statement: { text: 'maní, otros frutos secos', legibility: 'clear' } }), options);
  assert.ok(!ok.alerts.some((x) => x.code === 'allergen_statement_doubtful'));
});

test('draft: unreadable and inconsistent tables block saving', () => {
  const t = demoTranscription();
  t.nutrition_table.rows[2] = row('Grasa Total', 'g', '3,8', '1,1');
  const r = transcriptionToDraft(t, options);
  assert.ok(r.alerts.some((a) => a.code === 'table_check'));
  assert.ok(r.summary.pending > 0);
  const none = transcriptionToDraft(demoTranscription({ nutrition_table: null, ingredients: null }), options);
  assert.deepEqual(none.alerts.filter((a) => a.pending).map((a) => a.code).slice(0, 2), ['no_table', 'no_ingredients']);
});

test('score: a wrong value that no alert flags counts as a silent error', () => {
  const t = demoTranscription();
  t.nutrition_table.rows[11] = row('Sodio', 'mg', '48', '14,4');
  const r = transcriptionToDraft(t, options);
  const s = scoreReading({ per_100g: { sodium_mg: 40, energy_kcal: 560 }, contains: ['almond', 'milk', 'soy'], country_of_origin: 'Chile' }, r);
  assert.equal(s.nutrients.wrong_silent, 1);
  assert.equal(s.nutrients.right, 1);
  assert.ok(s.texts.find((x) => x.field === 'contains').order);
});

test('score: a misspelled word or a missing parenthesis in the ingredients is a silent text error', () => {
  const base = 'cobertura de chocolate de leche (azúcar, manteca de cacao, {leche} entera en polvo, pasta de cacao, {lecitina de soya}, vainillina), {almendras}, goma laca, aceite vegetal, jarabe de glucosa';
  const silent = (text) => {
    const r = transcriptionToDraft(demoTranscription(text ? { ingredients: { text, legibility: 'clear' } } : {}), options);
    return scoreReading({ ingredients: base }, r).silent_texts;
  };
  assert.deepEqual(silent(null), []);
  const ing = 'Cobertura de chocolate de leche (azúcar, manteca de cacao, LECHE entera en polvo, pasta de cacao, LECITINA DE SOYA, vainillina), ALMENDRAS, goma laca, aceite vegetal, jarabe de glucosa.';
  assert.deepEqual(silent(ing.replace('goma laca', 'goma lacca')), ['ingredients']);
  assert.deepEqual(silent(ing.replace('vainillina)', 'vainillina')), ['ingredient_parens']);
});

test('image check: sharp detail vs flat blur, dark, screen captures', () => {
  const img = (w, h, f) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = f(x, y);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
    return { width: w, height: h, data };
  };
  const sharp = measureImage(img(200, 100, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 230 : 30));
  const flat = measureImage(img(200, 100, () => 128));
  assert.ok(sharp.sharpness > 1000);
  assert.equal(flat.sharpness, 0);
  assert.deepEqual(judgeImage(flat, { width: 3000, height: 4000 }).reasons, ['blurry']);
  assert.deepEqual(judgeImage(measureImage(img(100, 100, (x) => (x % 2 ? 20 : 10))), { width: 600, height: 400 }).reasons, ['small', 'dark']);
  assert.equal(measureImage(img(100, 100, (x) => (x < 60 ? 255 : 0))).kind, 'screen');
});

test('Gemini request and response handling (no network)', async () => {
  const body = buildRequest([{ mimeType: 'image/jpeg', base64: 'AAAA' }], { productHint: 'maní' });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
  assert.equal(body.contents[0].parts[1].inline_data.data, 'AAAA');
  assert.match(body.contents[0].parts[0].text, /maní/);

  const ok = parseResponse({ candidates: [{ content: { parts: [{ text: '{"images":[]}' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 10 } }, 'm');
  assert.deepEqual(ok.transcription, { images: [] });

  const fake = (status, json) => async () => ({ ok: status === 200, status, json: async () => json });
  await assert.rejects(readWithGemini([], { apiKey: 'k', model: 'm', fetchImpl: fake(429, { error: { status: 'RESOURCE_EXHAUSTED' } }) }), { code: 'quota' });
  await assert.rejects(readWithGemini([], { apiKey: 'k', model: 'm', retries: 0, fetchImpl: fake(503, {}) }), { code: 'overloaded' });
  await assert.rejects(readWithGemini([], { apiKey: '', model: 'm' }), { code: 'bad_key' });
  await assert.rejects(readWithGemini([], { apiKey: 'k', model: 'm', fetchImpl: fake(200, { candidates: [{ content: { parts: [{ text: '{"images": [' }] }, finishReason: 'MAX_TOKENS' }] }) }), { code: 'bad_response' });
});

test('close-up of one section replaces it in the earlier reading', () => {
  const base = demoTranscription({ may_contain_statement: null, other_allergen_statements: [{ text: 'Elaborado en líneas que procesan maní, sésamo/sésamo', legibility: 'doubtful' }] });
  const close = { images: [{ index: 1, shows: ['allergens'], problems: [] }], nutrition_table: null, ingredients: null, contains_statement: null,
    may_contain_statement: null, other_allergen_statements: [{ text: 'Elaborado en líneas que procesan maní, sésamo, mostaza', legibility: 'clear' }] };
  const m = mergeCloseUp(base, close, 'allergens');
  assert.equal(m.replaced, true);
  assert.equal(m.transcription.nutrition_table, base.nutrition_table);
  const r = transcriptionToDraft(m.transcription, options);
  assert.ok(!r.alerts.some((a) => a.code === 'allergen_statement_doubtful'));
  assert.ok(r.draft.composition.may_contain.includes('mustard'));
  assert.equal(mergeCloseUp(base, { ...close, other_allergen_statements: [] }, 'allergens').replaced, false);
  assert.equal(focusFor('allergen_statement_doubtful'), 'allergens');
  assert.equal(focusFor('value_doubtful'), 'table');
  assert.equal(focusFor('no_origin'), null);
});

test('fallback model when the main one has no quota; its readings are reviewed in full', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes(DEFAULT_MODEL)) return { ok: false, status: 429, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(demoTranscription()) }] } }] }) };
  };
  const r = await readWithFallback([], { apiKey: 'k', fetchImpl });
  assert.equal(r.fallback, true);
  assert.ok(calls[1].includes(FALLBACK_MODEL));
  const d = transcriptionToDraft(r.transcription, { ...options, fallback: r.fallback, model: FALLBACK_MODEL });
  assert.ok(d.alerts.some((a) => a.code === 'fallback_model' && a.pending));
  const body = buildRequest([], { focus: 'allergens' });
  assert.match(body.contents[0].parts[0].text, /SOLO las frases de alérgenos/);
});

test('close-up of one row or one number replaces only that row', () => {
  const base = demoTranscription();
  base.nutrition_table.rows[1] = { label: 'Proteínas', unit: 'g', per_100: { text: '1?,0', value: null, legibility: 'doubtful' }, per_serving: { text: '3,?', value: null, legibility: 'doubtful' } };
  const close = { images: [], nutrition_table: { serving_text: null, serving_g: null, household_measure: null, per_100_header: null, per_serving_header: null,
    rows: [row('Proteínas', 'g', '12,0', '3,6')] }, ingredients: null, contains_statement: null, may_contain_statement: null, other_allergen_statements: [] };
  const m = mergeCloseUp(base, close, 'table');
  assert.equal(m.transcription.nutrition_table.rows.length, 12);
  assert.equal(m.transcription.nutrition_table.serving_g, 30);
  const r = transcriptionToDraft(m.transcription, options);
  assert.equal(r.fields.protein_g.status, 'ok');
  assert.equal(r.values?.protein_g ?? r.draft.nutrition.per_100g.protein_g.value, 12);
});

test('an attempt that does not answer in time ends with a timeout and the fallback model reads instead', async () => {
  const hang = (url, init) => new Promise((resolve, reject) => {
    if (!url.includes(DEFAULT_MODEL)) {
      resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(demoTranscription()) }] } }] }) });
      return;
    }
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(readWithGemini([], { apiKey: 'k', model: DEFAULT_MODEL, timeoutMs: 20, fetchImpl: hang }), { code: 'timeout' });
  const seen = [];
  const r = await readWithFallback([], { apiKey: 'k', timeoutMs: 20, fetchImpl: hang, onAttempt: (a) => seen.push(a.model) });
  assert.equal(r.fallback, true);
  assert.equal(r.fallbackReason, 'timeout');
  assert.deepEqual(seen, [DEFAULT_MODEL, FALLBACK_MODEL]);
  const d = transcriptionToDraft(r.transcription, { ...options, fallback: true, fallbackReason: r.fallbackReason, model: FALLBACK_MODEL });
  const a = d.alerts.find((x) => x.code === 'fallback_model');
  assert.match(a.message, /ocupado/);
  assert.match(a.detail, /no respondió a tiempo/);
  const q = transcriptionToDraft(r.transcription, { ...options, fallback: true, fallbackReason: 'quota', model: FALLBACK_MODEL });
  assert.match(q.alerts.find((x) => x.code === 'fallback_model').message, /se acabaron/);
});

test('cancelling a reading stops it at once and is not turned into a fallback reading', async () => {
  const ctrl = new AbortController();
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  setTimeout(() => ctrl.abort(), 10);
  await assert.rejects(readWithFallback([], { apiKey: 'k', fetchImpl: hang, signal: ctrl.signal }), { name: 'AbortError' });
});

const pcell = (text, legibility = 'clear') => ({ text, value: parseNumber(text), legibility });
const prow = (label, unit, a, b) => ({ label, unit, per_100: a, per_serving: b });

test('a clear pair that disagrees puts the serving in doubt: doubtful values it "confirmed" are not trusted', () => {
  // Raisins read with the fallback model (04-11-2026): «Porción: 20 g» misread (the label says 30 g).
  const r = readTable({
    serving_text: { text: 'Porción: 20 g', legibility: 'clear' }, serving_g: 20, per_100_header: '100 g',
    rows: [
      prow('Energía', 'kcal', pcell('391', 'doubtful'), pcell('78')),
      prow('Proteínas', 'g', pcell('3', 'doubtful'), pcell('0,6')),
      prow('Grasas Totales', 'g', pcell('1,5', 'doubtful'), pcell('0,3')),
      prow('Carbohidratos Disp.', 'g', pcell('87'), pcell('20,1')),
      prow('Azúcares Totales', 'g', pcell('59,2'), pcell('18')),
      prow('Sodio', 'mg', pcell('12'), pcell('36', 'doubtful')),
    ],
  });
  for (const k of ['energy_kcal', 'protein_g', 'total_fat_g']) assert.equal(r.fields[k].status, 'doubtful', k);
  assert.equal(r.fields.total_sugars_g.status, 'mismatch');
  assert.equal(r.fields.sodium_mg.status, 'ok');
});

test('a unit converted to an impossible amount is doubted and asks for a review', () => {
  // Maíz curahua: «Sodio (g) 15g» would be 15 000 mg per 100 g.
  const t = { serving_text: null, serving_g: null, per_100_header: '100g',
    rows: [prow('Energia (kCal)', 'kCal', pcell('365'), null), prow('Sodio (g)', 'g', pcell('15g'), null), prow('Colesterol', 'g', pcell('0,0'), null)] };
  const r = readTable(t);
  assert.equal(r.fields.sodium_mg.status, 'doubtful');
  assert.equal(r.fields.cholesterol_mg.status !== 'doubtful', true);
  const d = transcriptionToDraft({ nutrition_table: t, images: [] }, options);
  const a = d.alerts.find((x) => x.code === 'unit_doubtful');
  assert.ok(a && a.pending && a.action === 'review');
  assert.match(a.message, /Sodio: la tabla dice «15g» en g/);
  assert.ok(!d.alerts.some((x) => x.code === 'value_doubtful'));
});

test('the time limit grows with the number of images', () => {
  assert.equal(timeoutFor(1), 60_000);
  assert.equal(timeoutFor(4), 105_000);
  assert.equal(timeoutFor(20), 180_000);
});

test('a waiting reading is tried again after the quota reset (midnight Pacific) or 15 min later if the service was busy', () => {
  // 4 Nov 2026, 16:00 in Chile (UTC−3) = 19:00 UTC = 11:00 in Los Angeles (UTC−8 from 1 Nov).
  const now = Date.UTC(2026, 10, 4, 19, 0);
  assert.equal(pacificMidnightAfter(now), Date.UTC(2026, 10, 5, 8, 0));
  // Summer time (UTC−7): 1 Jul 2026, 12:00 UTC.
  assert.equal(pacificMidnightAfter(Date.UTC(2026, 6, 1, 12, 0)), Date.UTC(2026, 6, 2, 7, 0));
  // Just after midnight there: the next one is tomorrow's.
  assert.equal(pacificMidnightAfter(Date.UTC(2026, 10, 5, 8, 1)), Date.UTC(2026, 10, 6, 8, 0));
  assert.equal(nextAttemptAt('quota', now), Date.UTC(2026, 10, 5, 8, 0) + AFTER_RESET_MS);
  for (const code of ['overloaded', 'timeout', 'network']) assert.equal(nextAttemptAt(code, now), now + BUSY_RETRY_MS);
  for (const code of ['bad_key', 'blocked', 'bad_response']) assert.equal(nextAttemptAt(code, now), null);
});

test('two readings of the same product: only what differs is listed', () => {
  const opts = { catalog, productName: 'Demo', sourceKind: 'label_photo' };
  const t = (sodium, ingredients) => ({
    images: [],
    nutrition_table: { serving_text: { text: 'Porción 30 g', legibility: 'clear' }, serving_g: 30, per_100_header: '100 g', per_serving_header: 'Porción',
      rows: [prow('Energía', 'kcal', pcell('500'), pcell('150')), prow('Sodio', 'mg', pcell(sodium), null)] },
    ingredients: { text: ingredients, legibility: 'clear' },
  });
  const a = transcriptionToDraft(t('20', 'Maní, sal'), opts);
  assert.deepEqual(compareDrafts(a, transcriptionToDraft(t('20', 'maní,  sal'), opts)), []);
  const d = compareDrafts(a, transcriptionToDraft(t('200', 'Maní'), opts));
  assert.deepEqual(d.map((x) => x.field), ['sodium_mg', 'ingredients']);
  assert.equal(d[0].a, 20);
  assert.equal(d[0].b, 200);
});

test('a 429 says which limit was hit: per day waits for the reset, per minute only a little', () => {
  const now = Date.UTC(2026, 10, 4, 19, 0);
  const err = (quotaId, retryDelay) => ({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
    ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
  ] } });
  assert.equal(quotaLimit(err('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '20s')).kind, 'day');
  assert.equal(nextAttemptAt('quota', now, err('GenerateRequestsPerDayPerProjectPerModel-FreeTier')), Date.UTC(2026, 10, 5, 8, 0) + AFTER_RESET_MS);
  assert.equal(nextAttemptAt('quota', now, err('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '37s')), now + 37_000 + MINUTE_EXTRA_MS);
  assert.equal(nextAttemptAt('quota', now, err('GenerateRequestsPerMinutePerProjectPerModel-FreeTier')), now + 60_000 + MINUTE_EXTRA_MS);
  assert.equal(nextAttemptAt('quota', now, { error: { code: 429 } }), now + BUSY_RETRY_MS, 'unknown limit: try again in 15 min');
});

test('batch of photos: the file name gives the product and the test; "todas" goes in every reading of the product', () => {
  assert.deepEqual(parseName('Mani-Bitter_r_tabla.JPG'), { product: 'mani-bitter', test: 'R', shared: false });
  assert.deepEqual(parseName('linaza_todas_ingredientes.jpg'), { product: 'linaza', test: null, shared: true });
  assert.deepEqual(parseName('linaza.jpg'), { product: 'linaza', test: null, shared: false });
  assert.deepEqual(parseName('maní-curahua_F.jpeg'), { product: 'mani-curahua', test: 'F', shared: false });
  assert.equal(parseName('_x.jpg'), null);
  const names = ['a_R_2.jpg', 'a_R_10.jpg', 'a_todas_ing.jpg', 'a_B_1.jpg', 'b_todas_1.jpg', '_x.jpg'];
  const { groups, unknown } = groupBatch(names);
  assert.deepEqual(groups.map((g) => [g.product, g.test, g.files.map((i) => names[i]), g.shared.map((i) => names[i])]), [
    ['a', 'B', ['a_B_1.jpg'], ['a_todas_ing.jpg']],
    ['a', 'R', ['a_R_2.jpg', 'a_R_10.jpg'], ['a_todas_ing.jpg']],
    ['b', null, [], ['b_todas_1.jpg']],
  ]);
  assert.deepEqual(unknown, [5]);
});

// ---------- Lote de arreglos 0.7 (10-11-2026) ----------

test('arreglo 1: "harina" without saying of what is wheat flour → CONTIENE gluten; "harina de arroz" is not', () => {
  const d = transcriptionToDraft(demoTranscription({
    ingredients: { text: 'HARINA, AZÚCAR, MANTECA VEGETAL, VAINILLA, LECITINA DE SOYA Y SAL.', legibility: 'clear' },
    contains_statement: null,
  }), options);
  assert.deepEqual(d.draft.composition.contains, ['gluten', 'soy']);
  assert.match(d.draft.composition.ingredients, /^\{harina\}, azúcar/);
  assert.match(d.alerts.find((a) => a.code === 'contains_from_ingredients').detail, /harina de trigo/);
  for (const text of ['harina de arroz, azúcar', 'harina de maíz, sal', 'Harina de coco']) {
    const r = transcriptionToDraft(demoTranscription({ ingredients: { text, legibility: 'clear' }, contains_statement: null }), options);
    assert.deepEqual(r.draft.composition.contains, [], text);
  }
  const integral = transcriptionToDraft(demoTranscription({ ingredients: { text: 'harina integral, agua, sal', legibility: 'clear' }, contains_statement: null }), options);
  assert.deepEqual(integral.draft.composition.contains, ['gluten']);
});

test('arreglo 2: bilingual ingredients and household measure keep only the Spanish part', () => {
  const t = demoTranscription({
    ingredients: { text: 'HARINA, AZÚCAR, MANTECA VEGETAL Y SAL.\n\nFLOUR, SUGAR, VEGETABLE SHORTENING AND SALT.', legibility: 'clear' },
    contains_statement: null,
  });
  t.nutrition_table = demoTable({ household_measure: '1 unid. / units' });
  const d = transcriptionToDraft(t, options);
  assert.equal(d.draft.composition.ingredients, '{harina}, azúcar, manteca vegetal y sal');
  assert.equal(d.draft.nutrition.serving.household_measure, '1 unid.');
  const a = d.alerts.find((x) => x.code === 'other_language_removed');
  assert.ok(a && !a.pending);
  assert.match(a.detail, /FLOUR/);
  // On one line, after the period; an English-only list is kept as it is.
  const one = transcriptionToDraft(demoTranscription({ ingredients: { text: 'harina, azúcar y sal. flour, sugar and salt', legibility: 'clear' } }), options);
  assert.equal(one.draft.composition.ingredients, '{harina}, azúcar y sal');
  const en = transcriptionToDraft(demoTranscription({ ingredients: { text: 'Cranberries, sugar, sunflower oil', legibility: 'clear' } }), options);
  assert.equal(en.draft.composition.ingredients, 'cranberries, sugar, sunflower oil');
  assert.equal(normalizeMeasure('1/4 taza'), '¼ taza');
});

test('arreglo 3: sodium converted from g is doubted above 1000 mg when no ingredient adds salt', () => {
  const table = (g) => ({ serving_text: { text: 'Porción 25 g', legibility: 'clear' }, serving_g: 25, per_100_header: '100 g',
    rows: [row('Energía', 'kcal', '320,0', '80,0'), row('Sodio (g)', 'g', g, null)] });
  const noSalt = transcriptionToDraft(demoTranscription({ nutrition_table: table('3'), ingredients: { text: 'Ciruelas deshidratadas y aceite mineral', legibility: 'clear' } }), options);
  assert.equal(noSalt.fields.sodium_mg.status, 'doubtful');
  assert.match(noSalt.alerts.find((a) => a.code === 'unit_doubtful').message, /ningún ingrediente aporta sal/);
  const salted = transcriptionToDraft(demoTranscription({ nutrition_table: table('1,2'), ingredients: { text: 'Maní, aceite vegetal, sal', legibility: 'clear' } }), options);
  assert.notEqual(salted.fields.sodium_mg.status, 'doubtful');
  assert.equal(readTable(table('3'), { saltAdded: true }).fields.sodium_mg.status !== 'doubtful', true);
});

test('arreglo 4: an allergen named after a group that already holds it is not a repeated word', () => {
  assert.deepEqual(allergensInStatement('Elaborado en líneas donde se procesan frutos secos, maní y otros alérgenos', catalog).repeated, []);
  assert.deepEqual(allergensInStatement('maní, frutos secos', catalog).repeated, []);
  assert.deepEqual(allergensInStatement('maní, almendras, maní', catalog).repeated, ['peanut']);
});

test('arreglo 5: carbohydrates derived from a serving column of totals say "minus fiber" in the detail', () => {
  const t = { serving_text: { text: 'Porción: 100 g', legibility: 'clear' }, serving_g: 100,
    rows: [row('Energía', 'kcal', null, '330 kcal'), row('Proteínas', 'g', null, '12 g'), row('Grasas totales', 'g', null, '0,5 g'),
      row('Carbohidratos totales', 'g', null, '72 g'), row('Azúcares', 'g', null, '40 g'), row('Fibra dietética', 'g', null, '10 g'), row('Sodio', 'mg', null, '250 mg')] };
  const d = transcriptionToDraft(demoTranscription({ nutrition_table: t }), options);
  assert.equal(d.draft.nutrition.per_100g.available_carbohydrates_g.value, 62);
  assert.match(d.alerts.find((a) => a.code === 'value_derived').detail, /totales «72 g» × 100 \/ 100 = 72, menos 10 de fibra = 62/);
});

test('arreglo 15: a table seen only in blurry, far or dark photos stays «Por confirmar» with a retake alert', () => {
  const far = demoTranscription({ images: [{ index: 1, shows: ['nutrition_table'], problems: ['too_far'] }, { index: 2, shows: ['ingredients'], problems: [] }] });
  const d = transcriptionToDraft(far, options);
  assert.ok(Object.values(d.fields).filter((f) => f.status !== 'missing').every((f) => f.status === 'unverified' && f.note === 'table_photos_poor'));
  assert.equal(d.draft.nutrition.per_100g.energy_kcal.value, 560); // everything is saved
  const a = d.alerts.find((x) => x.code === 'table_photos_poor');
  assert.ok(a.pending && a.action === 'retake');
  assert.match(a.message, /de lejos/);
  assert.equal(focusFor(a.code), 'table');
  assert.equal(scoreReading({ per_100g: { energy_kcal: 600 } }, d).nutrients.wrong_flagged, 1);
  // Glare or a tilt alone, or one good photo of the table among bad ones, does not trigger it.
  for (const images of [[{ index: 1, shows: ['nutrition_table'], problems: ['glare', 'tilted'] }],
    [{ index: 1, shows: ['nutrition_table'], problems: ['blurry'] }, { index: 2, shows: ['nutrition_table'], problems: [] }]]) {
    assert.ok(!transcriptionToDraft(demoTranscription({ images }), options).alerts.some((x) => x.code === 'table_photos_poor'));
  }
});
