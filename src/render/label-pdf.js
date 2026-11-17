// PDF of ONE finished label (vector), the same in Node (Playwright), in the app's server (Cloudflare Worker with
// Browser Rendering, puppeteer) and in the local dev server. The app keeps one PDF per presentation and puts them on
// the page itself (src/sheet/compose-pdf.js), so a sheet can be made without internet (decided 17-11-2026).
//
// `page` is a Playwright or puppeteer page: both have setContent, waitForSelector, evaluate and pdf.

import { labelPage } from '../template/label.js';
import { labelBox } from '../sheet/plan.js';
import { MM } from '../template/geometry.js';

const CSS_PX_PER_MM = 96 / 25.4;
export const LABEL_SCALE = CSS_PX_PER_MM / MM;   // label px (1 mm = 3.7816 px) → CSS px

/** Fonts requested by name before measuring or printing (fonts.ready alone only waits for loads already started). */
export const LABEL_FONTS = ["400 6.2px 'Roboto Condensed'", "700 6.2px 'Roboto Condensed'", '700 8px Montserrat', '800 8.5px Montserrat',
  '400 6.6px Arial', '700 6.6px Arial'];

/**
 * Runs in the browser: copy of the laid-out .label without the classes and data- attributes the layout used
 * (static HTML, like render-label.js).
 */
export function cleanLabel(label) {
  const root = label.cloneNode(true);
  root.querySelectorAll('.variants').forEach((v) => v.remove());
  [root, ...root.querySelectorAll('*')].forEach((e) => [...e.attributes].forEach((a) => {
    if (a.name === 'class' || a.name.startsWith('data-')) e.removeAttribute(a.name);
  }));
  return root.outerHTML;
}

/** A page of exactly the size of the label's visible outline, with the label in place and a transparent background. */
export function singleLabelPage(labelHtml, cut, freeEnd, fontsCss = '') {
  const b = labelBox(cut, freeEnd);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><style>'
    + `${fontsCss}@page{size:${b.widthMm.toFixed(4)}mm ${b.heightMm.toFixed(4)}mm;margin:0}html,body{margin:0;background:transparent}`
    + `</style></head><body><div style="position:absolute;left:${(-b.leftPx * LABEL_SCALE).toFixed(4)}px;top:0;transform:scale(${LABEL_SCALE.toFixed(6)});transform-origin:0 0">`
    + `${labelHtml}</div></body></html>`;
}

/**
 * Lays out the label and prints its PDF. labelData from buildLabelData; options: template options (assets, ring,
 * barcode, …). fontsCss: @font-face rules the page can load (data: addresses work everywhere).
 * Returns { pdf (bytes), html (static label), result (variant, lengthMm, cut, freeEnd…) }.
 */
export async function renderLabelPdf(page, labelData, company, { fontsCss = '', ...options } = {}) {
  await page.setContent(labelPage(labelData, company, { fontsCss, ...options }));
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
  const result = await page.evaluate(() => window.__labelResult);
  if (result.error) throw new Error(result.error);
  const html = await page.evaluate(`(${cleanLabel.toString()})(document.querySelector('.label'))`);
  await page.setContent(singleLabelPage(html, result.cut, result.freeEnd, fontsCss));
  await page.evaluate(`(async () => {
    await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
    await Promise.all(${JSON.stringify(LABEL_FONTS)}.map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  })()`);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, omitBackground: true });
  return { pdf, html, result };
}
