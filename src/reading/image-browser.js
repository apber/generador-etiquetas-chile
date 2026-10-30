// Browser side of the photo reading (stage 7e): scales each photo, checks it and encodes it
// as JPEG for the reading. Needs createImageBitmap and a canvas (any current browser).

import { measureImage, judgeImage, QUALITY_THRESHOLDS } from './image-quality.js';

function canvasOf(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function scaled(bitmap, longSide) {
  const k = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas: c, ctx, w, h };
}

async function toBase64(canvas, quality) {
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
    : await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), bytes: buf.length };
}

/**
 * file: a File or Blob (photo or capture).
 * Returns { ok, reasons, metrics, original: {width, height}, image: { mimeType, base64, width, height, bytes } }.
 */
export async function prepareImage(file, { maxSide = 1600, quality = 0.85, thresholds = QUALITY_THRESHOLDS } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const original = { width: bitmap.width, height: bitmap.height };
  const a = scaled(bitmap, thresholds.analysisLongSidePx);
  const metrics = measureImage({ width: a.w, height: a.h, data: a.ctx.getImageData(0, 0, a.w, a.h).data });
  const verdict = judgeImage(metrics, original, thresholds);
  const out = scaled(bitmap, maxSide);
  const enc = await toBase64(out.canvas, quality);
  bitmap.close?.();
  return { ...verdict, original, image: { mimeType: 'image/jpeg', base64: enc.base64, width: out.w, height: out.h, bytes: enc.bytes } };
}
