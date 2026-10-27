// Nutrients of the nutrition table (RSA art. 115) in label order,
// mixing of recipes and consistency checks on the values per 100 g.

import { declareValue, formatDeclared, DEFAULT_DECIMALS } from './rounding.js';

/**
 * group: 'mandatory' always declared; 'fat_breakdown' mandatory when a serving
 * has 3 g of fat or more (shown otherwise only when known); 'optional' shown when known.
 * indent: sub-nutrient row.
 */
export const NUTRIENTS = [
  { key: 'energy_kcal', unit: 'kcal', group: 'mandatory', indent: 0 },
  { key: 'protein_g', unit: 'g', group: 'mandatory', indent: 0 },
  { key: 'total_fat_g', unit: 'g', group: 'mandatory', indent: 0 },
  { key: 'saturated_fat_g', unit: 'g', group: 'fat_breakdown', indent: 1 },
  { key: 'monounsaturated_fat_g', unit: 'g', group: 'fat_breakdown', indent: 1 },
  { key: 'polyunsaturated_fat_g', unit: 'g', group: 'fat_breakdown', indent: 1 },
  { key: 'trans_fat_g', unit: 'g', group: 'fat_breakdown', indent: 1 },
  { key: 'cholesterol_mg', unit: 'mg', group: 'fat_breakdown', indent: 0 },
  { key: 'available_carbohydrates_g', unit: 'g', group: 'mandatory', indent: 0 },
  { key: 'total_sugars_g', unit: 'g', group: 'mandatory', indent: 1 },
  { key: 'dietary_fiber_g', unit: 'g', group: 'optional', indent: 0 },
  { key: 'sodium_mg', unit: 'mg', group: 'mandatory', indent: 0 },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

/** Fat in a serving from which the fat breakdown is mandatory (art. 115). */
export const FAT_BREAKDOWN_FROM_G = 3;

/**
 * In a mix, a component with this much fat or less per 100 g that does not report
 * the fat breakdown (or cholesterol) counts as 0 for it: it cannot change the result.
 */
export const LOW_FAT_COMPONENT_G = 0.5;

/** Reads { key: number } from a record's nutrition.per_100g (missing keys are left out). */
export function valuesOf(product) {
  const per100 = product.nutrition?.per_100g ?? {};
  const out = {};
  for (const key of NUTRIENT_KEYS) if (per100[key]) out[key] = per100[key].value;
  return out;
}

/**
 * Values per 100 g of a mix: sum of (component value x g / 100).
 * parts: [{ id, values, g }] with g = grams of the component in 100 g of mix.
 * Returns { values, missing: [{key, components}], assumedZero: [{key, components}], fiberOmitted }.
 */
export function mixValues(parts) {
  const values = {};
  const missing = [];
  const assumedZero = [];
  let fiberOmitted = null;
  for (const n of NUTRIENTS) {
    let sum = 0;
    const lacking = [];
    const zeroed = [];
    for (const p of parts) {
      const v = p.values[n.key];
      if (v !== undefined) { sum += (v * p.g) / 100; continue; }
      const lowFat = p.values.total_fat_g !== undefined && p.values.total_fat_g <= LOW_FAT_COMPONENT_G;
      if (n.group === 'fat_breakdown' && lowFat) zeroed.push(p.id);
      else lacking.push(p.id);
    }
    if (lacking.length) {
      if (n.group === 'optional') fiberOmitted = lacking;
      else missing.push({ key: n.key, components: lacking });
      continue;
    }
    if (zeroed.length) assumedZero.push({ key: n.key, components: zeroed });
    values[n.key] = Number(sum.toPrecision(12));
  }
  return { values, missing, assumedZero, fiberOmitted };
}

/**
 * Builds the table rows.
 * raw: values per 100 g; servingG: grams per serving.
 * Returns { rows, fatBreakdownRequired, missing: [keys] }.
 * Each row: { key, unit, indent, group, per100g, perServing } where each column is
 * { raw, value, text } or null when the value is missing.
 */
export function nutritionTable(raw, servingG, decimals = DEFAULT_DECIMALS) {
  const fat = raw.total_fat_g;
  const fatServing = fat === undefined ? undefined : (fat * servingG) / 100;
  const fatBreakdownRequired = fatServing !== undefined &&
    (fatServing >= FAT_BREAKDOWN_FROM_G || declareValue(fatServing, decimals).value >= FAT_BREAKDOWN_FROM_G);

  const column = (value) => {
    if (value === undefined) return null;
    const declared = declareValue(value, decimals);
    return { raw: value, value: declared.value, text: formatDeclared(declared) };
  };

  const rows = [];
  const missing = [];
  for (const n of NUTRIENTS) {
    const v = raw[n.key];
    const required = n.group === 'mandatory' || (n.group === 'fat_breakdown' && fatBreakdownRequired);
    if (v === undefined) {
      if (required) {
        missing.push(n.key);
        rows.push({ ...rowBase(n), per100g: null, perServing: null });
      }
      continue;
    }
    rows.push({ ...rowBase(n), per100g: column(v), perServing: column(Number(((v * servingG) / 100).toPrecision(12))) });
  }
  return { rows, fatBreakdownRequired, missing };
}

const rowBase = (n) => ({ key: n.key, unit: n.unit, indent: n.indent, group: n.group });

/** Declared value per 100 g (for seals and checks against what the label shows). */
export function declaredValues(raw, decimals = DEFAULT_DECIMALS) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = declareValue(v, decimals).value;
  return out;
}

/** Tolerances of the consistency checks. */
export const CHECKS = {
  energyRelative: 0.10, // energy vs 4P + 4C + 9F
  energyAbsoluteKcal: 5, // used when both values are small (< 50 kcal)
  fatPartsAbsoluteG: 0.3, // saturated + mono + poly + trans may exceed total fat by rounding
  fatPartsRelative: 0.02,
  fatPartsLowShare: 0.8, // parts adding up to less than 80 % of total fat look incomplete
  sugarsAbsoluteG: 0.2,
  over100gG: 102, // protein + fat + carbohydrates + fiber in 100 g
};

/**
 * Consistency checks on values per 100 g (RSA art. 115 tolerances aside, these catch
 * reading errors: shifted rows, totals instead of available carbohydrates, etc.).
 * Returns [{ check, fields, data }].
 */
export function checkValues(v) {
  const found = [];
  const has = (...keys) => keys.every((k) => v[k] !== undefined);

  if (has('energy_kcal', 'protein_g', 'available_carbohydrates_g', 'total_fat_g')) {
    const calc = 4 * v.protein_g + 4 * v.available_carbohydrates_g + 9 * v.total_fat_g;
    const declared = v.energy_kcal;
    const diff = Math.abs(calc - declared);
    const small = Math.max(calc, declared) < 50;
    const bad = small ? diff > CHECKS.energyAbsoluteKcal : diff > CHECKS.energyRelative * Math.max(declared, 1);
    if (bad) {
      found.push({
        check: 'energy',
        fields: ['energy_kcal', 'protein_g', 'available_carbohydrates_g', 'total_fat_g'],
        data: { declared, calculated: Math.round(calc), difference_pct: declared ? Math.round(((calc - declared) / declared) * 1000) / 10 : null },
      });
    }
  }

  const partKeys = ['saturated_fat_g', 'monounsaturated_fat_g', 'polyunsaturated_fat_g', 'trans_fat_g'].filter((k) => v[k] !== undefined);
  if (v.total_fat_g !== undefined && partKeys.length) {
    const parts = partKeys.reduce((s, k) => s + v[k], 0);
    const total = v.total_fat_g;
    const tolerance = Math.max(CHECKS.fatPartsAbsoluteG, CHECKS.fatPartsRelative * total);
    if (parts > total + tolerance) {
      found.push({ check: 'fat_parts', fields: ['total_fat_g', ...partKeys], data: { parts: round1(parts), total } });
    } else if (has('saturated_fat_g', 'monounsaturated_fat_g', 'polyunsaturated_fat_g') && total >= 3 && parts < CHECKS.fatPartsLowShare * total) {
      found.push({ check: 'fat_parts_low', fields: ['total_fat_g', ...partKeys], data: { parts: round1(parts), total } });
    }
  }

  if (has('total_sugars_g', 'available_carbohydrates_g') && v.total_sugars_g > v.available_carbohydrates_g + CHECKS.sugarsAbsoluteG) {
    found.push({ check: 'sugars', fields: ['total_sugars_g', 'available_carbohydrates_g'], data: { sugars: v.total_sugars_g, carbohydrates: v.available_carbohydrates_g } });
  }

  const mass = ['protein_g', 'total_fat_g', 'available_carbohydrates_g', 'dietary_fiber_g'].reduce((s, k) => s + (v[k] ?? 0), 0);
  if (mass > CHECKS.over100gG) {
    found.push({ check: 'over_100g', fields: ['protein_g', 'total_fat_g', 'available_carbohydrates_g', 'dietary_fiber_g'], data: { grams: round1(mass) } });
  }
  return found;
}

const round1 = (x) => Math.round(x * 10) / 10;
