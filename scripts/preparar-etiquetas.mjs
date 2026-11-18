// Hace por adelantado las etiquetas de una carpeta de datos (la misma de OneDrive), para que la app las tenga sin
// internet: una por presentación (producto + peso) y, en una mezcla, por cada variante con ficha. Las deja en
// <carpeta>/etiquetas/<clave>.pdf y .json, con la misma clave que calcula la app (src/app-label.js) y el mismo PDF que
// arma el servidor (src/render/label-pdf.js con las letras de la app). Las que ya están hechas no se repiten.
//
//   node scripts/preparar-etiquetas.mjs <carpeta> [ids…] [--rehacer] [--limpiar]
//
// La carpeta lleva company.json, products/ y marca/ (assets.json y sus imágenes). --limpiar borra de etiquetas/ las
// que ya no corresponden a ninguna presentación. Productos inactivos: no.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { loadFolder } from '../src/node/load-folder.js';
import { appLabelFontsCss } from '../src/node/app-fonts.js';
import { renderLabelPdf } from '../src/render/label-pdf.js';
import { prepararEtiqueta, devolverEtiqueta } from '../worker/etiqueta.js';
import {
  appLabelData, companyForLabel, filterForLabel, labelKey, labelFiles, labelMeta, brandFileNames, brandFingerprint,
  sha256Hex, LABELS_FOLDER,
} from '../src/app-label.js';

const args = process.argv.slice(2);
const opt = { rehacer: args.includes('--rehacer'), limpiar: args.includes('--limpiar') };
const [carpeta, ...soloIds] = args.filter((a) => !a.startsWith('--'));
if (!carpeta) { console.error('Uso: node scripts/preparar-etiquetas.mjs <carpeta> [ids…] [--rehacer] [--limpiar]'); process.exit(1); }

// ---- Datos, como los ve la app ----
const crudo = loadFolder(carpeta);
const store = { ...crudo, products: new Map([...crudo.products].map(([id, p]) => [id, filterForLabel(p)])) };
const dirMarca = join(carpeta, 'marca');
const assetsJson = JSON.parse(readFileSync(join(dirMarca, 'assets.json'), 'utf8'));
const hashes = {};
for (const n of brandFileNames(assetsJson)) hashes[n] = await sha256Hex(readFileSync(join(dirMarca, n)));
const huella = brandFingerprint(assetsJson, hashes);

// Imágenes como las manda la app al servidor: data: y los íconos .svg dentro de la etiqueta
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const aData = (n) => (n ? `data:${TIPOS[extname(n).toLowerCase()]};base64,${readFileSync(join(dirMarca, n)).toString('base64')}` : null);
const icono = (n) => (n?.endsWith('.svg') ? readFileSync(join(dirMarca, n), 'utf8').replace(/<\?xml[^>]*>\s*/, '').trim() : aData(n));
const a = assetsJson;
const assets = {
  logo: aData(a.logo), signatureIcon: aData(a.signatureIcon),
  seals: Object.fromEntries(Object.entries(a.seals ?? {}).map(([k, v]) => [k, aData(v)])),
  icons: Object.fromEntries(Object.entries(a.icons ?? {}).map(([k, v]) => [k, icono(v)])),
};
const marca = { logo: a.logo, signatureIcon: a.signatureIcon, ...Object.fromEntries(Object.entries(a.seals ?? {}).map(([k, v]) => [`seal:${k}`, v])),
  ...Object.fromEntries(Object.entries(a.icons ?? {}).map(([k, v]) => [`icon:${k}`, v])) };

// ---- Qué etiquetas: cada presentación y, en una mezcla, cada variante con ficha ----
function variantes(p) {
  let out = [{}];
  for (const c of p.recipe?.components ?? []) {
    if (!c.alternatives?.length) continue;
    const opciones = [c.product, ...c.alternatives];
    const conFicha = opciones.filter((o) => store.products.has(o));
    for (const o of opciones) if (!conFicha.includes(o)) console.log(`  ${p.id}: sin ficha de ${o} (esa variante no se hace)`);
    out = out.flatMap((v) => conFicha.map((o) => (o === c.product ? v : { ...v, [c.product]: o })));
  }
  return out;
}
const pedidos = [];
for (const p of store.products.values()) {
  if (soloIds.length && !soloIds.includes(p.id)) continue;
  if (p.status === 'inactive' || p.type === 'management_only') continue;
  const vs = variantes(p);
  for (const pr of p.presentations ?? []) for (const variante of vs) pedidos.push({ id: p.id, peso: pr.net_weight_g, variante });
}

// ---- Hacerlas ----
const dir = join(carpeta, LABELS_FOLDER);
mkdirSync(dir, { recursive: true });
const fontsCss = appLabelFontsCss();
const vigentes = new Set();
let navegador = null;
const filas = [];
try {
  for (const pe of pedidos) {
    const nombre = `${pe.id} ${pe.peso} g${Object.keys(pe.variante).length ? ` (${Object.values(pe.variante).join(', ')})` : ''}`;
    const d = appLabelData(store, pe.id, pe);
    if (d.incomplete) { filas.push([nombre, 'incompleta', d.blocking.review.join(', ')]); continue; }
    const company = companyForLabel(store.company, store.products.get(pe.id));
    const clave = await labelKey(d, company, huella);
    const f = labelFiles(clave);
    vigentes.add(`${clave}.json`).add(`${clave}.pdf`);
    if (!opt.rehacer && existsSync(join(carpeta, f.meta)) && existsSync(join(carpeta, f.pdf))) { filas.push([nombre, 'ya estaba', clave]); continue; }
    navegador ??= await chromium.launch();
    const page = await navegador.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
    try {
      const cuerpo = { labelData: d, company, assets, marca };
      const pedido = prepararEtiqueta(cuerpo);
      const r = await renderLabelPdf(page, pedido.labelData, pedido.company, { ...pedido.options, fontsCss });
      const resp = devolverEtiqueta(r, cuerpo);
      writeFileSync(join(carpeta, f.pdf), r.pdf);
      writeFileSync(join(carpeta, f.meta), `${JSON.stringify(labelMeta({ productId: pe.id, peso: d.front.netWeight.g, variante: pe.variante,
        html: resp.html, result: resp.result, fecha: new Date().toISOString() }), null, 2)}\n`);
      filas.push([nombre, 'hecha', `${clave} · reverso ${resp.result.lengthMm.toFixed(1)} mm · ${(r.pdf.length / 1024).toFixed(0)} KB`]);
    } finally { await page.close(); }
  }
} finally { await navegador?.close(); }

if (opt.limpiar && !soloIds.length) {
  for (const n of readdirSync(dir)) if (!vigentes.has(n)) { rmSync(join(dir, n)); filas.push([n, 'borrada', 'ya no corresponde']); }
}
for (const [n, e, x] of filas) console.log(`${n.padEnd(42)} ${e.padEnd(10)} ${x}`);
const cuenta = (e) => filas.filter((f) => f[1] === e).length;
console.log(`\n${cuenta('hecha')} hechas, ${cuenta('ya estaba')} ya estaban, ${cuenta('incompleta')} incompletas${opt.limpiar ? `, ${cuenta('borrada')} borradas` : ''}.`);
