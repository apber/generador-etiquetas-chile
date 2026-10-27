// Rounding and number formatting for the nutrition table (RSA art. 115).
//
// How values are declared (art. 115):
//   100 or more         -> integer
//   10 to less than 100 -> integer or 1 decimal
//   1 to less than 10   -> integer or up to 2 decimals
//   less than 1         -> up to 2 decimals
// Rounding: a dropped digit of 5 or more rounds up.

/** Decimals used for each range. Every option is allowed by art. 115. */
export const DEFAULT_DECIMALS = { from100: 0, from10: 1, from1: 1, below1: 2 };

/**
 * Half-up rounding that is safe against binary floating point
 * (e.g. 1.005 -> 1.01, 0.3 * 18.5 -> 5.55 -> 5.6).
 */
export function roundHalfUp(value, decimals) {
  if (!Number.isFinite(value)) throw new Error(`Not a number: ${value}`);
  const factor = 10 ** decimals;
  const scaled = Number((Math.abs(value) * factor).toPrecision(12));
  const rounded = Math.floor(scaled + 0.5) / factor;
  return value < 0 ? -rounded : rounded;
}

function decimalsFor(value, decimals) {
  if (value >= 100) return decimals.from100;
  if (value >= 10) return decimals.from10;
  if (value >= 1) return decimals.from1;
  return decimals.below1;
}

/**
 * Rounds a nutrient value as it will be declared.
 * The range is chosen again after rounding, so 99.96 becomes 100 (not 100.0)
 * and 0.996 becomes 1.0.
 * Returns { value, decimals } where value is the declared number.
 */
export function declareValue(raw, decimals = DEFAULT_DECIMALS) {
  if (raw < 0) throw new Error(`Negative nutrient value: ${raw}`);
  let d = decimalsFor(raw, decimals);
  let value = roundHalfUp(raw, d);
  const d2 = decimalsFor(value, decimals);
  if (d2 !== d) {
    d = d2;
    value = roundHalfUp(raw, d);
  }
  return { value, decimals: d };
}

/**
 * Formats a declared value with a decimal comma and no thousands separator.
 * In the 1 to 100 range the fixed decimal is kept (26,0) so the column looks even;
 * below 1, trailing zeros are dropped (0,10 -> 0,1; 0,00 -> 0).
 */
export function formatDeclared({ value, decimals }) {
  if (value === 0) return '0';
  let text = value.toFixed(decimals);
  if (value < 1 && text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text.replace('.', ',');
}

/** Formats any number with a decimal comma, dropping trailing zeros (e.g. net weight 50 -> "50", 12.5 -> "12,5"). */
export function formatPlain(value) {
  return String(Number(value.toPrecision(12))).replace('.', ',');
}

/**
 * Servings per package (art. 115): a whole number with normal rounding;
 * if rounded up, "aprox." is mandatory.
 *
 * approx: 'when_not_exact' (default; also marks values rounded down, which is
 * always true and matches the official label) or 'when_rounded_up' (legal minimum).
 * Never less than 1.
 */
export function servingsPerPackage(contentG, servingG, approx = 'when_not_exact') {
  if (!(contentG > 0) || !(servingG > 0)) throw new Error('Content and serving must be positive');
  const exact = Number((contentG / servingG).toPrecision(12));
  const count = Math.max(1, roundHalfUp(exact, 0));
  const isExact = count === exact;
  const roundedUp = count > exact;
  const showApprox = approx === 'when_rounded_up' ? roundedUp : !isExact;
  return { exact, count, approx: showApprox, text: showApprox ? `aprox. ${count}` : String(count) };
}
