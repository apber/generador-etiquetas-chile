import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { buildLabelData, REMOVE_SEAL } from '../src/label-data.js';

const demo = () => loadFolder(DEMO_FOLDER);
const build = (store, productId, extra = {}, options) => buildLabelData(store, { productId, ...extra }, options);
const row = (d, key) => d.nutrition.rows.find((r) => r.key === key);
const codes = (d) => d.alerts.map((a) => a.code);

/** Copy of the demo store with one record changed. */
function withProduct(store, id, change) {
  const products = new Map(store.products);
  products.set(id, change(structuredClone(store.products.get(id))));
  return { ...store, products };
}

test('simple product without additions: no seals, slogan without seals', () => {
  const d = build(demo(), 'mani-tostado');
  assert.deepEqual(d.front.seals, []);
  assert.equal(d.front.slogan, 'DEL HUERTO A TU MESA');
  assert.equal(d.nutrition.servingsPerPackage.text, 'aprox. 3');
  assert.equal(d.nutrition.serving.text, 'Porción: ¼ taza (30 g)');
  assert.equal(row(d, 'energy_kcal').perServing.text, '177');
  assert.equal(d.contains.text, 'maní');
  assert.equal(d.mayContain.text, 'frutos de cáscara, soya, sésamo');
  assert.equal(d.packer.title, 'ENVASADO POR:');
  assert.equal(d.packer.text, 'Empresa Demo SpA, Calle Ficticia 123, Ciudad Demo, Chile.');
  assert.deepEqual(d.origin, { title: 'ORIGEN:', text: 'Chile' });
  assert.equal(d.storage, 'Conservar en lugar fresco y seco.');
  assert.deepEqual(d.blocking, { review: [], ask: [] });
  assert.ok(codes(d).includes('over_limit_not_added:energy'));
});

test('added sugar and fat: three seals, slogan with seals, own storage text', () => {
  const d = build(demo(), 'almendras-chocolate');
  assert.deepEqual(d.front.seals, ['energy', 'sugars', 'saturated_fat']);
  assert.deepEqual(d.front.sealNames, ['ALTO EN CALORÍAS', 'ALTO EN AZÚCARES', 'ALTO EN GRASAS SATURADAS']);
  assert.equal(d.front.slogan, 'SABOR EN CADA BOCADO');
  assert.equal(d.contains.text, 'almendras, leche, soya');
  assert.equal(d.mayContain.text, 'maní, otros frutos de cáscara, gluten');
  assert.equal(d.storage, 'Conservar en lugar fresco y seco. Se recomienda refrigerar.');
  assert.ok(d.ingredients.segments.some((s) => s.bold && s.text === 'leche'));
});

test('in-shell product: note, sodium seal and servings on the edible part', () => {
  const store = demo();
  let d = build(store, 'pistachos-salados');
  assert.equal(d.nutrition.note, 'Valores por 100 g de parte comestible (sin cáscara)');
  assert.deepEqual(d.front.seals, ['sodium']);
  assert.equal(d.nutrition.servingsPerPackage.basedOnG, 50); // 100 g with shell, 50 g edible
  assert.equal(d.nutrition.servingsPerPackage.text, 'aprox. 2');
  // Without the edible part: alert, servings on the weight with shell
  d = build(withProduct(store, 'pistachos-salados', (p) => { delete p.composition.edible_g_per_100g; return p; }), 'pistachos-salados');
  assert.ok(d.blocking.ask.includes('missing_edible_part'));
  assert.equal(d.nutrition.servingsPerPackage.text, 'aprox. 3');
});

test('mix: weighted table, seals from what any component adds, ingredients and origin', () => {
  const d = build(demo(), 'mezcla-demo');
  assert.equal(row(d, 'energy_kcal').per100g.text, '474'); // 0.6·590 + 0.4·300
  assert.equal(row(d, 'saturated_fat_g').per100g.text, '4,2');
  assert.deepEqual(d.front.seals, ['energy', 'saturated_fat']); // oil in the raisins
  assert.equal(d.ingredients.text, '{maní}, pasas (pasas, aceite de maravilla)');
  assert.equal(d.contains.text, 'maní');
  assert.equal(d.mayContain.text, 'frutos de cáscara, soya, sésamo');
  assert.equal(d.packer.title, 'ELABORADO Y ENVASADO EN CHILE POR:');
  assert.equal(d.packer.text, 'Empresa Demo SpA, Calle Ficticia 123, Ciudad Demo.');
  assert.deepEqual(d.origin, { title: 'ORIGEN DE LOS INGREDIENTES:', text: 'Chile' });
  assert.equal(d.nutrition.servingsPerPackage.text, '5');
  assert.deepEqual(d.variant, [{ component: 'mani-tostado', used: 'mani-tostado' }, { component: 'pasas-con-aceite', used: 'pasas-con-aceite' }]);
  assert.ok(codes(d).includes('assumed_zero:monounsaturated_fat_g'));
});

test('mix: origin grouped by country and the plain packer title option', () => {
  const store = withProduct(demo(), 'pasas-con-aceite', (p) => { p.composition.country_of_origin = 'Argentina'; return p; });
  const d = build(store, 'mezcla-demo', {}, { mixPackerTitle: 'plain' });
  assert.equal(d.origin.text, 'Chile (maní); Argentina (pasas)');
  assert.equal(d.packer.title, 'ELABORADO Y ENVASADO POR:');
  assert.equal(d.packer.text, 'Empresa Demo SpA, Calle Ficticia 123, Ciudad Demo, Chile.');
});

test('mix: missing origin of a component is named, the rest is printed', () => {
  const store = withProduct(demo(), 'pasas-con-aceite', (p) => { p.composition.country_of_origin = null; return p; });
  const d = build(store, 'mezcla-demo');
  assert.equal(d.origin.text, 'Chile (maní)');
  assert.ok(d.blocking.ask.includes('pasas-con-aceite/missing_origin'));
  assert.match(d.alerts.find((a) => a.code === 'pasas-con-aceite/missing_origin').message, /\(en pasas\)/);
});

test('mix: a variant must be a listed alternative, and a missing record stops the mix', () => {
  const store = withProduct(demo(), 'mezcla-demo', (p) => { p.recipe.components[1].alternatives = ['pasas-morenas']; return p; });
  assert.throws(() => build(store, 'mezcla-demo', { variant: { 'pasas-con-aceite': 'otra' } }));
  const d = build(store, 'mezcla-demo', { variant: { 'pasas-con-aceite': 'pasas-morenas' } });
  assert.equal(d.incomplete, true);
  assert.deepEqual(d.blocking.review, ['missing_component:pasas-morenas']);
});

test('net weight can be given at print time', () => {
  const d = build(demo(), 'mani-tostado', { netWeightG: 250 });
  assert.equal(d.front.netWeight.text, '250 g');
  assert.equal(d.nutrition.servingsPerPackage.text, 'aprox. 8');
});

test('inconsistent data must be reviewed; a confirmation releases it', () => {
  let store = withProduct(demo(), 'mani-tostado', (p) => { p.nutrition.per_100g.energy_kcal.value = 400; return p; });
  let d = build(store, 'mani-tostado');
  assert.deepEqual(d.blocking.review, ['inconsistent_energy']);
  assert.match(d.alerts.find((a) => a.code === 'inconsistent_energy').detail, /calculada .* 597 kcal \(49,3 %\)/);
  store = withProduct(store, 'mani-tostado', (p) => {
    p.confirmed_alerts = [{ alert: 'inconsistent_energy', decision: 'supplier_confirmed', date: '2026-10-27' }];
    return p;
  });
  d = build(store, 'mani-tostado');
  assert.deepEqual(d.blocking.review, []);
  assert.equal(d.alerts.find((a) => a.code === 'inconsistent_energy').confirmed.decision, 'supplier_confirmed');
});

test('missing data asks before printing', () => {
  const store = withProduct(demo(), 'mani-tostado', (p) => {
    p.composition.country_of_origin = null;
    p.composition.may_contain = null;
    delete p.nutrition.per_100g.sodium_mg;
    p.presentations[0].barcode = null;
    p.ring_color = null;
    return p;
  });
  const d = build(store, 'mani-tostado');
  assert.deepEqual(d.blocking.ask.sort(), ['missing_barcode', 'missing_may_contain', 'missing_nutrient:sodium_mg', 'missing_origin']);
  assert.deepEqual(d.blocking.review, []);
  assert.equal(d.origin.text, null);
  assert.equal(d.mayContain.text, null);
  assert.ok(codes(d).includes('missing_ring_color'));
});

test('reference data (not from the supplier) is flagged once per source', () => {
  const store = withProduct(demo(), 'mani-tostado', (p) => {
    p.sources.push({ id: 'usda', level: 3, kind: 'reference_table', from: 'USDA FoodData Central', date: '2026-10-27' });
    p.nutrition.per_100g.sodium_mg.source = 'usda';
    p.nutrition.per_100g.dietary_fiber_g.source = 'usda';
    return p;
  });
  const d = build(store, 'mani-tostado');
  const a = d.alerts.find((x) => x.code === 'reference_data:usda');
  assert.deepEqual(a.fields, ['dietary_fiber_g', 'sodium_mg']);
  assert.equal(a.print, 'ask');
});

test('claims are checked against the seals and what was added', () => {
  const store = withProduct(demo(), 'almendras-chocolate', (p) => { p.highlight = ['SNACK SALUDABLE', 'SIN AZÚCAR AÑADIDA']; return p; });
  const d = build(store, 'almendras-chocolate');
  assert.deepEqual(d.blocking.review, ['claim_health:highlight', 'claim_no_added_sugar_false:highlight', 'claim_same_nutrient:highlight:sugars']);
});

test('removing a seal that is due needs a recorded decision and keeps the slogan with seals', () => {
  const store = withProduct(demo(), 'pasas-con-aceite', (p) => {
    p.confirmed_alerts = [{ alert: REMOVE_SEAL('energy'), decision: 'remove_seal', date: '2026-10-27', note: 'Aukan asume el riesgo' }];
    return p;
  });
  const d = build(store, 'pasas-con-aceite');
  assert.deepEqual(d.seals.due, ['energy']);
  assert.deepEqual(d.front.seals, []);
  assert.equal(d.front.slogan, 'SABOR EN CADA BOCADO');
  const a = d.alerts.find((x) => x.code === 'seal_removed:energy');
  assert.equal(a.kind, 'regulatory');
  assert.equal(a.confirmed.note, 'Aukan asume el riesgo');
});

test('management-only products have no label', () => {
  assert.throws(() => build(demo(), 'salsa-demo'), /management-only/);
});
