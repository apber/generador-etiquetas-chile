// Compares a reading with the expected data, to choose model and instructions (stage 7e).
// The key number is "silent errors": a wrong value that no blocking alert flags.

import { NUTRIENT_KEYS } from '../nutrients.js';
import { normalize } from './table.js';

/**
 * expected: { per_100g: { key: number }, serving: { g, household_measure }, ingredients, contains, may_contain,
 *             country_of_origin, storage }  (any part may be left out)
 * result: output of transcriptionToDraft.
 */
export function scoreReading(expected, result) {
  const rows = [];
  const per100 = result.draft.nutrition.per_100g;
  for (const key of NUTRIENT_KEYS) {
    const want = expected.per_100g?.[key];
    const field = result.fields[key] ?? { status: 'missing' };
    const got = per100[key]?.value ?? field.value ?? null;
    if (want === undefined && got === null) continue;
    const flagged = !['ok', 'unverified'].includes(field.status) || result.alerts.some((a) => a.blocking && (a.data?.key === key || a.data?.fields?.includes(key)));
    let outcome;
    if (want === undefined) outcome = 'extra';
    else if (got === null) outcome = 'missing';
    else if (Math.abs(got - want) < 1e-6) outcome = 'right';
    else outcome = flagged ? 'wrong_flagged' : 'wrong_silent';
    rows.push({ key, want: want ?? null, got, status: field.status, outcome });
  }
  const count = (o) => rows.filter((r) => r.outcome === o).length;

  const texts = [];
  const comp = result.draft.composition;
  if (expected.ingredients !== undefined) texts.push({ field: 'ingredients', similarity: similarity(plain(expected.ingredients), plain(comp.ingredients)), want: expected.ingredients, got: comp.ingredients });
  if (expected.ingredients !== undefined) texts.push({ field: 'ingredient_marks', ok: sameList(marks(expected.ingredients), marks(comp.ingredients)), want: marks(expected.ingredients), got: marks(comp.ingredients) });
  const allergenFlagged = result.alerts.some((a) => a.blocking && /allergen|ingredients/.test(a.code));
  for (const f of ['contains', 'may_contain']) {
    if (expected[f] === undefined) continue;
    const ok = sameSet(expected[f], comp[f]);
    texts.push({ field: f, ok, flagged: !ok && allergenFlagged, want: expected[f], got: comp[f], order: f === 'contains' ? sameList(expected[f], comp[f]) : null });
  }
  if (expected.country_of_origin !== undefined) texts.push({ field: 'country_of_origin', ok: normalize(expected.country_of_origin) === normalize(comp.country_of_origin), want: expected.country_of_origin, got: comp.country_of_origin });
  if (expected.serving) {
    const s = result.draft.nutrition.serving;
    texts.push({ field: 'serving', ok: s?.g === expected.serving.g && normalize(s?.household_measure) === normalize(expected.serving.household_measure), want: expected.serving, got: s });
  }
  if (expected.added !== undefined) texts.push({ field: 'added', ok: sameSet(expected.added.map((a) => a.nutrient), comp.added.map((a) => a.nutrient)), want: expected.added, got: comp.added });

  const originFlagged = result.alerts.some((a) => a.blocking && /origin/.test(a.code));
  for (const t of texts) if (t.field === 'country_of_origin' && !t.ok) t.flagged = originFlagged;
  const silentTexts = texts.filter((t) => t.ok === false && !t.flagged && ['contains', 'may_contain', 'country_of_origin'].includes(t.field)).map((t) => t.field);
  return {
    silent_texts: silentTexts,
    nutrients: { right: count('right'), wrong_flagged: count('wrong_flagged'), wrong_silent: count('wrong_silent'), missing: count('missing'), extra: count('extra'), rows },
    texts,
    alerts: result.alerts.filter((a) => a.action !== 'none').map((a) => `${a.action}: ${a.code}`),
  };
}

const plain = (s) => normalize(String(s ?? '').replace(/[{}]/g, '')).replace(/[^a-z0-9%]+/g, ' ').trim();
const marks = (s) => [...String(s ?? '').matchAll(/\{([^}]+)\}/g)].map((m) => normalize(m[1]));
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => b.includes(x));
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => b[i] === x);

/** Word-level similarity 0-1 (1 - normalized edit distance over words). */
export function similarity(a, b) {
  const x = a ? a.split(' ') : [];
  const y = b ? b.split(' ') : [];
  if (!x.length && !y.length) return 1;
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...new Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return Math.round((1 - d[x.length][y.length] / Math.max(x.length, y.length)) * 1000) / 1000;
}
