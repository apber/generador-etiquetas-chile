// Colors of the medallion ring: which letter goes on the ring, which color the ring-colored text takes on the label
// background, and how close two ring colors are. Shared by the template, the app and the tests (no Node, no DOM).
//
// Rules (18-11-2026):
// - Letters on the ring (slogan and product name): white or dark brown, whichever has more contrast (WCAG).
// - Text in the ring color on the cream background (front description, product name on the back): the ring color if
//   it reaches 4.5:1 against the background (small text); if not, dark brown.
// - Two ring colors "look alike" when CIEDE2000 is below 12 (9 between variants of the same product).

export const LABEL_BACKGROUND = '#F8F3E8';
export const DARK_INK = '#3A221A';
export const WHITE = '#FFFFFF';
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_DELTA_E = 12;
export const MIN_DELTA_E_VARIANT = 9;
export const MIN_DELTA_E_BACKGROUND = 16;

export const isHex = (h) => typeof h === 'string' && /^#[0-9A-Fa-f]{6}$/.test(h);

function rgb(hex) {
  if (!isHex(hex)) throw new Error(`Not a #RRGGBB color: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/** WCAG relative luminance. */
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1 to 21). */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Letter color on the ring: white or dark brown, whichever reads better. */
export const ringLetterColor = (ring) => (contrast(ring, WHITE) >= contrast(ring, DARK_INK) ? WHITE : DARK_INK);

/** Best letter contrast a ring color allows (to warn when a chosen color is under 4.5 with both letters). */
export const ringLetterContrast = (ring) => Math.max(contrast(ring, WHITE), contrast(ring, DARK_INK));

/** Color of the text that goes in the ring color on the label background (description, name on the back). */
export const ringInk = (ring, background = LABEL_BACKGROUND) => (contrast(ring, background) >= MIN_TEXT_CONTRAST ? ring : DARK_INK);

function lab(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIEDE2000 color difference between two #RRGGBB colors. */
export const deltaE = (h1, h2) => deltaELab(lab(h1), lab(h2));

/** CIEDE2000 between two CIELAB colors [L, a, b]. */
export function deltaELab([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) { hm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTh = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** Base of a product name for "variants of the same product": the name before « con » / « sin ». */
export function nameBase(name) {
  const n = String(name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return n.split(/\s+(?:con|sin)\s+/)[0];
}

/**
 * Products whose ring color looks like `hex` (closest first). others: [{ id, name, color }].
 * Variants of the same product (same name base) only count below MIN_DELTA_E_VARIANT.
 */
export function similarRingColors(hex, name, others) {
  const base = nameBase(name);
  return others
    .filter((o) => isHex(o.color))
    .map((o) => ({ ...o, deltaE: deltaE(hex, o.color) }))
    .filter((o) => o.deltaE < (nameBase(o.name) === base ? MIN_DELTA_E_VARIANT : MIN_DELTA_E))
    .sort((a, b) => a.deltaE - b.deltaE);
}

/** Problems of a ring color by itself: too close to the cream center, or no letter reaches 4.5. */
export function ringColorProblems(hex) {
  const out = [];
  if (deltaE(hex, LABEL_BACKGROUND) < MIN_DELTA_E_BACKGROUND) out.push('like_background');   // the logo's cream = label background
  if (ringLetterContrast(hex) < MIN_TEXT_CONTRAST) out.push('low_letter_contrast');
  return out;
}

/** Palette colors not used by any product (in palette order). */
export function freeRingColors(palette, products) {
  const used = new Set([...products].map((p) => (p.ring_color ?? '').toUpperCase()).filter(Boolean));
  return (palette ?? []).filter((c) => isHex(c) && !used.has(c.toUpperCase()));
}
