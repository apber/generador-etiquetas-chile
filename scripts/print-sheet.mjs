// Print sheet in PDF: the labels of one or several products, at real size, 3 mm apart, as many per page as
// fit inside the margins (more pages if needed).
// Usage: node scripts/print-sheet.mjs <folder> <id[:copies]>… [--out hoja.pdf] [--assets assets.json]
//        [--paper letter|a4] [--margin mm] [--gap mm] [--fill] [--paper-type normal|fotografico] [--gamma n]
//        [--ring id=#hex] [--barcode id=number] [--html] [--calibrate g1,g2,…]
// --calibrate: color test for a paper type: the first product once per gamma (1 = no correction), numbered.
//   Values with a dot and separated by commas (1,0.75,0.6) or with a comma and separated by semicolons (1;0,75;0,6).
// --fill: repeats the list in order until the page is full (ignores the copies).
// Print the PDF at "actual size" / 100 % (no "fit to page").

import { writeFileSync } from 'node:fs';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { loadAssets } from '../src/node/render-label.js';
import { makeSheet } from '../src/node/sheet-pdf.js';
import { PAPER_TYPES } from '../src/sheet/page.js';

const args = process.argv.slice(2);
const opt = { out: 'hoja.pdf', assets: null, ring: {}, barcode: {}, fill: false, html: false };
const pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--assets') opt.assets = args[++i];
  else if (a === '--paper') opt.paper = args[++i].toLowerCase();
  else if (a === '--margin') opt.marginMm = Number(args[++i].replace(',', '.'));
  else if (a === '--gap') opt.gapMm = Number(args[++i].replace(',', '.'));
  else if (a === '--fill') opt.fill = true;
  else if (a === '--html') opt.html = true;
  else if (a === '--calibrate') { const v = args[++i]; opt.calibrate = (v.includes(';') ? v.split(';') : v.split(',')).map((x) => Number(x.trim().replace(',', '.'))); }
  else if (a === '--paper-type') opt.paperType = args[++i];
  else if (a === '--gamma') opt.gamma = Number(args[++i].replace(',', '.'));
  else if (a === '--ring' || a === '--barcode') { const [k, v] = args[++i].split('='); opt[a.slice(2)][k] = v; }
  else pos.push(a);
}
if (opt.paperType && !PAPER_TYPES[opt.paperType]) throw new Error(`Tipo de papel desconocido: ${opt.paperType} (${Object.keys(PAPER_TYPES).join(', ')})`);
const store = loadFolder(pos[0] ?? DEMO_FOLDER);
const entries = (pos.length > 1 ? pos.slice(1) : [...store.products.values()].filter((p) => p.type !== 'management_only').map((p) => p.id))
  .map((s) => { const [id, n] = s.split(':'); return { id, copies: n ? Number(n) : 1 }; });

const res = await makeSheet(store, entries, { ...opt, assets: opt.assets ? loadAssets(opt.assets) : undefined });
writeFileSync(opt.out, res.pdf);
if (opt.html) writeFileSync(opt.out.replace(/\.pdf$/i, '') + '.html', res.html);

const mm = (v) => v.toFixed(1).replace('.', ',');
for (const id of res.skipped) console.log(`${id}: incompleto, no va en la hoja`);
for (const [id, l] of Object.entries(res.labels)) console.log(`${id}: reverso ${mm(l.lengthMm)} mm (alto en la hoja ${mm((l.cut + 0.75) / 3.7816)} mm)`);
res.plan.pages.forEach((p, i) => console.log(`Página ${i + 1}: ${p.items.length} etiquetas (${p.items.map((x) => x.id).join(', ')}) · márgenes arriba y abajo ${mm(p.marginTopMm)} mm`));
console.log(`Papel ${res.plan.paper.name} · márgenes laterales ${mm(res.plan.sideMm)} mm · separación ${mm(res.plan.gapMm)} mm · ${opt.out}`);
for (const w of res.plan.warnings) console.log(`Aviso: ${w.code}${w.id ? ` (${w.id})` : ''}${w.sideMm ? ` (${mm(w.sideMm)} mm)` : ''}`);
