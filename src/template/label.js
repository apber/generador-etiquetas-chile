// Label template (small pouch, v2.39): builds the page that the browser lays out into the final label.
//
//   const page = labelPage(labelData, company, { assets, fontsCss });
//   → open it in a browser; when it is ready, window.__labelResult has the chosen variant and the length,
//     and the element .label is the finished label at real size (1 mm = 3.7816 px).
//
// labelData comes from buildLabelData (src/label-data.js). Brand images (logo, signature icon, social icons,
// official seals) are not part of this repository: they come in `assets` (addresses or inline SVG).

import { STRIP, BACK, MM } from './geometry.js';
import { frontParts, outlinePath } from './front.js';
import { backContent, backVariantHtml, VARIANTS } from './back.js';
import { layoutLabel } from './layout.js';
import { esc } from './html.js';

export const DEFAULT_TEMPLATE_OPTIONS = {
  barcodeScale: 0.8,          // 80 %: read well on plain and glossy photo paper (v2.39, 29-10-2026)
  sealSize: '10mm',           // '15mm' = legal size (the user accepted the risk of 10 mm)
  medallion: 1.1,             // +10 % (39.6 mm)
  ringColor: '#6E421C',       // when the record has no ring color (alert missing_ring_color)
  missingSections: 'omit',     // a missing ingredients-panel section is left out; 'placeholder' prints missingText
  missingText: '[por confirmar]',
};

/** The label element (front and back variants still to lay out) and the settings for layoutLabel. */
export function labelMarkup(d, company, options = {}) {
  if (d.incomplete) throw new Error(`"${d.productId}" is incomplete: ${d.blocking.review.join(', ')}`);
  const opts = { ...DEFAULT_TEMPLATE_OPTIONS, ...options };
  const ring = opts.ring ?? d.front.ringColor ?? opts.ringColor;
  const data = { ...d, front: { ...d.front, ringColor: ring }, barcode: opts.barcode ?? d.barcode };
  const front = frontParts(data.front, opts);
  const content = backContent(data, company, opts);
  const variants = VARIANTS.map((v) => backVariantHtml(content, v)).join('');
  const H0 = Math.ceil(BACK.cut + 0.75);
  const marks = [STRIP.foldLeft, STRIP.foldRight].flatMap((x) => STRIP.foldMarksY.map(([y1, y2]) =>
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#9C8F80" stroke-width="1.13"></line>`)).join('');
  const html = `<div class="label" data-product="${esc(d.productId)}" style="position: relative; width: ${STRIP.boardWidth}px; height: ${H0}px; font-family: 'Roboto Condensed', Arial, sans-serif; color: #2B1A10; overflow: hidden">`
    + `<svg class="strip" viewBox="0 0 ${STRIP.boardWidth} ${H0}" width="${STRIP.boardWidth}" height="${H0}" style="position: absolute; left: 0; top: 0" aria-hidden="true">`
    + '<path class="outline" d="" fill="none" stroke="#9C8F80" stroke-width="1.5"></path><path class="outline" d="" fill="#F6EEDF"></path>'
    + `${marks}</svg>`
    + `<div class="back" aria-label="Reverso" style="position: absolute; left: ${STRIP.backDx}px; top: 0px; width: ${BACK.width}px; height: ${H0}px"></div>`
    + front.html
    + `<div class="variants" style="position: absolute; left: 0; top: ${H0 + 40}px">${variants}</div>`
    + '</div>';
  const cfg = {
    limit: BACK.limit, baseCut: BACK.cut, baseLengthMm: BACK.baseLengthMm, mm: MM, boardWidth: STRIP.boardWidth,
    outline: outlinePath(null, front.medallionArc),
  };
  return { html, cfg };
}

/**
 * A whole HTML page with the label and the script that lays it out.
 * options.fontsCss: @font-face rules for Montserrat and Roboto Condensed (or options.head: e.g. a Google Fonts link).
 */
export function labelPage(d, company, options = {}) {
  const { html, cfg } = labelMarkup(d, company, options);
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">'
    + `<title>${esc(d.front.productName)}</title>${options.head ?? ''}`
    + `<style>${options.fontsCss ?? ''} body{margin:0;background:#fff}</style></head><body>${html}`
    + `<script>(async () => { const layoutLabel = ${layoutLabel.toString().replace(/^export\s+/, '')};`
    + `try { window.__labelResult = await layoutLabel(document.querySelector('.label'), ${JSON.stringify(cfg)}); }`
    + ' catch (e) { window.__labelResult = { error: String(e && e.stack || e) }; }'
    + ' document.body.dataset.ready = "1"; })();</script></body></html>';
}

export { layoutLabel };
