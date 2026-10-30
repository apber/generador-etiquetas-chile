// Nutrition table as transcribed by the AI → values per 100 g with a status per nutrient.
// Rules (stage 7e):
//  - Each printed row is mapped to a nutrient by its name (fixed patterns, not by the AI).
//  - Units are brought to the ones of the label (kcal, g, mg).
//  - Double reading at no extra cost: each value per 100 g is checked against its value
//    per serving (value x serving / 100, allowing for the rounding of both).
//  - A value per 100 g that cannot be read is derived from the serving column (with alert).

import { NUTRIENT_KEYS, NUTRIENTS, FAT_BREAKDOWN_FROM_G } from '../nutrients.js';

const KJ_PER_KCAL = 4.184;

/** Lowercase, without accents, single spaces. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Number in a printed cell. Chilean labels use comma decimals and dot thousands;
 * web pages may use a dot decimal.
 * Returns { value, qualifier, unreadable, ambiguous } (value null when there is no number).
 */
export function parseNumber(text) {
  const raw = String(text ?? '').trim();
  const out = { value: null, qualifier: null, unreadable: raw.includes('?'), ambiguous: false };
  if (!raw || out.unreadable) return out;
  const q = raw.match(/^(<|>|≤|≥|menos de|aprox\.?|~)/i);
  if (q) out.qualifier = q[1].toLowerCase().startsWith('menos') ? '<' : q[1];
  // "9 4g": a worn comma between digits (old or rubbed labels) → read as decimal, marked ambiguous.
  const worn = raw.match(/^\D*?(\d{1,3})\s+(\d{1,2})\s*[a-zµ]*\s*$/i);
  if (worn) {
    out.value = Number(`${worn[1]}.${worn[2]}`);
    out.ambiguous = true;
    return out;
  }
  const m = raw.replace(/\s/g, '').match(/\d[\d.,]*/);
  if (!m) return out;
  let s = m[0].replace(/[.,]$/, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = dec === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot && /^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    // "1.181": thousands in Chile, decimal in many web pages.
    out.ambiguous = true;
    s = s.replace(/\./g, '');
  }
  const value = Number(s);
  out.value = Number.isFinite(value) ? value : null;
  return out;
}

/** Decimals written in a cell (for the rounding allowance). */
export function decimalsIn(text) {
  const m = String(text ?? '').match(/\d[.,](\d+)\s*$/) || String(text ?? '').match(/\d[.,](\d+)/);
  return m ? m[1].length : 0;
}

/**
 * Which nutrient a printed row is. Returns a nutrient key, or one of
 * 'energy_kj', 'carbohydrates_total_g', 'carbohydrates_unspecified_g', 'salt_g', 'added_sugars_g', or null.
 */
export function rowKey(label, unit) {
  const l = normalize(label);
  const u = normalize(unit);
  if (/energ|calor|valor energ/.test(l)) return /kj/.test(u) || /\bkj\b/.test(l) ? 'energy_kj' : 'energy_kcal';
  if (/prote/.test(l)) return 'protein_g';
  if (/\bmono|monoins|mono-/.test(l)) return 'monounsaturated_fat_g';
  if (/\bpoli|\bpoly|poliins|polins/.test(l)) return 'polyunsaturated_fat_g';
  if (/satur/.test(l)) return 'saturated_fat_g';
  if (/colest/.test(l)) return 'cholesterol_mg';
  if (/\btrans\b/.test(l)) return 'trans_fat_g';
  if (/azucar/.test(l)) return /anadid|agregad/.test(l) ? 'added_sugars_g' : 'total_sugars_g';
  if (/fibra/.test(l)) return 'dietary_fiber_g';
  if (/sodio/.test(l)) return 'sodium_mg';
  if (/^sal\b/.test(l)) return 'salt_g';
  if (/h\.? ?de ?c\b|h\. ?de ?c\.|hidrato|carbohidrat|\bde carbono\b/.test(l)) {
    if (/disponib|\bdisp\b/.test(l)) return 'available_carbohydrates_g';
    if (/total/.test(l)) return 'carbohydrates_total_g';
    return 'carbohydrates_unspecified_g';
  }
  if (/grasa|lipid/.test(l)) return 'total_fat_g';
  return null;
}

const CANONICAL_UNIT = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.unit]));
Object.assign(CANONICAL_UNIT, { energy_kj: 'kJ', carbohydrates_total_g: 'g', carbohydrates_unspecified_g: 'g', salt_g: 'g', added_sugars_g: 'g' });

/** Unit of a row: the printed one, or the one in the label ("Sodio (mg)"). */
export function rowUnit(label, unit) {
  const fromUnit = normalize(unit);
  const fromLabel = (normalize(label).match(/\((kcal|kj|mg|mcg|µg|ug|g)\)/) || [])[1];
  const u = fromUnit || fromLabel || null;
  if (!u) return null;
  if (u === 'mcg' || u === 'ug' || u === 'µg') return 'µg';
  if (u.startsWith('kcal') || u === 'cal') return 'kcal';
  if (u.startsWith('kj')) return 'kJ';
  if (u.startsWith('mg')) return 'mg';
  if (u === 'g' || u.startsWith('g ') || u === 'gr' || u === 'grs' || u === 'gramos') return 'g';
  return u;
}

/** Factor to bring a printed unit to the label unit (null if it cannot be converted). */
function unitFactor(key, printed) {
  const target = CANONICAL_UNIT[key];
  if (!printed || printed === target) return 1;
  const table = { g: { mg: 1000, 'µg': 1e6 }, mg: { g: 0.001, 'µg': 1000 } };
  if (table[printed]?.[target] !== undefined) return table[printed][target];
  return null;
}

/** Allowance when comparing a value per 100 g with its value per serving. */
export function servingAllowance(v100, text100, vServing, textServing, servingG) {
  const expected = (v100 * servingG) / 100;
  const half = (d) => 0.5 * 10 ** -d;
  return half(decimalsIn(textServing)) + half(decimalsIn(text100)) * (servingG / 100) + 0.02 * Math.max(expected, vServing) + 1e-9;
}

/** Does a doubtful text with "?" fit a number? ("1?,5" fits 18.5 written with 1 decimal) */
export function fitsPattern(text, value) {
  const t = String(text ?? '').trim();
  if (!t.includes('?')) return false;
  const d = (t.match(/[.,]([\d?]+)\s*$/) || [])[1]?.length ?? 0;
  const candidate = value.toFixed(d);
  const sep = t.includes(',') ? ',' : '.';
  const written = candidate.replace('.', sep);
  const re = new RegExp('^' + t.replace(/[.*+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '\\d') + '$');
  return re.test(written);
}

/**
 * Reads one cell: number from the text (the source of truth) compared with the AI's number.
 * Returns { text, value, legible, note } where legible = usable without doubt.
 */
function readCell(cell, factor) {
  if (!cell) return null;
  const parsed = parseNumber(cell.text);
  let value = parsed.value;
  let legible = cell.legibility === 'clear' && value !== null && !parsed.unreadable;
  let note = null;
  if (value !== null && cell.value !== null && cell.value !== undefined && Math.abs(cell.value - value) > 1e-9) {
    legible = false;
    note = 'ai_number_differs';
  }
  if (parsed.ambiguous) note = note ?? 'thousands_or_decimal';
  if (parsed.qualifier === '<') note = note ?? 'less_than';
  if (value !== null && factor !== 1) value = Number((value * factor).toPrecision(12));
  return { text: cell.text, value, legible, legibility: cell.legibility, note, qualifier: parsed.qualifier, ambiguous: parsed.ambiguous };
}

/**
 * Turns the transcribed table into values per 100 g.
 * Returns {
 *   values: { key: number }                 accepted values (status ok, unverified or derived)
 *   fields: { key: { status, value, per100, perServing, unit, label, note } }
 *   serving: { g, householdMeasure, text, legible }
 *   issues: [{ code, ...data }]             problems for the alert list
 * }
 * status: ok (checked against the serving column) | unverified (no serving column to check)
 *         | derived (from the serving column) | doubtful | mismatch | missing
 */
export function readTable(table) {
  const issues = [];
  const fields = {};
  if (!table || !Array.isArray(table.rows) || !table.rows.length) {
    return { values: {}, fields, serving: null, issues: [{ code: 'no_table' }] };
  }

  // Serving
  const sText = table.serving_text?.text ?? null;
  const g = typeof table.serving_g === 'number' && table.serving_g > 0 ? table.serving_g : null;
  const gInText = sText ? parseServingGrams(sText) : null;
  const serving = {
    g: g ?? gInText,
    householdMeasure: normalizeMeasure(table.household_measure),
    text: sText,
    legible: table.serving_text?.legibility === 'clear',
  };
  if (serving.g !== null && gInText !== null && Math.abs(gInText - serving.g) > 1e-9) {
    issues.push({ code: 'serving_differs', printed: gInText, read: serving.g });
    serving.g = gInText;
  }
  if (!serving.g) issues.push({ code: 'no_serving' });
  else if (!serving.legible) issues.push({ code: 'serving_doubtful', text: sText, g: serving.g });

  // Column headers
  const h100 = normalize(table.per_100_header);
  if (table.per_100_header && !/100/.test(h100)) issues.push({ code: 'header_not_100', header: table.per_100_header });
  const hasServingColumn = table.rows.some((r) => r.per_serving && r.per_serving.text && r.per_serving.text.trim() !== '');

  // Rows → candidate cells per key
  const byKey = {};
  for (const row of table.rows) {
    const key = rowKey(row.label, row.unit);
    if (!key) continue;
    const printedUnit = rowUnit(row.label, row.unit);
    const factor = unitFactor(key, printedUnit);
    if (factor === null) { issues.push({ code: 'unit_unknown', label: row.label, unit: row.unit }); continue; }
    if (factor !== 1) issues.push({ code: 'unit_converted', key, from: printedUnit, to: CANONICAL_UNIT[key] });
    if (byKey[key]) { issues.push({ code: 'row_repeated', key, label: row.label }); continue; }
    byKey[key] = { label: row.label, unit: printedUnit, per100: readCell(row.per_100, factor), perServing: readCell(row.per_serving, factor) };
  }

  // Serving column without a known serving weight: the legible pairs must keep one proportion with the 100 g
  // column. If they do, the serving weight is deduced (and unreadable values per 100 g can be derived);
  // if they do not, the reading of the table is not reliable (e.g. a worn label read with confidence).
  let disagreeNoServing = false;
  if (!serving.g && hasServingColumn) {
    const pairs = Object.entries(byKey).filter(([, r]) => r.per100?.legible && r.perServing?.legible && r.per100.value > 0);
    const big = pairs.filter(([, r]) => r.per100.value >= 10).map(([, r]) => r.perServing.value / r.per100.value).sort((x, y) => x - y);
    if (big.length >= 2) {
      const g = Math.round(big[Math.floor(big.length / 2)] * 100);
      const off = pairs.filter(([, r]) => Math.abs((r.per100.value * g) / 100 - r.perServing.value) > servingAllowance(r.per100.value, r.per100.text, r.perServing.value, r.perServing.text, g) + 0.05 * r.perServing.value);
      if (off.length || g <= 0) {
        disagreeNoServing = true;
        issues.push({ code: 'columns_disagree_no_serving', keys: off.map(([k]) => k) });
      } else {
        serving.g = g;
        serving.inferred = true;
        issues.push({ code: 'serving_inferred', g });
      }
    }
  }

  // Per key: decide value and status
  const decided = {};
  for (const [key, r] of Object.entries(byKey)) {
    decided[key] = disagreeNoServing
      ? { status: 'mismatch', value: r.per100?.value ?? null, note: 'columns_disagree_no_serving' }
      : decide(r, serving.g, hasServingColumn);
  }

  // Serving column calculated for another weight? (all rows off by the same factor)
  if (serving.g && hasServingColumn) {
    const ratios = Object.values(byKey)
      .filter((r) => r.per100?.legible && r.perServing?.legible && r.per100.value >= 1 && r.perServing.value > 0)
      .map((r) => (r.perServing.value / r.per100.value) * 100);
    if (ratios.length >= 3) {
      const sorted = [...ratios].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const agree = ratios.filter((x) => Math.abs(x - median) <= 0.04 * median).length;
      if (agree >= Math.ceil(ratios.length * 0.7) && Math.abs(median - serving.g) > 0.06 * serving.g) {
        issues.push({ code: 'serving_column_other_weight', declared: serving.g, computed: Math.round(median) });
        for (const k of Object.keys(decided)) {
          if (decided[k].status === 'mismatch' && byKey[k].per100?.legible) decided[k] = { ...decided[k], status: 'unverified', note: 'serving_column_other_weight' };
        }
      }
    }
  }

  if (serving.inferred) issues.splice(issues.findIndex((i) => i.code === 'no_serving'), 1);

  // Energy in kJ only
  if (!decided.energy_kcal && decided.energy_kj?.value !== undefined && decided.energy_kj.value !== null) {
    const kj = decided.energy_kj;
    decided.energy_kcal = { ...kj, value: Math.round(kj.value / KJ_PER_KCAL), note: 'from_kj' };
    issues.push({ code: 'energy_from_kj', kj: kj.value });
  }
  // Salt only
  if (!decided.sodium_mg && decided.salt_g?.value !== undefined && decided.salt_g.value !== null) {
    decided.sodium_mg = { ...decided.salt_g, value: Math.round(decided.salt_g.value * 400), note: 'from_salt' };
    issues.push({ code: 'sodium_from_salt', salt: decided.salt_g.value });
  }

  // Carbohydrates: available, or total - fiber
  const fiber = decided.dietary_fiber_g;
  if (!decided.available_carbohydrates_g) {
    const total = decided.carbohydrates_total_g;
    const unspecified = decided.carbohydrates_unspecified_g;
    if (total) {
      if (fiber && fiber.value !== null) {
        decided.available_carbohydrates_g = { ...total, value: round1(total.value - fiber.value), note: 'total_minus_fiber' };
        issues.push({ code: 'carbs_total_converted', total: total.value, fiber: fiber.value });
      } else {
        decided.available_carbohydrates_g = { ...total, status: 'doubtful', note: 'total_without_fiber' };
        issues.push({ code: 'carbs_total_no_fiber', total: total.value });
      }
    } else if (unspecified) {
      decided.available_carbohydrates_g = { ...unspecified, note: unspecified.status === 'mismatch' ? unspecified.note : 'unspecified' };
      issues.push({ code: 'carbs_unspecified', label: byKey.carbohydrates_unspecified_g.label });
    }
  }

  // Result per nutrient of the label
  const values = {};
  for (const key of NUTRIENT_KEYS) {
    const d = decided[key];
    const src = byKey[key] ?? byKey[{ energy_kcal: 'energy_kj', sodium_mg: 'salt_g' }[key]] ??
      (key === 'available_carbohydrates_g' ? (byKey.carbohydrates_total_g ?? byKey.carbohydrates_unspecified_g) : undefined);
    if (!d) { fields[key] = { status: 'missing' }; continue; }
    fields[key] = { status: d.status, value: d.value, note: d.note ?? null, label: src?.label ?? null, unit: src?.unit ?? null,
      per100: src?.per100 ?? null, perServing: src?.perServing ?? null };
    if (['ok', 'unverified', 'derived'].includes(d.status) && d.value !== null) values[key] = d.value;
  }

  // Missing rows
  const fat = values.total_fat_g;
  const fatBreakdownRequired = fat !== undefined && serving.g ? (fat * serving.g) / 100 >= FAT_BREAKDOWN_FROM_G : fat !== undefined && fat >= 10;
  for (const n of NUTRIENTS) {
    if (fields[n.key].status !== 'missing') continue;
    if (n.group === 'mandatory' || (n.group === 'fat_breakdown' && fatBreakdownRequired)) {
      issues.push({ code: 'row_missing', key: n.key, mandatoryBecauseFat: n.group === 'fat_breakdown' });
    }
  }
  if (!hasServingColumn) issues.push({ code: 'no_serving_column' });

  return { values, fields, serving, issues, hasServingColumn };
}

function decide(r, servingG, hasServingColumn) {
  const a = r.per100;
  const b = r.perServing;
  const hasA = a && a.value !== null;
  const hasB = b && b.value !== null;
  if (!hasA && !hasB) return { status: (a || b) ? 'doubtful' : 'missing', value: null, note: 'unreadable' };

  if (hasA && hasB && servingG) {
    const allowance = servingAllowance(a.value, a.text, b.value, b.text, servingG);
    const consistent = Math.abs((a.value * servingG) / 100 - b.value) <= allowance;
    if (consistent) {
      if (!a.legible && b.legible) {
        // A doubtful value per 100 g is confirmed only if it is the value the serving column gives
        // (0,3 g in 30 g gives 1,0: it confirms a doubtful 1,0 but not a doubtful 1,2, which also fits by rounding).
        const d = decimalsIn(a.text);
        const fromServing = Math.round(((b.value * 100) / servingG) * 10 ** d) / 10 ** d;
        if (Math.abs(fromServing - a.value) > 1e-9) return derive(b, servingG, 'derived_doubtful_per100');
      }
      // Both say the same: a doubtful reading is confirmed by the other column.
      return { status: 'ok', value: a.value, note: a.legible && b.legible ? null : 'confirmed_by_other_column' };
    }
    if (a.legible && !b.legible) return { status: 'ok', value: a.value, note: 'serving_cell_doubtful' };
    if (!a.legible && b.legible) return derive(b, servingG);
    return { status: 'mismatch', value: a.value, note: 'columns_disagree' };
  }
  if (hasA && b && !hasB && servingG && fitsPattern(b.text, (a.value * servingG) / 100)) {
    return { status: 'ok', value: a.value, note: 'serving_cell_fits' };
  }
  if (!hasA && hasB && servingG) {
    if (a && fitsPattern(a.text, (b.value * 100) / servingG)) return derive(b, servingG, 'per100_fits');
    return derive(b, servingG);
  }
  if (hasA) {
    if (!a.legible) return { status: 'doubtful', value: a.value, note: a.note ?? 'per100_doubtful' };
    return { status: hasServingColumn && servingG ? 'unverified' : 'unverified', value: a.value, note: a.note ?? (hasServingColumn ? 'serving_cell_missing' : null) };
  }
  return { status: 'doubtful', value: null, note: 'no_serving_to_derive' };
}

function derive(b, servingG, note = 'derived_from_serving') {
  if (!b.legible) return { status: 'doubtful', value: null, note: 'both_doubtful' };
  return { status: 'derived', value: round1((b.value * 100) / servingG), note };
}

const round1 = (x) => Math.round(x * 10) / 10;

/** Grams of the serving in a serving line ("1/4 taza (30 g)" → 30). */
export function parseServingGrams(text) {
  const m = String(text).match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos)\b/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const FRACTIONS = { '1/4': '¼', '1/2': '½', '3/4': '¾', '1/3': '⅓', '2/3': '⅔', '1/8': '⅛' };

/** "1/4 taza" → "¼ taza"; trims a trailing "(30 g)". */
export function normalizeMeasure(text) {
  if (!text) return null;
  let t = String(text).replace(/\(?\s*\d+(?:[.,]\d+)?\s*(g|gr|grs|gramos)\s*\)?/i, '').trim();
  for (const [k, v] of Object.entries(FRACTIONS)) t = t.replace(new RegExp(`(^|\\s)${k.replace('/', '\\/')}(?=\\s|$)`), `$1${v}`);
  t = t.replace(/\s+/g, ' ').replace(/[,;:]$/, '').trim();
  return t ? t.toLowerCase() : null;
}
