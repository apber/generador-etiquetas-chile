// Photo reading (stage 7e): transcription → draft record, validations and alerts.
// All label data here is invented (demo brand).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNumber, rowKey, rowUnit, readTable, fitsPattern, normalizeMeasure, parseServingGrams } from '../src/reading/table.js';
import { allergensInStatement, formatIngredients, addedFromIngredients, formatStorage, shelfLife } from '../src/reading/text.js';
import { transcriptionToDraft } from '../src/reading/convert.js';
import { measureImage, judgeImage } from '../src/reading/image-quality.js';
import { buildRequest, readWithGemini, parseResponse } from '../src/reading/gemini.js';
import { scoreReading } from '../src/reading/score.js';

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

test('draft: full reading of a clear label has no blocking alert', () => {
  const r = transcriptionToDraft(demoTranscription(), options);
  const c = r.draft.composition;
  assert.equal(r.summary.ready, true, JSON.stringify(r.alerts, null, 1));
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
  assert.equal(r.summary.ready, false);
});

test('draft: a repeated or doubtful allergen word asks for review', () => {
  const r = transcriptionToDraft(demoTranscription({
    may_contain_statement: null,
    other_allergen_statements: [{ text: 'Elaborado en líneas que también procesan maní, soya, sésamo/sésamo, otros frutos secos y mostaza.', legibility: 'clear' }],
  }), options);
  const a = r.alerts.find((x) => x.code === 'allergen_statement_doubtful');
  assert.ok(a && a.blocking);
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
  assert.equal(r.summary.ready, false);
  const none = transcriptionToDraft(demoTranscription({ nutrition_table: null, ingredients: null }), options);
  assert.deepEqual(none.alerts.filter((a) => a.blocking).map((a) => a.code).slice(0, 2), ['no_table', 'no_ingredients']);
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
