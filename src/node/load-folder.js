// Loads a company data folder from disk (Node only): company.json + products/*.json.
// The app will read the same files from OneDrive.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function loadCatalog() {
  return readJson(join(repoRoot, 'data/allergens.json'));
}

export function loadFolder(folder) {
  const company = readJson(join(folder, 'company.json'));
  const productsDir = join(folder, 'products');
  const products = new Map();
  for (const name of readdirSync(productsDir).filter((n) => n.endsWith('.json')).sort()) {
    const product = readJson(join(productsDir, name));
    products.set(product.id, product);
  }
  return { company, products, catalog: loadCatalog() };
}

export const DEMO_FOLDER = join(repoRoot, 'demo');
