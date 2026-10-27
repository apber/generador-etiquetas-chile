// Validates a company data folder: company.json + products/*.json.
// Usage: node scripts/validate-data.mjs <folder>   (default: demo)
// Checks the format (schemas) and cross-file references. Nutrition and
// regulatory checks belong to the calculations, not to this script.

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { isValidEan13 } from '../src/ean13.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateProduct = ajv.compile(readJson(join(root, 'schema/product.schema.json')));
const validateCompany = ajv.compile(readJson(join(root, 'schema/company.schema.json')));
const allergenIds = new Set(readJson(join(root, 'data/allergens.json')).allergens.map((a) => a.id));

const folder = process.argv[2] ?? join(root, 'demo');
const errors = [];
const warnings = [];
const addSchemaErrors = (file, errs) =>
  errs.forEach((e) => errors.push(`${file}: ${e.instancePath || '(root)'} ${e.message}`));

// Company
const company = readJson(join(folder, 'company.json'));
if (!validateCompany(company)) addSchemaErrors('company.json', validateCompany.errors);
const companyBarcodes = new Set((company.barcodes ?? []).map((c) => c.number));
for (const number of companyBarcodes) {
  if (!isValidEan13(number)) errors.push(`company.json: barcode ${number} has a wrong check digit`);
}

// Products
const productsDir = join(folder, 'products');
const products = new Map();
for (const name of readdirSync(productsDir).filter((n) => n.endsWith('.json')).sort()) {
  const product = readJson(join(productsDir, name));
  if (!validateProduct(product)) addSchemaErrors(name, validateProduct.errors);
  if (product.id !== basename(name, '.json')) errors.push(`${name}: id "${product.id}" does not match the file name`);
  products.set(product.id, { product, name });
}

const usedBarcodes = new Map();
for (const { product, name } of products.values()) {
  const comp = product.composition ?? {};

  // Allergens must come from the catalog
  for (const field of ['contains', 'may_contain']) {
    for (const id of comp[field] ?? []) {
      if (!allergenIds.has(id)) errors.push(`${name}: "${id}" in ${field} is not in the allergen catalog`);
    }
  }
  const both = (comp.contains ?? []).filter((id) => (comp.may_contain ?? []).includes(id));
  if (both.length) warnings.push(`${name}: ${both.join(', ')} is in both contains and may_contain (will be dropped from may_contain)`);
  if ((comp.contains ?? []).length && comp.ingredients && !/\{[^}]+\}/.test(comp.ingredients)) {
    warnings.push(`${name}: has allergens in contains but none marked with {…} in ingredients`);
  }

  // Referenced sources must exist
  const sourceIds = new Set((product.sources ?? []).map((s) => s.id));
  const refs = [comp.source, product.nutrition?.serving?.source,
    ...Object.values(product.nutrition?.per_100g ?? {}).map((v) => v.source)].filter(Boolean);
  for (const ref of new Set(refs)) {
    if (!sourceIds.has(ref)) errors.push(`${name}: source "${ref}" is not listed in sources`);
  }

  // Recipe
  if (product.recipe) {
    const total = product.recipe.components.reduce((s, c) => s + c.g_per_100g, 0);
    if (Math.abs(total - 100) > 0.01) errors.push(`${name}: recipe adds up to ${total} g, must be 100`);
    for (const c of product.recipe.components) {
      for (const id of [c.product, ...(c.alternatives ?? [])]) {
        const entry = products.get(id);
        if (!entry) warnings.push(`${name}: missing record for recipe component "${id}"`);
        else if (entry.product.type !== 'simple') errors.push(`${name}: component "${id}" must be a simple product`);
      }
    }
  }

  // Barcodes
  for (const p of product.presentations) {
    if (!p.barcode) continue;
    if (!isValidEan13(p.barcode)) errors.push(`${name}: barcode ${p.barcode} has a wrong check digit`);
    if (usedBarcodes.has(p.barcode)) errors.push(`${name}: barcode ${p.barcode} is already used by ${usedBarcodes.get(p.barcode)}`);
    usedBarcodes.set(p.barcode, `${name} (${p.net_weight_g} g)`);
    if (!companyBarcodes.has(p.barcode)) warnings.push(`${name}: barcode ${p.barcode} is not in the company list`);
  }
}

console.log(`Folder: ${folder}`);
console.log(`Products: ${products.size}`);
warnings.forEach((w) => console.log(`  warning: ${w}`));
errors.forEach((e) => console.log(`  ERROR: ${e}`));
console.log(errors.length ? `${errors.length} error(s).` : 'Format OK.');
process.exit(errors.length ? 1 : 0);
