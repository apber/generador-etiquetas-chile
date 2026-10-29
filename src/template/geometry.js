// Geometry of the small-pouch label (v2.39), in canvas px at real size: 1 mm = 3.7816 px (779 px = 206 mm).
//
// The strip wraps the pouch. Union B: the front (between the two folds) continues 4.25 mm past the right fold
// as a hidden tail; the back is one piece that goes round the left fold and ends on top of the tail,
// 1.25 mm before the right fold. Coordinates in the strip go from the free end of the back (x ≈ 1.7) to the
// end of the tail (x = 775.44).
//
// The back is laid out in its own "view" (as seen on the pouch from behind, as in the measuring engine):
// view x = strip x − STRIP.backDx.

export const MM = 3.7816;

export const STRIP = {
  boardWidth: 777,
  foldLeft: 379.89,        // fold between the back (table side) and the front
  foldRight: 759.36,       // fold between the front and the hidden tail (v2.39: 0.25 mm to the left)
  frontCx: 569.625,        // center of the medallion, halfway between the folds
  frontHeight: 112.75,     // 30 mm
  tailEnd: 775.44,
  freeEnd: 1.70,           // free end of the back (v2.39: 0.25 mm shorter)
  backDx: -3.03,           // strip x of view x = 0
  foldMarksY: [[0.75, 7.5], [29, 35], [53, 59], [77, 83], [105.5, 112]],
};

export const BACK = {
  width: 382.92,           // view width (from the right fold of the front to the left fold)
  cut: 205.25,             // bottom edge for the base length of 54.5 mm
  limit: 202,              // useful limit of the content for the base length (0.85 mm above the cut)
  baseLengthMm: 54.5,
  stepY: 112.75,           // below the front height every piece narrows (step)
  shift: MM,               // a paragraph that fits fully above the step starts 1 mm further left
  textX: 13 + 0.9454,      // text margin (v2.39: moved 0.25 mm with the shorter free end)
  contentRight: 370.25,    // right edge of the content (the table side)
  gutter: 4,               // ingredients text → table
  gap: 2,                  // between paragraphs of the ingredients panel
  redesGap: 4,             // social block in the panel: air above and below
  nameHeight: 8.5 * 1.17,
  nameGap: 3,              // name in one line → first paragraph
  barcodeBase: { scale: 0.85, w: 84.4, h: 123.04 },
  signature: { w: 76, h: 27, top: 13, fontSize: 14, iconLeft: 7, iconTop: 4, iconHeight: 12 },
  qrSize: 35,              // 9.3 mm
};

/** Back length (mm, rounded up to 0.1) for a content that ends `overPx` below the base useful limit. */
export function lengthMm(overPx) {
  return Math.ceil((BACK.baseLengthMm + overPx / MM) * 10 - 1e-6) / 10;
}

/** Bottom edge of the back (cut, strip px) for a back length in mm. */
export function cutFor(lengthMmValue) {
  return BACK.cut + Math.round((lengthMmValue - BACK.baseLengthMm) * MM * 1000) / 1000;
}
