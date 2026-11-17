import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { buildLabelData } from '../src/label-data.js';
import { renderLabelPdf, singleLabelPage } from '../src/render/label-pdf.js';
import { composeSheet } from '../src/sheet/compose-pdf.js';
import { labelBox } from '../src/sheet/plan.js';
import { appLabelFontsCss } from '../src/node/app-fonts.js';
import { prepararEtiqueta, devolverEtiqueta, PedidoMalo } from '../worker/etiqueta.js';

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch(); await b.close();
} catch { chromium = null; }

test('one-label page: its size is the visible outline of the label', () => {
  const html = singleLabelPage('<div class="label"></div>', 195.5, 4.54);
  const b = labelBox(195.5, 4.54);
  assert.match(html, new RegExp(`size:${b.widthMm.toFixed(4)}mm ${b.heightMm.toFixed(4)}mm`));
});

test('server request: data checked; images back as @marca:file', () => {
  assert.throws(() => prepararEtiqueta({}), PedidoMalo);
  const data = { front: {}, nutrition: {} };
  assert.throws(() => prepararEtiqueta({ labelData: data, company: {}, assets: { logo: 'javascript:alert(1)' } }), PedidoMalo);
  const logo = 'data:image/png;base64,AAAA';
  const r = devolverEtiqueta({ pdf: new Uint8Array([37, 80, 68, 70]), html: `<img src="${logo}">`, result: { cut: 1, freeEnd: 2, lengthMm: 3, variant: 'x', extra: 1 } },
    { assets: { logo }, marca: { logo: 'logo.jpg' } });
  assert.equal(r.html, '<img src="@marca:logo.jpg">');
  assert.equal(r.pdf, 'JVBERg==');
  assert.deepEqual(r.result, { cut: 1, freeEnd: 2, lengthMm: 3, variant: 'x' });
});

test('sheet from label PDFs: same plan as the HTML sheet, labels kept as embedded pages', { skip: !chromium && 'Chromium not installed' }, async () => {
  const store = loadFolder(DEMO_FOLDER);
  const ids = [...store.products.values()].filter((p) => p.type !== 'management_only').map((p) => p.id).slice(0, 2);
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1000, height: 800 } });
  const fontsCss = appLabelFontsCss();
  const labels = {};
  try {
    for (const id of ids) labels[id] = await renderLabelPdf(page, buildLabelData(store, { productId: id }), store.company, { fontsCss });
  } finally { await b.close(); }
  for (const id of ids) {
    const doc = await PDFDocument.load(labels[id].pdf);
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    const box = labelBox(labels[id].result.cut, labels[id].result.freeEnd);
    assert.ok(Math.abs(w - box.widthMm * 72 / 25.4) < 1.5, `${id}: width ${w}`);
    assert.ok(Math.abs(h - box.heightMm * 72 / 25.4) < 1.5, `${id}: height ${h}`);
    assert.doesNotMatch(labels[id].html, /class=|data-/);
  }
  const items = ids.flatMap((id) => Array.from({ length: 4 }, () => ({ id, pdf: labels[id].pdf, cut: labels[id].result.cut, freeEnd: labels[id].result.freeEnd })));
  const { bytes, plan } = await composeSheet(PDFDocument, items, { paper: 'letter' });
  const out = await PDFDocument.load(bytes);
  assert.equal(out.getPageCount(), plan.pages.length);
  assert.ok(plan.pages.length >= 2);
  assert.ok(Math.abs(out.getPage(0).getWidth() - 612) < 0.5);
});
