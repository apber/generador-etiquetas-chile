// HTML of the print sheet: the finished labels (static HTML from the template) placed by planSheet, at real
// size, one page per sheet (@page with the paper size and no margins). Opened in a browser it can be printed
// (window.print at 100 %) or turned into a PDF (Node: src/node/sheet-pdf.js).
//
// Color correction by paper type (option, 29-10-2026): on glossy photo paper the colors print darker. The
// correction is a gamma curve on every color: black and white do not change (barcode, QR, table, seals), the
// middle tones get lighter. Vector colors are changed in the markup; raster images (logo, signature icon,
// social icons) are changed pixel by pixel in the browser before printing, at their own resolution.

import { MM } from '../template/geometry.js';

/** Paper types: gamma applied to the colors (1 = unchanged; < 1 lighter). Values to adjust with print tests. */
export const PAPER_TYPES = {
  normal: { name: 'Papel normal o adhesivo mate', gamma: 1 },
  fotografico: { name: 'Papel fotográfico brillante', gamma: 0.85 },
};

const CSS_PX_PER_MM = 96 / 25.4;
const SCALE = CSS_PX_PER_MM / MM;   // label px (1 mm = 3.7816 px) → CSS px

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
export const gammaChannel = (c, g) => (g === 1 ? c : clamp(255 * (c / 255) ** g));
const hex2 = (v) => v.toString(16).padStart(2, '0').toUpperCase();

/** Applies the gamma curve to every #rgb, #rrggbb and rgb()/rgba() color of a piece of HTML. */
export function adjustColors(html, gamma) {
  if (!gamma || gamma === 1) return html;
  return html
    .replace(/(?<!&)#([0-9a-fA-F]{6})\b/g, (m, h) => `#${[0, 2, 4].map((i) => hex2(gammaChannel(parseInt(h.slice(i, i + 2), 16), gamma))).join('')}`)
    .replace(/(?<!&)#([0-9a-fA-F]{3})\b/g, (m, h) => `#${[...h].map((c) => hex2(gammaChannel(parseInt(c + c, 16), gamma))).join('')}`)
    .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(\s*,\s*[\d.]+)?\s*\)/g, (m, r, g, b, a) => {
      const [R, G, B] = [r, g, b].map((v) => gammaChannel(Number(v), gamma));
      return a ? `rgba(${R}, ${G}, ${B}${a})` : `rgb(${R}, ${G}, ${B})`;
    });
}

/**
 * Runs in the page: applies the gamma to the raster images (PNG/JPEG given as data: addresses; others are left
 * as they are) and marks the page as ready. Self-contained (inlined with toString).
 */
export async function correctImages(gamma) {
  if (gamma !== 1) {
    const imgs = [...document.querySelectorAll('img')].filter((i) => /^data:image\/(png|jpe?g)/.test(i.getAttribute('src') ?? ''));
    const lut = new Uint8ClampedArray(256);
    for (let c = 0; c < 256; c++) lut[c] = Math.round(255 * (c / 255) ** gamma);
    const done = new Map();
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!done.has(src)) {
        const el = new Image();
        el.src = src;
        await el.decode();
        const cv = document.createElement('canvas');
        cv.width = el.naturalWidth; cv.height = el.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.drawImage(el, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height);
        for (let i = 0; i < d.data.length; i += 4) {
          d.data[i] = lut[d.data[i]]; d.data[i + 1] = lut[d.data[i + 1]]; d.data[i + 2] = lut[d.data[i + 2]];
        }
        ctx.putImageData(d, 0, 0);
        done.set(src, cv.toDataURL('image/png'));
      }
      img.setAttribute('src', done.get(src));
    }
    await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
  }
  if (document.fonts) await document.fonts.ready;
  document.body.dataset.ready = '1';
}

/**
 * The sheet page. plan: from planSheet; labelsHtml: the static HTML of each label, by the `index` of the plan
 * (the template's .label element, from the renderer). options: { fontsCss, head, paperType, title }.
 */
export function sheetPage(plan, labelsHtml, options = {}) {
  const type = PAPER_TYPES[options.paperType ?? 'normal'] ?? PAPER_TYPES.normal;
  const gamma = options.gamma ?? type.gamma;
  const W = plan.paper.width, H = plan.paper.height;
  const pages = plan.pages.map((p) => {
    const items = p.items.map((it) => {
      const label = adjustColors(labelsHtml[it.index], gamma);
      return `<div style="position: absolute; left: ${it.xMm.toFixed(3)}mm; top: ${it.yMm.toFixed(3)}mm; transform: scale(${SCALE.toFixed(6)}); transform-origin: 0 0">${label}</div>`;
    }).join('');
    return `<section class="sheet">${items}</section>`;
  }).join('');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">'
    + `<title>${options.title ?? 'Hoja de etiquetas'}</title>${options.head ?? ''}`
    + `<style>${options.fontsCss ?? ''}`
    + `@page { size: ${W}mm ${H}mm; margin: 0 }`
    + 'html, body { margin: 0; padding: 0; background: #FFFFFF }'
    + `.sheet { position: relative; width: ${W}mm; height: ${H}mm; overflow: hidden; break-after: page; background: #FFFFFF }`
    + '.sheet:last-child { break-after: auto }'
    + '@media screen { body { background: #DDDDDD } .sheet { margin: 0 auto 8mm; box-shadow: 0 1px 4px rgba(0,0,0,.25) } }'
    + `</style></head><body>${pages}`
    + `<script>(${correctImages.toString().replace(/^export\s+/, '')})(${gamma});</script></body></html>`;
}
