// QR as SVG from its address: error correction M, smallest version that fits, no logo in the middle,
// white border of 1.5 modules (the QR regenerated for the label in v2.38: 33 modules, 9.3 mm).

import qrcode from 'qrcode-generator';

export function qrMatrix(text) {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

export function qrSvg(text, size, label = 'Código QR') {
  const m = qrMatrix(text);
  const n = m.length;
  let d = '';
  m.forEach((row, r) => row.forEach((dark, c) => { if (dark) d += `M${c} ${r}h1v1h-1z`; }));
  return `<svg viewBox="-1.5 -1.5 ${n + 3} ${n + 3}" width="${size}" height="${size}" role="img" aria-label="${label}" style="flex: none; display: block">`
    + `<rect x="-1.5" y="-1.5" width="${n + 3}" height="${n + 3}" fill="#FFFFFF"></rect><path d="${d}" fill="#000000"></path></svg>`;
}
