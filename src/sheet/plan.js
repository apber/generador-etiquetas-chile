// Print sheet: places finished labels on pages (letter or A4) at real size, one under the other, with a fixed
// gap between their cut outlines, as many per page as fit inside the printer margins. Pure functions: the app
// and the Node script use the same plan.
//
// Sizes are in mm. A label is measured by its visible outline (the cut line, stroke included), not by its
// board: the board is a few tenths of a mm larger.

import { STRIP, MM } from '../template/geometry.js';

export const PAPERS = {
  letter: { name: 'carta', width: 215.9, height: 279.4 },
  a4: { name: 'A4', width: 210, height: 297 },
};

export const DEFAULT_SHEET_OPTIONS = {
  paper: 'letter',
  gapMm: 3,            // between the cut outlines of two labels (25-10-2026)
  marginMm: 4,         // top and bottom: 5 labels of 51.7 mm fit on letter with up to 4.5 mm (checked by the user)
  minSideMm: 3,        // narrower side margins give a warning (the strip measures 205.0 mm: 5.4 mm on letter, 2.5 on A4)
};

/** Visible outline of a laid-out label, in board px and mm (cut = bottom edge of the back, from layoutLabel). */
export function labelBox(cut) {
  const half = 0.75;   // half the stroke of the cut line
  const left = STRIP.freeEnd - half, right = STRIP.tailEnd + half;
  const bottom = cut + half;
  return { leftPx: left, topPx: 0, widthPx: right - left, heightPx: bottom,
    widthMm: (right - left) / MM, heightMm: bottom / MM };
}

/**
 * Pages for a list of labels, in order. labels: [{ id, cut }] (one entry per copy).
 * Returns { paper, pages: [{ items: [{ index, id, xMm, yMm }], marginTopMm, marginBottomMm }], sideMm, warnings }.
 * Each page is centered: vertically by its stack of labels, horizontally by the visible outline.
 */
export function planSheet(labels, options = {}) {
  const o = { ...DEFAULT_SHEET_OPTIONS, ...options };
  const paper = PAPERS[o.paper];
  if (!paper) throw new Error(`Unknown paper "${o.paper}" (letter or a4)`);
  const usable = paper.height - 2 * o.marginMm;
  const warnings = [];
  const boxes = labels.map((l) => ({ ...l, box: labelBox(l.cut) }));
  const pages = [];
  let cur = [];
  let h = 0;
  boxes.forEach((l, index) => {
    const need = (cur.length ? o.gapMm : 0) + l.box.heightMm;
    if (cur.length && h + need > usable + 1e-6) { pages.push(cur); cur = []; h = 0; }
    if (!cur.length && l.box.heightMm > usable) warnings.push({ code: 'label_taller_than_page', id: l.id });
    h += (cur.length ? o.gapMm : 0) + l.box.heightMm;
    cur.push({ ...l, index });
  });
  if (cur.length) pages.push(cur);

  const width = boxes.length ? Math.max(...boxes.map((l) => l.box.widthMm)) : 0;
  const sideMm = (paper.width - width) / 2;
  if (boxes.length && sideMm < o.minSideMm - 1e-6) warnings.push({ code: 'side_margin_too_small', sideMm });

  return {
    paper: { key: o.paper, ...paper },
    gapMm: o.gapMm,
    sideMm,
    warnings,
    pages: pages.map((items) => {
      const stack = items.reduce((s, l, i) => s + l.box.heightMm + (i ? o.gapMm : 0), 0);
      let y = (paper.height - stack) / 2;
      const placed = items.map((l) => {
        const it = { index: l.index, id: l.id, xMm: sideMm - l.box.leftPx / MM, yMm: y - l.box.topPx / MM,
          heightMm: l.box.heightMm };
        y += l.box.heightMm + o.gapMm;
        return it;
      });
      const top = (paper.height - stack) / 2;
      return { items: placed, marginTopMm: top, marginBottomMm: top };
    }),
  };
}

/**
 * How many copies of a list of labels fit on one page, repeating the list in order (maní, cranberries, Mix,
 * maní…) until the next one does not fit. labels: [{ id, cut }].
 */
export function fillPage(labels, options = {}) {
  const o = { ...DEFAULT_SHEET_OPTIONS, ...options };
  const paper = PAPERS[o.paper];
  if (!paper || !labels.length) return [];
  const usable = paper.height - 2 * o.marginMm;
  const out = [];
  let h = 0;
  for (let i = 0; i < 100; i++) {
    const l = labels[i % labels.length];
    const need = (out.length ? o.gapMm : 0) + labelBox(l.cut).heightMm;
    if (h + need > usable + 1e-6) break;
    h += need;
    out.push(l);
  }
  return out;
}
