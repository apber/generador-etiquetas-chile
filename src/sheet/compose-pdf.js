// Print sheet made from the PDF of each label (one PDF per presentation, from src/render/label-pdf.js): the
// labels are placed with the same plan as the HTML sheet (planSheet) and kept as vectors. Runs in the app
// (without internet) and in Node. PDFDocument comes from pdf-lib (passed in: the app and Node load it differently).

import { planSheet, labelBox } from './plan.js';
import { MM } from '../template/geometry.js';

const PT_PER_MM = 72 / 25.4;

/**
 * items: [{ id, pdf (bytes of the label PDF), cut, freeEnd }] in print order, one per copy (same id = same PDF).
 * options: planSheet options (paper, marginMm, gapMm). Returns { bytes, plan }.
 */
export async function composeSheet(PDFDocument, items, options = {}) {
  const plan = planSheet(items.map((i) => ({ id: i.id, cut: i.cut, freeEnd: i.freeEnd })), options);
  const out = await PDFDocument.create();
  out.setTitle(options.title ?? 'Etiquetas');
  out.setCreator('generador-etiquetas-chile');
  const embedded = new Map();
  for (const it of items) {
    if (embedded.has(it.id)) continue;
    const src = await PDFDocument.load(it.pdf);
    const [page] = await out.embedPdf(src, [0]);
    embedded.set(it.id, page);
  }
  for (const p of plan.pages) {
    const page = out.addPage([plan.paper.width * PT_PER_MM, plan.paper.height * PT_PER_MM]);
    for (const placed of p.items) {
      const it = items[placed.index];
      const e = embedded.get(it.id);
      const b = labelBox(it.cut, it.freeEnd);
      // xMm is where the label's board starts; its PDF starts at the visible outline (leftPx)
      const x = (placed.xMm + b.leftPx / MM) * PT_PER_MM;
      const top = (placed.yMm + b.topPx / MM) * PT_PER_MM;
      page.drawPage(e, { x, y: page.getHeight() - top - e.height, width: e.width, height: e.height });
    }
  }
  return { bytes: await out.save(), plan };
}
