import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSeals } from '../src/seals.js';
import { catalogIndex, allergenNames, cleanMayContain, mixAllergens } from '../src/allergens.js';
import { splitTopLevel, componentAsIngredient, segments, formatProblems, startsWithAllergen } from '../src/ingredients.js';
import { checkClaims } from '../src/claims.js';
import { nextFreeBarcode } from '../src/barcodes.js';
import { loadCatalog } from '../src/node/load-folder.js';

const due = (raw, added) => evaluateSeals(raw, raw, added).filter((s) => s.due).map((s) => s.id);

test('no seal when nothing was added, even above the limits', () => {
  assert.deepEqual(due({ energy_kcal: 596, saturated_fat_g: 6.5, total_sugars_g: 8.6, sodium_mg: 0 }, []), []);
});

test('added fat evaluates saturated fat and energy; added salt only sodium', () => {
  const raisins = { energy_kcal: 301, saturated_fat_g: 0.1, total_sugars_g: 65.7, sodium_mg: 24 };
  assert.deepEqual(due(raisins, [{ nutrient: 'fat', ingredient: 'aceite de maravilla' }]), ['energy']);
  const pistachios = { energy_kcal: 569, saturated_fat_g: 5.6, total_sugars_g: 7.7, sodium_mg: 1181.1 };
  assert.deepEqual(due(pistachios, [{ nutrient: 'sodium', ingredient: 'sal' }]), ['sodium']);
  const saltedPeanuts = { energy_kcal: 596, saturated_fat_g: 6.5, total_sugars_g: 8.6, sodium_mg: 389 };
  assert.deepEqual(due(saltedPeanuts, [{ nutrient: 'sodium', ingredient: 'sal' }]), []);
});

test('added sugar and fat: chocolate-covered peanuts get three seals', () => {
  const raw = { energy_kcal: 558, saturated_fat_g: 16.9, total_sugars_g: 29.2, sodium_mg: 18.8 };
  assert.deepEqual(due(raw, [{ nutrient: 'sugar', ingredient: 'azúcar' }, { nutrient: 'fat', ingredient: 'aceite vegetal' }]),
    ['energy', 'sugars', 'saturated_fat']);
});

test('above the limit means more than the limit; raw or declared value counts (strict)', () => {
  const fat = [{ nutrient: 'fat', ingredient: 'aceite' }];
  assert.deepEqual(due({ energy_kcal: 275, saturated_fat_g: 4 }, fat), []);
  // 275.4 kcal prints "275" but exceeds 275
  const s = evaluateSeals({ energy_kcal: 275.4 }, { energy_kcal: 275 }, fat);
  assert.equal(s.find((x) => x.id === 'energy').due, true);
  // An evaluated seal with no value is reported as unknown
  assert.equal(s.find((x) => x.id === 'saturated_fat').unknown, true);
});

test('a missing value is ruled out when its upper bound is below the limit', () => {
  // Sweetened dried cranberries: sugar and oil added, saturated fat not declared, 0.6 g total fat
  const raw = { energy_kcal: 326, total_fat_g: 0.6, available_carbohydrates_g: 83, sodium_mg: 3.42 };
  const s = evaluateSeals(raw, raw, [{ nutrient: 'sugar', ingredient: 'azúcar' }, { nutrient: 'fat', ingredient: 'aceite' }]);
  const sat = s.find((x) => x.id === 'saturated_fat');
  assert.equal(sat.unknown, false);
  assert.equal(sat.ruledOutBy, 'total_fat_g');
  assert.equal(s.find((x) => x.id === 'sugars').unknown, true); // 83 g of carbohydrates do not rule it out
});

const index = catalogIndex(loadCatalog());

test('generic tree nuts: "otros" only when the product contains a tree nut', () => {
  assert.deepEqual(allergenNames(['tree_nuts', 'peanut'], ['almond'], index), ['otros frutos de cáscara', 'maní']);
  assert.deepEqual(allergenNames(['tree_nuts'], ['peanut'], index), ['frutos de cáscara']);
  assert.deepEqual(allergenNames(['sulphites'], [], index), ['sulfitos']);
});

test('may contain drops what is in contains and duplicates', () => {
  assert.deepEqual(cleanMayContain(['peanut'], ['gluten', 'peanut', 'soy', 'gluten']), ['gluten', 'soy']);
});

test('oats: gluten in contains keeps wheat, barley and rye in may contain', () => {
  const may = cleanMayContain(['gluten'], ['wheat', 'barley', 'rye']);
  assert.deepEqual(allergenNames(may, ['gluten'], index), ['trigo', 'cebada', 'centeno']);
});

test('mix allergens: main allergens of the components first, then the rest', () => {
  const r = mixAllergens([
    { id: 'almendras', contains: ['almond'], mayContain: ['gluten', 'peanut', 'soy', 'milk', 'tree_nuts', 'mustard', 'sesame', 'sulphites'], mainIsAllergen: true },
    { id: 'pasas', contains: ['sulphites'], mayContain: ['gluten', 'peanut', 'soy', 'milk', 'tree_nuts', 'mustard', 'sesame'], mainIsAllergen: false },
    { id: 'mani', contains: ['peanut'], mayContain: ['gluten', 'soy', 'milk', 'tree_nuts', 'mustard', 'sesame', 'sulphites'], mainIsAllergen: true },
  ]);
  assert.deepEqual(r.contains, ['almond', 'peanut', 'sulphites']);
  assert.deepEqual(r.mayContain, ['gluten', 'soy', 'milk', 'tree_nuts', 'mustard', 'sesame']);
  assert.deepEqual(mixAllergens([{ id: 'x', contains: null, mayContain: null }]).missingContains, ['x']);
});

test('ingredient lists: split, nest and mark', () => {
  assert.deepEqual(splitTopLevel('cobertura (pasta, azúcar), {maní}, sal'), ['cobertura (pasta, azúcar)', '{maní}', 'sal']);
  assert.equal(componentAsIngredient('almendras', '{almendras}'), '{almendras}');
  assert.equal(componentAsIngredient('pasas', 'pasas'), 'pasas');
  assert.equal(componentAsIngredient('pasas rubias', 'pasas, aceite de maravilla, {dióxido de azufre}'),
    'pasas rubias (pasas, aceite de maravilla, {dióxido de azufre})');
  assert.equal(componentAsIngredient('maní con sal', '{maní}, sal'), 'maní con sal ({maní}, sal)');
  assert.deepEqual(segments('{maní}, sal'), [{ text: 'maní', bold: true }, { text: ', sal', bold: false }]);
  assert.equal(startsWithAllergen('{pistacho} con cáscara, sal'), true);
  assert.equal(startsWithAllergen('pasas, {dióxido de azufre}'), false);
  assert.deepEqual(formatProblems('jarabe (gluten'), ['unbalanced']);
  assert.deepEqual(formatProblems('{maní}, jarabe ({gluten})'), []);
});

test('text checks: health words with seals, false or misleading claims', () => {
  const run = (text, dueSeals, added, sugarsPerServing = 0) =>
    checkClaims([{ where: 'highlight', text }], { dueSeals, added: new Set(added), sugarsPerServing }).map((c) => c.check);
  assert.deepEqual(run('SNACK SALUDABLE', ['energy'], ['fat']), ['claim_health']);
  assert.deepEqual(run('SNACK SALUDABLE', [], []), []);
  assert.deepEqual(run('SIN SAL AÑADIDA', ['energy'], ['fat']), []); // other nutrient: allowed
  assert.deepEqual(run('SIN SAL AÑADIDA', [], ['sodium']), ['claim_no_salt_false']);
  assert.deepEqual(run('BAJO EN SODIO', ['sodium'], ['sodium']), ['claim_same_nutrient']);
  assert.deepEqual(run('SIN AZÚCAR', ['sugars', 'energy'], ['sugar']), ['claim_no_sugar_added', 'claim_same_nutrient']);
  assert.deepEqual(run('SIN AZÚCAR', [], [], 0.66), ['claim_no_sugar_natural']); // banana chips: natural sugar
  assert.deepEqual(run('SIN AZÚCAR AÑADIDA', [], [], 0.66), []);
  assert.deepEqual(run('Sin azúcar añadida', [], ['sugar']), ['claim_no_added_sugar_false']);
  assert.deepEqual(run('TOSTADO, NO FRITO', ['energy'], ['fat']), []);
});

test('next free barcode skips used and third-party codes', () => {
  const company = { barcodes: [
    { number: '7801234500150', source: 'third_party' },
    { number: '0746747013506', source: 'own' },
    { number: '0746747013513', source: 'own' },
  ] };
  const products = new Map([['a', { id: 'a', presentations: [{ net_weight_g: 50, barcode: '0746747013506' }] }]]);
  assert.equal(nextFreeBarcode(company, products), '0746747013513');
  products.set('b', { id: 'b', presentations: [{ net_weight_g: 50, barcode: '0746747013513' }] });
  assert.equal(nextFreeBarcode(company, products), null);
});
