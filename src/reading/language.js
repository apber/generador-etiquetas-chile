// Bilingual supplier texts (stage 7e, arreglo 2, 10-11-2026): only the Spanish part goes to the record.
// Imported labels often print the same list twice ("HARINA, AZÚCAR… / FLOUR, SUGAR…") or a measure as
// "1 unid. / units". Fixed word lists decide which part is English; when no part looks Spanish, nothing is removed.

const plainWords = (text) => String(text ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);

const ENGLISH = new Set(`flour sugar sugars salt and with of the or oil oils vegetable shortening soy soybean lecithin flavor flavors
flavour flavours flavoring artificial milk wheat contains contain may ingredients ingredient cocoa butter powder whole corn syrup
water citric acid peanut peanuts almond almonds nut nuts tree raisins raisin dried sunflower glaze coating protein proteins traces
manufactured facility processes processed store keep cool dry place sweetened unit units cup cups serving servings piece pieces
tablespoon tablespoons teaspoon teaspoons tbsp tsp egg eggs barley rye oats sesame mustard sulphites sulfites wheat starch
preservative emulsifier natural`.split(/\s+/));
const SPANISH = new Set(`de y con sin harina azucar azucares sal aceite aceites vegetal manteca proteina lecitina saborizante saborizantes
agua acido jarabe leche trigo mani almendra almendras pasas el la los las del o en puede contener contiene trazas unidad unidades
unid taza tazas cucharada cucharadas porcion conservar mantener lugar fresco seco cerrado cerrada bolsa caja ambiente semilla
semillas maravilla soya soja avena cacao polvo entera glucosa goma emulsionante preservante natural`.split(/\s+/));

/** 'en' | 'es' | null (cannot tell) for one piece of text. */
export function languageOf(text) {
  const w = plainWords(text);
  const en = w.filter((x) => ENGLISH.has(x) && !SPANISH.has(x)).length;
  const es = w.filter((x) => SPANISH.has(x) && !ENGLISH.has(x)).length;
  if (en >= 2 && (es === 0 || en > 3 * es)) return 'en';
  if (en === 1 && es === 0 && w.length <= 2) return 'en';
  if (es > 0 && es >= en) return 'es';
  return null;
}

/**
 * Keeps the Spanish part of a text printed in two languages.
 * Pieces: lines, then " / " or " | ", then sentences. Returns { text, removed: [pieces] }.
 */
export function spanishOnly(text) {
  if (text == null) return { text, removed: [] };
  const lines = String(text).split(/\s*\n\s*/).filter((x) => x.trim());
  const pieces = lines.flatMap((l) => l.split(/\s+[/|]\s+/)).flatMap((p) => p.split(/(?<=[.;])\s+(?=\S)/));
  const langs = pieces.map(languageOf);
  if (!langs.includes('es') || !langs.includes('en')) return { text, removed: [] };
  const removed = pieces.filter((_, i) => langs[i] === 'en');
  const kept = pieces.filter((_, i) => langs[i] !== 'en').join(' ').replace(/\s+/g, ' ').trim();
  return { text: kept, removed };
}

/** Household measure: "1 unid. / units" → "1 unid."; "1/4 taza" is a fraction, not two languages. */
export function spanishMeasure(text) {
  if (!text) return { text, removed: [] };
  const pieces = String(text).split(/\s*(?<!\d)\/(?!\d)\s*|\s+\|\s+/).filter((x) => x.trim());
  if (pieces.length < 2) return { text, removed: [] };
  const isEnglish = (p) => {
    const w = plainWords(p);
    return w.length > 0 && w.every((x) => ENGLISH.has(x) && !SPANISH.has(x));
  };
  const removed = pieces.filter(isEnglish);
  if (!removed.length || removed.length === pieces.length) return { text, removed: [] };
  return { text: pieces.filter((p) => !isEnglish(p)).join(' ').trim(), removed };
}
