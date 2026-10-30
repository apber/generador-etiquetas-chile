// Texts read from a supplier label → record fields (stage 7e): allergens to catalog ids,
// ingredients with allergens marked {…}, what was added (sugar, fat, salt), storage, shelf life.
// Fixed rules, no AI: what the AI returns is only the transcription.

import { normalize } from './table.js';

/**
 * Supplier words → catalog ids (besides data/allergens.json reading_aliases and catalog names).
 * Strict reading: gluten cereals in an ingredient list mean CONTIENE gluten.
 */
const EXTRA_ALIASES = {
  soja: ['soy'], soya: ['soy'], 'lecitina de soya': ['soy'], 'lecitina de soja': ['soy'],
  mani: ['peanut'], manies: ['peanut'], cacahuate: ['peanut'], cacahuete: ['peanut'],
  almendra: ['almond'], avellana: ['hazelnut'], nuez: ['walnut'], 'nuez de brasil': ['brazil_nut'],
  'castana de caju': ['cashew'], caju: ['cashew'], anacardo: ['cashew'], merey: ['cashew'],
  pistacho: ['pistachio'], pecana: ['pecan'], 'nuez pecan': ['pecan'], macadamia: ['macadamia'],
  'frutos de cascara': ['tree_nuts'], 'otros frutos de cascara': ['tree_nuts'],
  'frutos secos': ['tree_nuts', 'peanut'], 'otros frutos secos': ['tree_nuts', 'peanut'],
  'nueces y derivados': ['walnut'],
  sesamo: ['sesame'], ajonjoli: ['sesame'], mostaza: ['mustard'],
  sulfitos: ['sulphites'], sulfito: ['sulphites'], 'dioxido de azufre': ['sulphites'], 'anhidrido sulfuroso': ['sulphites'],
  metabisulfito: ['sulphites'], 'metabisulfito de sodio': ['sulphites'], 'metabisulfito de potasio': ['sulphites'],
  gluten: ['gluten'], trigo: ['wheat'], cebada: ['barley'], centeno: ['rye'], avena: ['oat'],
  'cereales con gluten': ['gluten'],
  leche: ['milk'], lacteos: ['milk'], lacteo: ['milk'], 'derivados lacteos': ['milk'], lactosa: ['milk'],
  'suero de leche': ['milk'], 'proteina de leche': ['milk'], caseina: ['milk'],
  huevo: ['egg'], huevos: ['egg'], pescado: ['fish'], crustaceos: ['crustaceans'],
};

/** Words that look like an allergen but are not one. */
const NOT_ALLERGENS = ['nuez moscada', 'leche de coco', 'manteca de cacao', 'aceite de oliva'];

/** Builds the alias table: normalized phrase → ids, longest phrases first. */
export function aliasTable(catalog) {
  const table = new Map();
  for (const [k, v] of Object.entries(EXTRA_ALIASES)) table.set(normalize(k), v);
  for (const a of catalog.allergens) table.set(normalize(a.name.es), [a.id]);
  for (const [k, v] of Object.entries(catalog.reading_aliases?.es ?? {})) table.set(normalize(k), v);
  return [...table.entries()].sort((x, y) => y[0].length - x[0].length);
}

const GLUTEN_CEREALS = new Set(['wheat', 'barley', 'rye', 'oat']);

/**
 * Allergen ids in a statement ("maní, soya y gluten", "trazas de frutos secos").
 * Returns { ids, unknown: [phrases not recognized] }.
 */
export function allergensInStatement(text, catalog) {
  if (!text) return { ids: [], unknown: [] };
  const aliases = aliasTable(catalog);
  const cleaned = normalize(text)
    .replace(/\b(puede contener|contiene|trazas de|restos de|y\/o|derivados de|productos que contienen|elaborado en lineas que tambien procesan|que tambien procesan|se procesan|y otros derivados|otros derivados)\b/g, ',')
    .replace(/[()[\].;:]/g, ',');
  const parts = cleaned.split(/,|\by\b|\be\b|\/|\bo\b/).map((s) => s.trim()).filter(Boolean);
  const ids = [];
  const unknown = [];
  const repeated = [];
  for (const part of parts) {
    const found = matchAll(part, aliases);
    for (const id of found) if (ids.includes(id) && !repeated.includes(id) && !isGroup(part)) repeated.push(id);
    if (found.length) found.forEach((id) => ids.includes(id) || ids.push(id));
    else if (!/^(otros?|sus|y|de|del|la|el|los|las|a|en|lineas?|productos?|derivados?|mismas?|instalaciones)$/.test(part)) unknown.push(part);
  }
  return { ids, unknown, repeated };
}

/** Group words ("frutos secos") may repeat ids already named one by one (maní); that is not a reading error. */
const isGroup = (part) => /frutos|cereales|lacteos|derivados/.test(part);

function matchAll(phrase, aliases) {
  const ids = [];
  let rest = ` ${phrase} `;
  for (const [alias, aIds] of aliases) {
    const re = new RegExp(`(^|[^a-z])${escape(alias)}(es|s)?(?=[^a-z]|$)`);
    if (re.test(rest)) {
      aIds.forEach((id) => ids.includes(id) || ids.push(id));
      rest = rest.replace(re, '$1 ');
    }
  }
  return ids;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Allergens present in an ingredient list, in order of appearance, with their position.
 * Returns [{ id, index, phrase }].
 */
export function allergensInIngredients(text, catalog) {
  if (!text) return [];
  const aliases = aliasTable(catalog);
  let n = normalize(text);
  for (const no of NOT_ALLERGENS) n = n.replaceAll(no, ' '.repeat(no.length));
  const hits = [];
  const taken = new Array(n.length).fill(false);
  for (const [alias, ids] of aliases) {
    if (alias.length < 3) continue;
    const re = new RegExp(`(^|[^a-z])(${escape(alias)}(?:es|s)?)(?=[^a-z]|$)`, 'g');
    let m;
    while ((m = re.exec(n))) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      for (const id of ids) hits.push({ id, index: start, end, phrase: text.slice(start, end) });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** In CONTIENE, gluten cereals are declared as gluten (legal list name). */
export function containsIds(ids) {
  const out = [];
  for (const id of ids) {
    const v = GLUTEN_CEREALS.has(id) ? 'gluten' : id;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Ingredient text for the record: lowercase, allergens in braces.
 * If the supplier marks allergens in CAPITALS (and the whole text is not in capitals),
 * the capital words are the ones marked; otherwise the allergens found in the text.
 */
export function formatIngredients(text, catalog) {
  if (!text) return null;
  let t = String(text).replace(/\s+/g, ' ').trim().replace(/^ingredientes?\s*:\s*/i, '').replace(/[.;]\s*$/, '');
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '').length;
  const allCaps = letters.length > 0 && upper / letters.length > 0.6;
  const hasCapsRun = /[A-ZÁÉÍÓÚÑÜ]{2,}/.test(t);
  if (!allCaps && hasCapsRun) {
    // Runs of capital words (2+ letters) are the supplier's marks.
    const marked = t.replace(/(?<!\p{L})([A-ZÁÉÍÓÚÑÜ]{2,}(?:\s+(?:DE\s+)?[A-ZÁÉÍÓÚÑÜ]{2,})*)(?!\p{L})/gu, (m) => `{${m.toLowerCase()}}`);
    const rest = marked.replace(/(^|\})([^{]*)/g, (m, a, b) => a + b.toLowerCase());
    return tidy(rest);
  }
  const lower = t.toLowerCase();
  const hits = allergensInIngredients(lower, catalog);
  let out = '';
  let pos = 0;
  for (const h of hits) {
    if (h.index < pos) continue;
    out += lower.slice(pos, h.index) + `{${lower.slice(h.index, h.end)}}`;
    pos = h.end;
  }
  return tidy(out + lower.slice(pos));
}

const tidy = (s) => s.replace(/\s+,/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();

/** What a purchased ingredient adds (decides which warning seals are evaluated). */
const ADDED_PATTERNS = {
  sugar: /\b(azucar(?:es)?(?: (?:impalpable|flor|rubia|morena|invertido|de cana))?|sacarosa|jarabe(?: de [a-z]+(?: de [a-z]+)?)?|miel|glucosa|fructosa|dextrosa|melaza|panela|chancaca|concentrado de jugo(?: de [a-z]+)?|jugo concentrado(?: de [a-z]+)?)\b/g,
  fat: /\b(aceite(?! mineral)(?: (?:vegetal|de [a-z]+(?: de [a-z]+)?|\d+ ?% ?[a-z]+))?|manteca(?: de [a-z]+)?|grasa(?: vegetal| de [a-z]+)?|mantequilla|margarina)\b/g,
  sodium: /\b(sal|cloruro de sodio|salmuera)\b/g,
};

/**
 * Added sugar, fat or salt found in an ingredient list, as in the record:
 * [{ nutrient, ingredient: "azúcar, jarabe de glucosa" }].
 */
export function addedFromIngredients(text) {
  if (!text) return [];
  const plain = String(text).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  const n = normalize(plain);
  const out = [];
  for (const [nutrient, re] of Object.entries(ADDED_PATTERNS)) {
    const seen = [];
    for (const m of n.matchAll(re)) {
      const phrase = plain.slice(m.index, m.index + m[0].length).toLowerCase();
      if (!seen.includes(phrase)) seen.push(phrase);
    }
    if (seen.length) out.push({ nutrient, ingredient: seen.join(', ') });
  }
  return out;
}

/** Storage sentence: capital first letter and final period. */
export function formatStorage(text) {
  if (!text) return null;
  let t = String(text).replace(/\s+/g, ' ').trim()
    .replace(/^(condiciones( de)?\s+)?(conservaci[oó]n|almacenamiento)\s*:\s*/i, '');
  if (!t) return null;
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (letters && letters === letters.toUpperCase()) t = t.toLowerCase();
  // Two sentences printed on separate lines without a period ("…y seco Se recomienda…")
  t = t.replace(/([a-záéíóúñ])\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/g, '$1. ');
  t = t[0].toUpperCase() + t.slice(1);
  return /[.!]$/.test(t) ? t : `${t}.`;
}

/** "12 meses" → { amount: 12, unit: 'months' }; or from production and expiry dates. */
export function shelfLife(text, production, expiry) {
  const n = normalize(text);
  const m = n.match(/(\d+)\s*(dias|dia|meses|mes|anos|ano)/);
  if (m) {
    const unit = m[2].startsWith('dia') ? 'days' : m[2].startsWith('mes') ? 'months' : 'years';
    return { amount: Number(m[1]), unit, from: 'text' };
  }
  const a = parseDate(production);
  const b = parseDate(expiry);
  if (a && b && b > a) {
    const months = Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44));
    if (months >= 1) return { amount: months, unit: 'months', from: 'dates' };
  }
  return null;
}

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/** Day-month-year dates as printed in Chile (29-07-2026, 01/06/25, 20 OCT 26). */
export function parseDate(text) {
  const n = normalize(text);
  let m = n.match(/(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  let d, mo, y;
  if (m) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = n.match(/(\d{1,2}) ?([a-z]{3})[a-z]* ?(\d{2,4})/)) && MONTHS[m[2]]) [d, mo, y] = [Number(m[1]), MONTHS[m[2]], Number(m[3])];
  else return null;
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}
