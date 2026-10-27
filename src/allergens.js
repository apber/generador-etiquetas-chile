// CONTIENE (contains) and PUEDE CONTENER (may contain).
// Rules: contains = allergens present as ingredients (also in sub-ingredients), main one first;
// may contain = cross-contact declared by the supplier, without repeating what is in contains.
// Generic "tree_nuts": "otros frutos de cáscara" if the product contains a tree nut,
// "frutos de cáscara" otherwise.

export function catalogIndex(catalog) {
  return new Map(catalog.allergens.map((a) => [a.id, a]));
}

/** Drops from mayContain what is already in contains, keeping order and removing duplicates. */
export function cleanMayContain(contains, mayContain) {
  const inContains = new Set(contains);
  return [...new Set(mayContain)].filter((id) => !inContains.has(id));
}

/** Printed names (Spanish by default) for a list of ids. Unknown ids are returned as they are. */
export function allergenNames(ids, containsIds, index, lang = 'es') {
  const containsTreeNut = containsIds.some((id) => index.get(id)?.group === 'tree_nuts');
  return ids.map((id) => {
    const a = index.get(id);
    if (!a) return id;
    if (a.generic && containsTreeNut && a.name_if_contains_any) return a.name_if_contains_any[lang];
    return a.name[lang];
  });
}

/**
 * Allergens of a mix from its components, heaviest first (ties in recipe order).
 * parts: [{ id, contains, mayContain, mainIsAllergen }] where mainIsAllergen means the
 * component itself is its first allergen (e.g. almonds), not an additive (e.g. sulphites in raisins).
 * Main allergens of the components go first; then the rest in order of appearance.
 * Returns { contains, mayContain, missingContains: [ids], missingMayContain: [ids] }.
 */
export function mixAllergens(parts) {
  const missingContains = parts.filter((p) => p.contains == null).map((p) => p.id);
  const missingMayContain = parts.filter((p) => p.mayContain == null).map((p) => p.id);
  const main = [];
  const rest = [];
  for (const p of parts) {
    (p.contains ?? []).forEach((id, i) => (i === 0 && p.mainIsAllergen ? main : rest).push(id));
  }
  const contains = [...new Set([...main, ...rest])];
  const mayContain = cleanMayContain(contains, parts.flatMap((p) => p.mayContain ?? []));
  return { contains, mayContain, missingContains, missingMayContain };
}
