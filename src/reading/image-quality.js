// Photo check done on the device BEFORE spending a reading (stage 7e).
// Pure functions on pixel data ({ width, height, data: RGBA }), so they run in the browser
// and in tests. Thresholds are a first guess, to be calibrated with real photos.

export const QUALITY_THRESHOLDS = {
  minLongSidePx: 800, // original photo or capture
  analysisLongSidePx: 1024, // the check is done on the image scaled to this size
  minSharpness: 60, // variance of the Laplacian at analysisLongSidePx (lower = blurrier)
  minMeanLuminance: 45, // 0-255
  maxClippedShare: 0.35, // share of burnt pixels (photos only)
  screenWhiteShare: 0.25, // share of pure white pixels from which it is a screen capture
};

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Measures an image already scaled to about QUALITY_THRESHOLDS.analysisLongSidePx.
 * Returns { sharpness, meanLuminance, clippedShare, whiteShare, kind: 'photo' | 'screen' }.
 */
export function measureImage({ width, height, data }) {
  const n = width * height;
  const gray = new Float32Array(n);
  let sum = 0;
  let clipped = 0;
  let white = 0;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const y = lum(data, i);
    gray[p] = y;
    sum += y;
    if (y >= 250) clipped++;
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) white++;
  }
  // Variance of the 4-neighbour Laplacian
  let s = 0;
  let s2 = 0;
  let m = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const l = gray[p - 1] + gray[p + 1] + gray[p - width] + gray[p + width] - 4 * gray[p];
      s += l;
      s2 += l * l;
      m++;
    }
  }
  const mean = m ? s / m : 0;
  const sharpness = m ? s2 / m - mean * mean : 0;
  const whiteShare = white / n;
  return {
    sharpness: Math.round(sharpness * 10) / 10,
    meanLuminance: Math.round(sum / n),
    clippedShare: Math.round((clipped / n) * 1000) / 1000,
    whiteShare: Math.round(whiteShare * 1000) / 1000,
    kind: whiteShare >= QUALITY_THRESHOLDS.screenWhiteShare ? 'screen' : 'photo',
  };
}

/**
 * Verdict for one image. original: { width, height } of the file as received.
 * Returns { ok, reasons: ['small' | 'blurry' | 'dark' | 'overexposed'], metrics }.
 */
export function judgeImage(metrics, original, t = QUALITY_THRESHOLDS) {
  const reasons = [];
  if (Math.max(original.width, original.height) < t.minLongSidePx) reasons.push('small');
  if (metrics.sharpness < t.minSharpness) reasons.push('blurry');
  if (metrics.meanLuminance < t.minMeanLuminance) reasons.push('dark');
  if (metrics.kind === 'photo' && metrics.clippedShare > t.maxClippedShare) reasons.push('overexposed');
  return { ok: reasons.length === 0, reasons, metrics };
}

/** Short Spanish reason for the alert ("La foto 2 está borrosa"). */
export const QUALITY_REASON_TEXT = {
  small: 'es muy chica',
  blurry: 'está borrosa',
  dark: 'está muy oscura',
  overexposed: 'tiene mucho reflejo o luz',
};
