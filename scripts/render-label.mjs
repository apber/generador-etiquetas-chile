// Renders the labels of a data folder in Chromium and saves, per product, the finished label (HTML),
// its result (chosen variant, back length) and optionally a PNG.
// Usage: node scripts/render-label.mjs [folder] [ids…] [--out dir] [--assets assets.json] [--png]
//        [--ring id=#hex] [--barcode id=number] [--scale n]
// Without folder: demo/. Needs Playwright's Chromium (npx playwright install chromium).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { buildLabelData } from '../src/label-data.js';
import { openRenderer, loadAssets } from '../src/node/render-label.js';

const args = process.argv.slice(2);
const opt = { out: 'etiquetas', assets: null, png: false, ring: {}, barcode: {}, scale: 1 };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--assets') opt.assets = args[++i];
  else if (a === '--png') opt.png = true;
  else if (a === '--scale') opt.scale = Number(args[++i]);
  else if (a === '--ring' || a === '--barcode') { const [k, v] = args[++i].split('='); opt[a.slice(2)][k] = v; }
  else positional.push(a);
}
const store = loadFolder(positional[0] ?? DEMO_FOLDER);
const ids = positional.length > 1 ? positional.slice(1)
  : [...store.products.values()].filter((p) => p.type !== 'management_only').map((p) => p.id);
const assets = opt.assets ? loadAssets(opt.assets) : undefined;

mkdirSync(opt.out, { recursive: true });
const r = await openRenderer();
try {
  for (const id of ids) {
    const d = buildLabelData(store, { productId: id });
    if (d.incomplete) { console.log(`${id}: incompleto (${d.blocking.review.join(', ')})`); continue; }
    const { result, html, png } = await r.render(d, store.company, { assets, ring: opt.ring[id], barcode: opt.barcode[id], png: opt.png, scale: opt.scale });
    writeFileSync(join(opt.out, `${id}.html`), `<!doctype html><meta charset="utf-8"><body style="margin:0">${html}`);
    writeFileSync(join(opt.out, `${id}.json`), JSON.stringify(result, null, 2));
    if (png) writeFileSync(join(opt.out, `${id}.png`), png);
    console.log(`${id}: reverso ${String(result.lengthMm).replace('.', ',')} mm · variante ${result.variant}`
      + ` · redes ${result.redes ? `${result.redes.where}${result.redes.lines ? ` (${result.redes.lines} líneas)` : ''}` : '—'}`
      + ` · firma a la altura ${result.signature?.at === 'nombre' ? 'del nombre' : 'de los ingredientes'}`);
  }
} finally {
  await r.close();
}
