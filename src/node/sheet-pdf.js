// Print sheet as a PDF from Node: lays out each product's label (once per product), places the copies with
// planSheet and prints the sheet page with Chromium at real size.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLabelData } from '../label-data.js';
import { openRenderer } from './render-label.js';
import { labelFontsCss } from './fonts.js';
import { planSheet, fillPage } from '../sheet/plan.js';
import { sheetPage, calibrationCaptions } from '../sheet/page.js';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/** file:// images of a label → data: addresses, so the sheet is self-contained and images can be corrected. */
function inlineImages(html) {
  return html.replace(/src="(file:\/\/[^"]+)"/g, (m, url) => {
    const path = fileURLToPath(url.replace(/&amp;/g, '&'));
    const mime = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    return `src="data:${mime};base64,${readFileSync(path).toString('base64')}"`;
  });
}

/**
 * entries: [{ id, copies }] in print order. options: { assets, ring: {id: hex}, barcode: {id: number}, paper,
 * marginMm, gapMm, fill (repeat the list until the page is full), paperType, gamma, calibrate: [gammas] (color
 * calibration sheet: the first product once per gamma, with captions) }.
 * Returns { pdf, html, plan, labels: { id: { lengthMm, variant, cut } }, skipped }.
 */
export async function makeSheet(store, entries, options = {}) {
  const r = await openRenderer();
  const fontsCss = await labelFontsCss();
  const labels = {};
  const skipped = [];
  try {
    for (const { id } of entries) {
      if (labels[id] || skipped.includes(id)) continue;
      const d = buildLabelData(store, { productId: id });
      if (d.incomplete) { skipped.push(id); continue; }
      const { result, html } = await r.render(d, store.company, {
        assets: options.assets, ring: options.ring?.[id], barcode: options.barcode?.[id],
      });
      labels[id] = { html: inlineImages(html), lengthMm: result.lengthMm, variant: result.variant, cut: result.cut };
    }
  } finally {
    await r.close();
  }
  const ok = entries.filter((e) => labels[e.id]);
  const sheetOpts = { paper: options.paper, marginMm: options.marginMm, gapMm: options.gapMm };
  Object.keys(sheetOpts).forEach((k) => sheetOpts[k] === undefined && delete sheetOpts[k]);
  let list = ok.flatMap((e) => Array.from({ length: e.copies ?? 1 }, () => ({ id: e.id, cut: labels[e.id].cut })));
  if (options.fill) list = fillPage(ok.map((e) => ({ id: e.id, cut: labels[e.id].cut })), sheetOpts);
  // Color calibration: the first product once per correction, each with its caption
  const steps = options.calibrate;
  if (steps?.length && ok.length) list = steps.map(() => ({ id: ok[0].id, cut: labels[ok[0].id].cut }));
  const plan = planSheet(list, sheetOpts);
  const html = sheetPage(plan, list.map((l) => labels[l.id].html), {
    fontsCss, paperType: options.paperType, gamma: options.gamma, title: options.title,
    ...(steps?.length ? { itemGamma: steps, captions: calibrationCaptions(steps) } : {}),
  });

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const dir = mkdtempSync(join(tmpdir(), 'hoja-'));
  try {
    const file = join(dir, 'hoja.html');
    writeFileSync(file, html);
    const pg = await browser.newPage();
    await pg.goto(pathToFileURL(file).href);
    await pg.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
    await pg.emulateMedia({ media: 'print' });
    const pdf = await pg.pdf({ preferCSSPageSize: true, printBackground: true });
    return { pdf, html, plan, labels: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, { lengthMm: v.lengthMm, variant: v.variant, cut: v.cut }])), skipped };
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
