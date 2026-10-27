// "ALTO EN" warning seals (Ley 20.606; RSA art. 120 bis; Manual de Etiquetado MINSAL 2017).
//
// A seal is due only when BOTH hold:
//  1. sugar, fat or sodium was added (also inside a purchased ingredient), and
//  2. the nutrient related to what was added exceeds the limit per 100 g.
// Added sugar -> sugars and energy; added fat or oil -> saturated fat and energy;
// added salt or sodium -> sodium only.

/** Limits for solid foods, per 100 g. A value above the limit ("supere") gets the seal. */
export const LIMITS_SOLID = {
  energy_kcal: 275,
  total_sugars_g: 10,
  saturated_fat_g: 4,
  sodium_mg: 400,
};

/** A nutrient can never exceed this other one, so a known bound below the limit rules the seal out. */
const UPPER_BOUND = { saturated_fat_g: 'total_fat_g', total_sugars_g: 'available_carbohydrates_g' };

/** Seals in label order, with the added nutrients that make each one evaluated. */
export const SEALS = [
  { id: 'energy', nutrient: 'energy_kcal', evaluatedWhenAdded: ['sugar', 'fat'] },
  { id: 'sugars', nutrient: 'total_sugars_g', evaluatedWhenAdded: ['sugar'] },
  { id: 'saturated_fat', nutrient: 'saturated_fat_g', evaluatedWhenAdded: ['fat'] },
  { id: 'sodium', nutrient: 'sodium_mg', evaluatedWhenAdded: ['sodium'] },
];

/**
 * Evaluates every seal.
 * raw: values per 100 g before rounding; declared: as printed; added: [{ nutrient, ingredient }].
 * Strict reading: the seal is due if either the raw or the declared value exceeds the limit
 * (a mix at 275.4 kcal prints "275" but still exceeds 275).
 * Returns one entry per seal: { id, nutrient, limit, evaluated, addedBy, raw, declared, exceeds, due, unknown }.
 */
export function evaluateSeals(raw, declared, added, limits = LIMITS_SOLID) {
  return SEALS.map((s) => {
    const addedBy = added.filter((a) => s.evaluatedWhenAdded.includes(a.nutrient));
    const evaluated = addedBy.length > 0;
    const r = raw[s.nutrient];
    const d = declared[s.nutrient];
    const limit = limits[s.nutrient];
    // A missing value can still be ruled out by its upper bound (saturated fat <= total fat,
    // sugars <= available carbohydrates): e.g. cranberries with 0.6 g fat cannot reach 4 g saturated.
    const bound = r === undefined ? raw[UPPER_BOUND[s.nutrient]] : undefined;
    const boundRulesOut = bound !== undefined && bound <= limit;
    const unknown = r === undefined && !boundRulesOut;
    const exceeds = r !== undefined && (r > limit || d > limit);
    return {
      id: s.id,
      nutrient: s.nutrient,
      limit,
      evaluated,
      addedBy: addedBy.map((a) => a.ingredient),
      raw: r,
      declared: d,
      exceeds,
      due: evaluated && exceeds,
      unknown: evaluated && unknown,
      ruledOutBy: r === undefined && boundRulesOut ? UPPER_BOUND[s.nutrient] : null,
    };
  });
}
