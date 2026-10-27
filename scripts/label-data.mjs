// Shows the computed label data of every product in a folder (review view in text).
// Usage: node scripts/label-data.mjs [folder] [product id] [--json] [--variant component=alternative]
// Without folder: demo/.

import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { buildLabelData } from '../src/label-data.js';
import { NUTRIENT_LABELS } from '../src/i18n/es.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const variant = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') continue;
  if (args[i] === '--variant') { const [k, v] = args[++i].split('='); variant[k] = v; continue; }
  positional.push(args[i]);
}
const store = loadFolder(positional[0] ?? DEMO_FOLDER);
const ids = positional[1] ? [positional[1]] : [...store.products.keys()];

for (const id of ids) {
  const p = store.products.get(id);
  if (p.type === 'management_only') continue;
  const d = buildLabelData(store, { productId: id, variant });
  if (json) { console.log(JSON.stringify(d, null, 2)); continue; }
  console.log(`\n=== ${id}${d.variant ? ` (${d.variant.map((v) => v.used).join(' + ')})` : ''} ===`);
  for (const a of d.alerts) {
    const tag = { review: 'REVISAR', ask: 'AVISO', none: 'info' }[a.print];
    console.log(`  [${tag}] ${a.code}: ${a.message || a.detail}${a.confirmed ? ` (confirmado: ${a.confirmed.decision})` : ''}`);
  }
  if (d.incomplete) continue;
  console.log(`  Eslogan: ${d.front.slogan} | Sellos: ${d.front.sealNames.join(', ') || 'ninguno'} | Peso neto: ${d.front.netWeight.text}`);
  console.log(`  ${d.nutrition.serving?.text} | ${d.nutrition.servingsPerPackage?.label}${d.nutrition.note ? ` | ${d.nutrition.note}` : ''}`);
  for (const r of d.nutrition.rows) {
    const label = `${'  '.repeat(r.indent)}${NUTRIENT_LABELS[r.key]}`;
    console.log(`    ${label.padEnd(28)} ${(r.per100g?.text ?? '—').padStart(7)} ${(r.perServing?.text ?? '—').padStart(7)}`);
  }
  console.log(`  INGREDIENTES: ${d.ingredients?.plain ?? '—'} (${d.ingredients?.words ?? 0} palabras)`);
  console.log(`  CONTIENE: ${d.contains.text ?? '—'}`);
  console.log(`  PUEDE CONTENER: ${d.mayContain.text ?? '—'}`);
  console.log(`  ${d.storage}`);
  console.log(`  ${d.packer.title} ${d.packer.text}`);
  console.log(`  ${d.origin.title} ${d.origin.text ?? '—'}`);
}
