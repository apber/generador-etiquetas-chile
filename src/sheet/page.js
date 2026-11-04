// HTML of the print sheet: the finished labels (static HTML from the template) placed by planSheet, at real
// size, one page per sheet (@page with the paper size and no margins). Opened in a browser it can be printed
// (window.print at 100 %) or turned into a PDF (Node: src/node/sheet-pdf.js).
//
// Color correction by paper type (option, 29-10-2026): on glossy photo paper the colors print darker. The
// correction is a gamma curve (on each channel, or on the lightness only: see colorCorrector): black and white
// do not change (barcode, QR, table, seals), the middle tones get lighter. Vector colors are changed in the markup; raster images (logo, signature icon,
// social icons) are changed pixel by pixel in the browser before printing, at their own resolution.

import { MM } from '../template/geometry.js';

/**
 * Paper types: gamma applied to the colors (1 = unchanged; < 1 lighter). Chosen with a calibration sheet
 * (--calibrate): the value whose print on that paper looks most like the plain-paper print.
 * fotografico: 0.45, between tests 0.5 and 0.4 (30-10-2026; Epson L375, glossy photo paper, driver set to the
 * glossy photo paper type). Another printer or paper may need another value.
 */
export const PAPER_TYPES = {
  normal: { name: 'Papel normal o adhesivo mate', gamma: 1 },
  fotografico: { name: 'Papel fotográfico brillante', gamma: 0.45 },
};

const CSS_PX_PER_MM = 96 / 25.4;
const SCALE = CSS_PX_PER_MM / MM;   // label px (1 mm = 3.7816 px) → CSS px

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
export const gammaChannel = (c, g) => (g === 1 ? c : clamp(255 * (c / 255) ** g));
const hex2 = (v) => v.toString(16).padStart(2, '0').toUpperCase();

/**
 * Color correction, as a spec:
 * - a number (0.45): gamma on each channel (R, G and B apart). Simple, but saturated colors change hue
 *   (the WhatsApp green turns mint) and dark browns turn greyish.
 * - 'L0.5': gamma on the lightness only (OKLab L), keeping hue and colorfulness (a, b); added 04-11-2026.
 * - 'L0.5S1.25': the same, with the colorfulness (chroma) × 1.25, for colors that print dull.
 * - 'L0.475S1.2/L0.5': one correction for the drawing (colors of the HTML: ring, texts, inline icons) and
 *   another for the raster images (logo with the hibiscus, signature icon); added 04-11-2026, so the ring can
 *   take more color without clipping the red of the hibiscus. Without '/', both use the same.
 * Black and white never change. Returns a function (r, g, b) → [r, g, b], or null when nothing changes.
 * Self-contained (inlined in the sheet page with toString). part: 'drawing' (default) or 'images'.
 */
export function colorCorrector(spec, part = 'drawing') {
  const both = String(spec ?? 1).split('/');
  const text = (part === 'images' && both.length > 1 ? both[1] : both[0]).trim().replace(/,/g, '.');
  const m = /^L\s*([0-9.]+)(?:\s*S\s*([0-9.]+))?$/i.exec(text);
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  if (!m) {
    const g = Number(text);
    if (!(g > 0)) throw new Error(`Corrección de color no válida: ${spec}`);
    if (g === 1) return null;
    const lut = new Uint8ClampedArray(256);
    for (let c = 0; c < 256; c++) lut[c] = clamp255(255 * (c / 255) ** g);
    return (r, gg, b) => [lut[r], lut[gg], lut[b]];
  }
  const g = Number(m[1]);
  const k = m[2] ? Number(m[2]) : 1;
  if (!(g > 0) || !(k > 0)) throw new Error(`Corrección de color no válida: ${spec}`);
  if (g === 1 && k === 1) return null;
  const lin = new Float64Array(256);
  for (let c = 0; c < 256; c++) { const x = c / 255; lin[c] = x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }
  const enc = (x) => { const v = Math.max(0, x); return clamp255(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)); };
  return (r, gg, b) => {
    if ((r === 0 && gg === 0 && b === 0) || (r === 255 && gg === 255 && b === 255)) return [r, gg, b];
    const R = lin[r], G = lin[gg], B = lin[b];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const mm = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = (0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s) ** g;
    const A = (1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s) * k;
    const Bb = (0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s) * k;
    const l3 = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3;
    const m3 = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3;
    const s3 = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3;
    return [
      enc(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
      enc(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
      enc(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
    ];
  };
}

/** Applies a color correction (see colorCorrector) to every #rgb, #rrggbb and rgb()/rgba() color of a piece of HTML. */
export function adjustColors(html, spec) {
  const fix = colorCorrector(spec);
  if (!fix) return html;
  const hex = ([R, G, B]) => `#${hex2(R)}${hex2(G)}${hex2(B)}`;
  return html
    .replace(/(?<!&)#([0-9a-fA-F]{6})\b/g, (m, h) => hex(fix(...[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)))))
    .replace(/(?<!&)#([0-9a-fA-F]{3})\b/g, (m, h) => hex(fix(...[...h].map((c) => parseInt(c + c, 16)))))
    .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(\s*,\s*[\d.]+)?\s*\)/g, (m, r, g, b, a) => {
      const [R, G, B] = fix(Number(r), Number(g), Number(b));
      return a ? `rgba(${R}, ${G}, ${B}${a})` : `rgb(${R}, ${G}, ${B})`;
    });
}

/**
 * Runs in the page: applies each label's correction (data-correction of its wrapper; colorCorrector is inlined
 * next to it) to its raster images (PNG/JPEG given as data: addresses; others are left as they are) and marks
 * the page as ready. Self-contained apart from colorCorrector.
 */
export async function correctImages() {
  const done = new Map();
  for (const wrap of document.querySelectorAll('[data-correction]')) {
    const spec = wrap.dataset.correction;
    const fix = colorCorrector(spec, 'images');
    if (!fix) continue;
    const imgs = [...wrap.querySelectorAll('img')].filter((i) => /^data:image\/(png|jpe?g)/.test(i.getAttribute('src') ?? ''));
    for (const img of imgs) {
      const src = img.getAttribute('src');
      const key = `${spec}|${src}`;
      if (!done.has(key)) {
        const el = new Image();
        el.src = src;
        await el.decode();
        const cv = document.createElement('canvas');
        cv.width = el.naturalWidth; cv.height = el.naturalHeight;
        const ctx = cv.getContext('2d');
        ctx.drawImage(el, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height);
        const cache = new Map();
        for (let i = 0; i < d.data.length; i += 4) {
          const packed = (d.data[i] << 16) | (d.data[i + 1] << 8) | d.data[i + 2];
          let c = cache.get(packed);
          if (!c) { c = fix(d.data[i], d.data[i + 1], d.data[i + 2]); cache.set(packed, c); }
          d.data[i] = c[0]; d.data[i + 1] = c[1]; d.data[i + 2] = c[2];
        }
        ctx.putImageData(d, 0, 0);
        done.set(key, cv.toDataURL('image/png'));
      }
      img.setAttribute('src', done.get(key));
    }
  }
  await Promise.all([...document.images].map((i) => i.decode().catch(() => null)));
  if (document.fonts) await document.fonts.ready;
  document.body.dataset.ready = '1';
}

const fmt = (v) => String(v).replace('.', ',');

/**
 * The sheet page. plan: from planSheet; labelsHtml: the static HTML of each label, by the `index` of the plan
 * (the template's .label element, from the renderer). options: { fontsCss, head, paperType, gamma, title,
 * itemGamma: [gamma by index] and captions: [text by index] (color calibration sheet) }.
 * A caption goes in the empty space under the front of its label, outside the cut line.
 */
export function sheetPage(plan, labelsHtml, options = {}) {
  const type = PAPER_TYPES[options.paperType ?? 'normal'] ?? PAPER_TYPES.normal;
  const gamma = options.gamma ?? type.gamma;
  const W = plan.paper.width, H = plan.paper.height;
  const pages = plan.pages.map((p) => {
    const items = p.items.map((it) => {
      const g = options.itemGamma?.[it.index] ?? gamma;
      const label = adjustColors(labelsHtml[it.index], g);
      const cap = options.captions?.[it.index];
      const caption = cap ? `<div style="position: absolute; left: 652px; top: 150px; width: 118px; font-family: Arial, sans-serif; font-size: 7px; line-height: 1.3; color: #000000">${cap}</div>` : '';
      return `<div data-correction="${g}" style="position: absolute; left: ${it.xMm.toFixed(3)}mm; top: ${it.yMm.toFixed(3)}mm; transform: scale(${SCALE.toFixed(6)}); transform-origin: 0 0">${label}${caption}</div>`;
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
    + `<script>${colorCorrector.toString().replace(/^export\s+/, '')}\n(${correctImages.toString().replace(/^export\s+/, '')})();</script></body></html>`;
}

/** Captions of a color calibration sheet: number and correction of each label. */
export const calibrationCaptions = (specs) => specs.map((g, i) => `<b>Prueba de color N.º ${i + 1}</b><br>${correctionName(g)}`);

/** Spanish name of a correction spec ("Sin corrección", "Corrección 0,45 por canal", "Luminosidad 0,5 · saturación ×1,25"). */
export function correctionName(spec) {
  const both = String(spec ?? 1).split('/');
  if (both.length > 1) return `Dibujo: ${correctionName(both[0])}<br>Imágenes: ${correctionName(both[1])}`;
  const text = String(spec ?? 1).trim().replace(/,/g, '.');
  const m = /^L\s*([0-9.]+)(?:\s*S\s*([0-9.]+))?$/i.exec(text);
  if (!m) return Number(text) === 1 ? 'Sin corrección' : `Corrección ${fmt(Number(text))} por canal`;
  return `Luminosidad ${fmt(Number(m[1]))}${m[2] && Number(m[2]) !== 1 ? ` · saturación ×${fmt(Number(m[2]))}` : ''}`;
}
