// Front of the label (between the two folds): description and highlight on the left, the medallion
// (logo, slogan arc, product name arc, ring color) in the middle, ALTO EN seals and net weight on the right.
// Port of the official template of the small pouch (v2.39).

import { STRIP } from './geometry.js';
import { esc } from './html.js';

const SEAL_ORDER = ['energy', 'sugars', 'saturated_fat', 'sodium'];
const SEAL_ALT = { energy: 'CALORÍAS', sugars: 'AZÚCARES', saturated_fat: 'GRASAS SATURADAS', sodium: 'SODIO' };
const r2 = (v) => Math.round(v * 100) / 100;

/** Rough width of a capital letter of Montserrat, as a fraction of the font size (for the arcs). */
function wd(c) {
  if (c === ' ') return 0.28;
  if ('IÍ1'.includes(c)) return 0.32;
  if ('MÑ'.includes(c)) return c === 'M' ? 0.95 : 0.82;
  if (c === 'W') return 1.05;
  if ('OÓQCGD'.includes(c)) return 0.82;
  if ('LFETJ'.includes(c)) return 0.66;
  return 0.76;
}

/**
 * front: { productName, description[], highlight[], ringColor, slogan, seals[], netWeight.text }
 * opts: { sealSize: '10mm' | '15mm', medallion: 1 | 1.05 | 1.1 | 1.15, assets: { logo, seals: { id: url } } }
 */
export function frontParts(front, opts = {}) {
  const ring = front.ringColor;
  const legal = opts.sealSize === '15mm';
  const mf = opts.medallion ?? 1.1;
  const seals = SEAL_ORDER.filter((id) => front.seals.includes(id));
  const n = seals.length;
  const sz = legal ? 56.7 : 37.82;
  const sgap = 3.78;
  const D = 136 * mf, R = D / 2, cx = STRIP.frontCx;
  const Rv = R + 0.75, kR = R / Rv, ringW = 36 * kR;
  const zR0 = cx + R, zR1 = STRIP.foldRight, zRc = (zR0 + zR1) / 2, zRw = zR1 - zR0;
  const zL0 = STRIP.foldLeft, zL1 = cx - R, zLc = (zL0 + zL1) / 2, zLw = zL1 - zL0;

  // Seals: 10 mm in a 2×2 grid right of the medallion (15 mm: the legal size, also left of it)
  let pos = [], gridTop = 0, gridH = 0;
  if (legal) {
    const a = r2(zRc - 58.2), b = r2(zRc + 1.5), la = r2(zLc - 58.2), lb = r2(zLc + 1.5);
    pos = n === 1 ? [[r2(zRc - 28.35), 5]] : n === 2 ? [[a, 5], [b, 5]] : n === 3 ? [[a, 5], [b, 5], [r2(zLc - 28.35), 5]] : n === 4 ? [[a, 5], [b, 5], [la, 5], [lb, 5]] : [];
  } else if (n > 0) {
    const rows = n <= 2 ? 1 : 2;
    gridH = rows * sz + (rows - 1) * sgap;
    gridTop = 3;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 2), c = i % 2;
      const inRow = r === 0 ? Math.min(n, 2) : n - 2;
      const rowW = inRow * sz + (inRow - 1) * sgap;
      pos.push([r2(zRc - rowW / 2 + c * (sz + sgap)), r2(gridTop + r * (sz + sgap))]);
    }
  }
  let pesoTop = '0px', pesoH = '113px', pesoJustify = 'center', pesoFs = '17px';
  if (n >= 1) {
    pesoFs = '14px';
    if (legal) { pesoTop = '66px'; pesoH = '44px'; pesoJustify = 'flex-start'; }
    else { const t = gridTop + gridH + 3; pesoTop = `${t.toFixed(1)}px`; pesoH = `${(113 - t).toFixed(1)}px`; pesoJustify = 'flex-start'; }
  }
  const textW = Math.min(113, zLw - 6), pesoW = Math.min(117, zRw - 4);
  const compact = legal && n >= 3;

  // Arcs: slogan above, product name below, letter by letter
  const producto = front.productName.toUpperCase();
  const fsArc = (producto.length <= 12 ? 21 : producto.length <= 18 ? 17 : 15) * kR;
  const rc = 150 - ringW / 2;
  const rb = rc + fsArc / 2, ls = 0.8 * kR;
  const ws = [...producto].map((c) => wd(c) * fsArc + ls);
  const tot = ws.reduce((a, b) => a + b, 0);
  const th0 = Math.PI / 2 + tot / rc / 2;
  let acc = 0;
  const letter = (c, x, y, h, rot, weight) => `<div style="position: absolute; left: ${x}; top: ${y}; width: 40px; height: ${h}; margin-left: -20px; transform-origin: 50% 100%; transform: ${rot}; text-align: center; font-family: Montserrat, sans-serif; font-weight: ${weight}; font-size: ${h}; line-height: 1; color: #FFFFFF; white-space: pre">${esc(c)}</div>`;
  const arc = [...producto].map((c, i) => {
    const mid = acc + ws[i] / 2; acc += ws[i];
    const th = th0 - mid / rc;
    const x = 150 + rb * Math.cos(th), y = 150 + rb * Math.sin(th);
    return letter(c, `${x.toFixed(2)}px`, `${(y - fsArc).toFixed(2)}px`, `${fsArc}px`, `rotate(${(th * 180 / Math.PI - 90).toFixed(2)}deg)`, 800);
  }).join('');
  const lema = front.slogan.toUpperCase();
  const fsT = 14.5 * kR, lsT = 1.2 * kR, rT = rc - fsT / 2;
  const wsT = [...lema].map((c) => wd(c) * fsT * 0.97 + lsT);
  const totT = wsT.reduce((a, b) => a + b, 0);
  let accT = 0;
  const arcTop = [...lema].map((c, i) => {
    const mid = accT + wsT[i] / 2; accT += wsT[i];
    const th = -Math.PI / 2 - totT / rc / 2 + mid / rc;
    const x = 150 + rT * Math.cos(th), y = 150 + rT * Math.sin(th);
    return letter(c, `${x.toFixed(2)}px`, `${(y - fsT).toFixed(2)}px`, `${fsT}px`, `rotate(${(th * 180 / Math.PI + 90).toFixed(2)}deg)`, 700);
  }).join('');

  const description = front.description.map(esc).join('\n');
  const claim = (front.highlight ?? []).map(esc).join('\n');
  const assets = opts.assets ?? {};

  const textBlock = `<div style="position: absolute; left: ${r2(zLc - textW / 2)}px; top: ${compact ? '66px' : '0px'}; width: ${r2(textW)}px; height: ${compact ? '44px' : '113px'}; display: flex; flex-direction: column; align-items: center; justify-content: ${compact ? 'flex-start' : 'center'}; gap: 3px; text-align: center; font-family: Montserrat, sans-serif; font-weight: 700; font-size: 6.4px; line-height: 1.3; letter-spacing: 0.3px; color: ${ring}">`
    + `<div style="max-width: 104px; white-space: pre-line; font-size: 8px">${description}</div>`
    + (claim && compact ? `<div style="color: #6E421C; margin-top: 0px; white-space: pre-line">${claim}</div>` : '')
    + (claim && !compact ? `<div style="position: absolute; left: 0px; right: 0px; bottom: 9.45px; text-align: center; color: #6E421C; white-space: pre-line">${claim}</div>` : '')
    + '</div>';
  const weight = `<div style="position: absolute; left: ${r2(zRc - pesoW / 2)}px; top: ${pesoTop}; width: ${r2(pesoW)}px; height: ${pesoH}; display: flex; flex-direction: column; align-items: center; justify-content: ${pesoJustify}; font-family: Montserrat, sans-serif">`
    + '<div style="font-weight: 700; font-size: 6px; letter-spacing: 0.6px">PESO NETO</div>'
    + `<div style="font-weight: 800; font-size: ${pesoFs}; line-height: 1.05">${esc(front.netWeight.text)}</div></div>`;
  const sealImgs = seals.map((id, i) => `<img src="${esc(assets.seals?.[id] ?? '')}" alt="Sello ALTO EN ${SEAL_ALT[id]}, Ministerio de Salud" style="position: absolute; left: ${pos[i][0]}px; top: ${pos[i][1]}px; width: ${sz}px; height: ${sz}px">`).join('');
  const logo = assets.logo
    ? `<img src="${esc(assets.logo)}" alt="Logo" style="position: absolute; left: ${r2(ringW)}px; top: ${r2(ringW)}px; width: ${r2(300 - 2 * ringW)}px; height: ${r2(300 - 2 * ringW)}px; border-radius: 50%">`
    : '';
  const medallion = `<div style="position: absolute; left: ${r2(cx - Rv)}px; top: ${r2(R - Rv)}px; width: ${r2(2 * Rv)}px; height: ${r2(2 * Rv)}px">`
    + `<div style="position: absolute; left: 0px; top: 0px; width: 300px; height: 300px; transform: scale(${(2 * Rv / 300).toFixed(5)}); transform-origin: 0 0">`
    + `<svg viewBox="0 0 300 300" width="300" height="300" style="position: absolute; left: 0; top: 0" aria-hidden="true"><circle cx="150" cy="150" r="150" fill="${ring}"></circle><circle cx="150" cy="150" r="113" fill="#FBEFDC"></circle></svg>`
    + arcTop + arc + logo + '</div></div>';

  // Outline of the front part: the medallion hangs below the front height
  const Ra = R + 0.75, dyO = STRIP.frontHeight - R, dxO = Math.sqrt(Ra * Ra - dyO * dyO);
  return {
    html: textBlock + weight + sealImgs + medallion,
    medallionArc: { from: r2(cx + dxO), to: r2(cx - dxO), r: r2(Ra) },
  };
}

/** Outline of the whole strip (cut line) for a back whose bottom edge is at `cut` (null: with {C} and {C7} to fill in). */
export function outlinePath(cut, arc) {
  const c = cut == null ? '{C}' : r2(cut), c7 = cut == null ? '{C7}' : r2(cut - 7.25);
  return `M 8.95 0.75 H 772.94 Q 775.44 0.75 775.44 3.25 V 110.25 Q 775.44 112.75 772.94 112.75 H ${arc.from} A ${arc.r} ${arc.r} 0 0 1 ${arc.to} 112.75 `
    + `H 375.39 Q 370.14 112.75 370.14 118 V ${c7} Q 370.14 ${c} 362.89 ${c} H 14.92 Q 7.67 ${c} 7.67 ${c7} V 118 Q 7.67 112.75 2.42 112.75 H 1.70 V 8 Q 1.70 0.75 8.95 0.75 Z`;
}
