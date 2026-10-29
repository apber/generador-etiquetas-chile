// EAN-13 as SVG, drawn from its number (no image files needed).
// Same box as the vector the label used until v2.39: 113 modules (11 quiet + 95 + 7 quiet),
// guard bars longer, the 13 digits printed below (first digit outside, then 6 + 6).

import { isValidEan13 } from '../ean13.js';

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).reverse().join(''));
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** The 95 modules ('1' = bar) of a valid EAN-13. */
export function ean13Modules(number) {
  if (!isValidEan13(number)) throw new Error(`Invalid EAN-13 "${number}"`);
  const d = [...number].map(Number);
  let m = '101';
  for (let i = 0; i < 6; i++) m += (PARITY[d[0]][i] === 'L' ? L : G)[d[i + 1]];
  m += '01010';
  for (let i = 7; i < 13; i++) m += R[d[i]];
  return m + '101';
}

const W = 108.4904, H = 74.4378, MOD = W / 113, QUIET = 11, BAR = 63.327, GUARD = 68.377;
const isGuard = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
const f = (v, n = 3) => Number(v.toFixed(n));

/**
 * SVG of the code. width/height are the drawn size (px); the label draws it rotated 90°.
 */
export function ean13Svg(number, { width = W, height = H } = {}) {
  const m = ean13Modules(number);
  let bars = '';
  for (let i = 0; i < m.length;) {
    if (m[i] !== '1') { i++; continue; }
    let j = i;
    while (j < m.length && m[j] === '1' && isGuard(j) === isGuard(i)) j++;
    bars += `<rect x="${f((QUIET + i) * MOD)}" y="0" width="${f((j - i) * MOD)}" height="${isGuard(i) ? GUARD : BAR}"></rect>`;
    i = j;
  }
  const text = (x, t) => `<text x="${f(x, 4)}" y="72.355" style="font-family: Arial, Helvetica, sans-serif; font-size: 10px; fill: #000000; text-anchor: middle">${t}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${width}" height="${height}" role="img" aria-label="Código de barras ${number}">`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"></rect><g fill="#000000">${bars}</g>`
    + text(5.5 * MOD, number[0]) + text(35.5 * MOD, number.slice(1, 7)) + text(81.5 * MOD, number.slice(7)) + '</svg>';
}
