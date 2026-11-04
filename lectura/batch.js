// Batch of photos of several products (test page): the file name says which reading each photo belongs to.
//   <producto>_<prueba>_<lo-que-sea>.jpg   e.g. mani-bitter_R_tabla.jpg, mani-bitter_R_2.jpg
//   <producto>_todas_<lo-que-sea>.jpg       goes in every reading of that product (e.g. the ingredients photo)
//   <producto>.jpg or <producto>_<prueba>.jpg also work.
// One reading per product and test. No DOM here (tested in Node).

export const SHARED_TEST = 'todas';

const clean = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

/** "mani-bitter_R_tabla.jpg" -> { product: 'mani-bitter', test: 'R', shared: false } or null if not readable. */
export function parseName(fileName) {
  const base = String(fileName).replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '');
  const parts = base.split('_').map((p) => p.trim());
  const product = clean(parts[0] ?? '');
  if (!product) return null;
  const test = parts.length > 1 && parts[1] ? parts[1].toUpperCase() : null;
  if (test && test.toLowerCase() === SHARED_TEST) return { product, test: null, shared: true };
  return { product, test, shared: false };
}

/**
 * names: file names. Returns { groups: [{ product, test, files: [index…], shared: [index…] }], unknown: [index…] }.
 * Shared photos are added to every reading of their product; a product with only shared photos is one reading.
 */
export function groupBatch(names) {
  const groups = new Map();
  const shared = new Map();
  const unknown = [];
  names.forEach((name, i) => {
    const p = parseName(name);
    if (!p) { unknown.push(i); return; }
    if (p.shared) {
      if (!shared.has(p.product)) shared.set(p.product, []);
      shared.get(p.product).push(i);
      return;
    }
    const key = `${p.product}|${p.test ?? ''}`;
    if (!groups.has(key)) groups.set(key, { product: p.product, test: p.test, files: [], shared: [] });
    groups.get(key).files.push(i);
  });
  for (const [product, idx] of shared) {
    const own = [...groups.values()].filter((g) => g.product === product);
    if (own.length) for (const g of own) g.shared.push(...idx);
    else groups.set(`${product}|`, { product, test: null, files: [], shared: idx });
  }
  const byName = (a, b) => names[a].localeCompare(names[b], 'es', { numeric: true });
  const list = [...groups.values()].map((g) => ({ ...g, files: g.files.sort(byName), shared: g.shared.sort(byName) }));
  list.sort((a, b) => a.product.localeCompare(b.product) || (a.test ?? '').localeCompare(b.test ?? '', 'es', { numeric: true }));
  return { groups: list, unknown };
}

/** "mani-bitter" -> "mani bitter" (the product hint sent to the reader). */
export const hintOf = (product) => product.replace(/-/g, ' ');
