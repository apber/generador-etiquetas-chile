import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixValues, nutritionTable, checkValues } from '../src/nutrients.js';

const full = {
  energy_kcal: 596, protein_g: 26, total_fat_g: 50, saturated_fat_g: 6.5, monounsaturated_fat_g: 41,
  polyunsaturated_fat_g: 2.5, trans_fat_g: 0, cholesterol_mg: 0, available_carbohydrates_g: 11,
  total_sugars_g: 8.6, dietary_fiber_g: 9, sodium_mg: 0,
};

test('rows follow the label order and per-serving values are rounded on their own', () => {
  const t = nutritionTable(full, 30);
  assert.deepEqual(t.rows.map((r) => r.key), Object.keys(full).filter((k) => k !== 'dietary_fiber_g' && k !== 'sodium_mg')
    .concat(['dietary_fiber_g', 'sodium_mg']));
  const energy = t.rows.find((r) => r.key === 'energy_kcal');
  assert.equal(energy.per100g.text, '596');
  assert.equal(energy.perServing.text, '179'); // 178.8
  assert.equal(t.rows.find((r) => r.key === 'polyunsaturated_fat_g').perServing.text, '0,75');
});

test('fat breakdown is mandatory from 3 g of fat per serving', () => {
  const lowFat = { energy_kcal: 300, protein_g: 3, total_fat_g: 9.8, saturated_fat_g: 1, available_carbohydrates_g: 70, total_sugars_g: 60, sodium_mg: 10 };
  let t = nutritionTable(lowFat, 30); // 2.94 g -> "2,9"
  assert.equal(t.fatBreakdownRequired, false);
  assert.deepEqual(t.missing, []);
  assert.ok(t.rows.some((r) => r.key === 'saturated_fat_g')); // shown because it is known
  assert.ok(!t.rows.some((r) => r.key === 'trans_fat_g'));

  t = nutritionTable({ ...lowFat, total_fat_g: 9.9 }, 30); // 2.97 g -> declared "3,0"
  assert.equal(t.fatBreakdownRequired, true);
  assert.deepEqual(t.missing, ['monounsaturated_fat_g', 'polyunsaturated_fat_g', 'trans_fat_g', 'cholesterol_mg']);
});

test('missing mandatory values are reported and kept as empty rows', () => {
  const { sodium_mg, ...noSodium } = full;
  const t = nutritionTable(noSodium, 30);
  assert.deepEqual(t.missing, ['sodium_mg']);
  assert.equal(t.rows.find((r) => r.key === 'sodium_mg').per100g, null);
});

test('mix values are the weighted sum of the components', () => {
  const almonds = { energy_kcal: 579, protein_g: 21.2, total_fat_g: 49.9, sodium_mg: 1, dietary_fiber_g: 12.5, saturated_fat_g: 3.8 };
  const raisins = { energy_kcal: 301, protein_g: 3.3, total_fat_g: 0.2, sodium_mg: 24, dietary_fiber_g: 3.3 };
  const peanuts = { energy_kcal: 596, protein_g: 26, total_fat_g: 50, sodium_mg: 0, saturated_fat_g: 6.5 };
  const m = mixValues([
    { id: 'a', values: almonds, g: 35 },
    { id: 'p', values: raisins, g: 35 },
    { id: 'm', values: peanuts, g: 30 },
  ]);
  assert.equal(Math.round(m.values.energy_kcal * 100) / 100, 486.8);
  assert.equal(m.values.sodium_mg, 8.75);
  // Raisins have 0.2 g fat and no saturated fat value: counted as 0
  assert.equal(m.values.saturated_fat_g, 0.35 * 3.8 + 0.3 * 6.5);
  assert.deepEqual(m.assumedZero.find((z) => z.key === 'saturated_fat_g').components, ['p']);
  // Fiber is left out when a component does not report it
  assert.equal(m.values.dietary_fiber_g, undefined);
  assert.deepEqual(m.fiberOmitted, ['m']);
  // Mandatory values missing in a component are missing in the mix
  assert.ok(m.missing.some((x) => x.key === 'available_carbohydrates_g'));
});

test('a fat-rich component without the breakdown leaves the mix without it', () => {
  const m = mixValues([
    { id: 'a', values: { total_fat_g: 49.9 }, g: 50 },
    { id: 'b', values: { total_fat_g: 0.2, saturated_fat_g: 0.1 }, g: 50 },
  ]);
  assert.deepEqual(m.missing.find((x) => x.key === 'saturated_fat_g').components, ['a']);
});

test('consistent supplier data passes every check', () => {
  assert.deepEqual(checkValues(full), []);
  // Raisins: 4P + 4C + 9F = 322 vs 301 (-6.5 %), within 10 %
  assert.deepEqual(checkValues({ energy_kcal: 301, protein_g: 3.3, total_fat_g: 0.2, available_carbohydrates_g: 76.7, total_sugars_g: 65.7 }), []);
});

test('checks catch reading errors seen in old labels', () => {
  // Hazelnut label: 100 g of fat in 100 g, energy does not add up
  const hazelnut = checkValues({ energy_kcal: 600, protein_g: 14, total_fat_g: 100, available_carbohydrates_g: 17 });
  assert.deepEqual(hazelnut.map((c) => c.check), ['energy', 'over_100g']);
  // Dates: sugars above available carbohydrates
  assert.deepEqual(checkValues({ total_sugars_g: 75.6, available_carbohydrates_g: 74.7 }).map((c) => c.check), ['sugars']);
  // Pistachio label with shifted rows: trans 8.3 g
  assert.deepEqual(checkValues({ total_fat_g: 44.7, saturated_fat_g: 5.6, monounsaturated_fat_g: 24, polyunsaturated_fat_g: 13, trans_fat_g: 8.3 }).map((c) => c.check), ['fat_parts']);
  // Peanuts with merkén: fat parts add up to half of total fat
  assert.deepEqual(checkValues({ total_fat_g: 45.9, saturated_fat_g: 6.4, monounsaturated_fat_g: 11.6, polyunsaturated_fat_g: 5.1 }).map((c) => c.check), ['fat_parts_low']);
  // Small values: absolute tolerance (butterfly pea flower: 0 kcal with 1 g carbohydrate and 1 g protein)
  assert.deepEqual(checkValues({ energy_kcal: 0, protein_g: 1, total_fat_g: 0, available_carbohydrates_g: 1 }).map((c) => c.check), ['energy']);
  assert.deepEqual(checkValues({ energy_kcal: 5, protein_g: 1, total_fat_g: 0, available_carbohydrates_g: 1 }), []);
});
