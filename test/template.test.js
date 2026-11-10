import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ean13Modules, ean13Svg } from '../src/template/ean13-svg.js';
import { qrMatrix, qrSvg } from '../src/template/qr-svg.js';
import { VARIANTS } from '../src/template/back.js';
import { lengthMm, cutFor, MM } from '../src/template/geometry.js';
import { labelMarkup } from '../src/template/label.js';
import { frontParts } from '../src/template/front.js';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { buildLabelData } from '../src/label-data.js';

/** Reads the 13 digits back from the 95 modules. */
function decodeEan13(m) {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).reverse().join(''));
  const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  assert.equal(m.slice(0, 3), '101'); assert.equal(m.slice(45, 50), '01010'); assert.equal(m.slice(92), '101');
  let parity = '', left = '';
  for (let i = 0; i < 6; i++) {
    const c = m.slice(3 + 7 * i, 10 + 7 * i);
    if (L.includes(c)) { parity += 'L'; left += L.indexOf(c); } else { parity += 'G'; left += G.indexOf(c); }
  }
  let right = '';
  for (let i = 0; i < 6; i++) right += R.indexOf(m.slice(50 + 7 * i, 57 + 7 * i));
  return PARITY.indexOf(parity) + left + right;
}

test('EAN-13: the bars read back as the same number', () => {
  for (const n of ['2000000000008', '2000000000039', '2999999999991', '4006381333931']) {
    const m = ean13Modules(n);
    assert.equal(m.length, 95);
    assert.equal(decodeEan13(m), n);
  }
  assert.throws(() => ean13Modules('2000000000009'));
  const svg = ean13Svg('4006381333931', { width: 115.8, height: 79.44 });
  assert.match(svg, /viewBox="0 0 108.4904 74.4378" width="115.8" height="79.44"/);
  assert.match(svg, />006381</); assert.match(svg, />333931</);
});

test('QR: version 4 (33 modules) for a 59-character address, with the three finder patterns', () => {
  const m = qrMatrix('https://example.com/qr/00000000-0000-0000-0000-000000000000');
  assert.equal(m.length, 33);
  for (const [r, c] of [[0, 0], [0, 26], [26, 0]]) {
    assert.ok(m[r][c] && m[r + 6][c + 6] && m[r + 3][c + 3] && !m[r + 1][c + 1], `finder at ${r},${c}`);
  }
  assert.match(qrSvg('https://example.com', 35), /width="35" height="35"/);
});

test('variants: 44, in the engine order (gap 5 first; line, line+ri, top, top+ri)', () => {
  assert.equal(VARIANTS.length, 44);
  assert.deepEqual(VARIANTS.slice(0, 5).map((v) => v.id), ['line@5', 'line+ri@5', 'top@5', 'top+ri@5', 'line@4.75']);
  assert.equal(VARIANTS.at(-1).id, 'top+ri@2.5');
});

test('length: rounded up to 0.1 mm from the base of 54.5 mm', () => {
  assert.equal(lengthMm(0), 54.5);
  assert.equal(lengthMm(-23.0), 48.5);
  assert.equal(lengthMm(-23.07), 48.4);
  assert.equal(lengthMm(0.01), 54.6);
  assert.equal(Number(cutFor(48.4).toFixed(2)), 182.18);   // v2.39 canvas example
  assert.ok(Math.abs(MM - 3.7816) < 1e-9);
});

test('markup: texts of the back and front, all variants, escaped data', () => {
  const store = loadFolder(DEMO_FOLDER);
  const d = buildLabelData(store, { productId: 'mezcla-demo' });
  const { html, cfg } = labelMarkup(d, store.company);
  assert.equal((html.match(/class="rev"/g) ?? []).length, 44);
  assert.match(html, /<b>ELABORADO Y ENVASADO POR:<\/b> Empresa Demo SpA, Calle Ficticia 123, Ciudad Demo, Chile\.<br>/);
  assert.match(html, /<b>ORIGEN:<\/b> Chile\./);
  assert.match(html, /<b>CONTIENE:<\/b> maní\.<br><b>PUEDE CONTENER:<\/b>/);
  assert.match(html, />Porción<\/td><\/tr>/);
  assert.match(html, /Porciones por envase: 5/);
  assert.match(html, /aria-label="Sin código de barras"|aria-label="Código de barras \d{13}"/);
  assert.match(cfg.outline, /V \{C7\} Q 370\.14 \{C\} 362\.89 \{C\}/);
  // v0.6.1: straight free end 0.75 mm in (x = 4.54 px), no step; only the right fold marks
  assert.match(cfg.outline, /H 11\.79 Q 4\.54 \{C\} 4\.54 \{C7\} V 8 Q 4\.54 0\.75 11\.79 0\.75 Z$/);
  assert.doesNotMatch(cfg.outline, /7\.67/);
  assert.equal((html.match(/<line x1="759\.36"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /<line x1="379\.89"/);
  assert.doesNotMatch(html, /data-shift=/);
  // v2.39 as options: step, 1 mm rule and both fold marks
  const old = labelMarkup(d, store.company, { backEdge: 'step', foldMarks: 'both' });
  assert.match(old.cfg.outline, /H 14\.92 Q 7\.67 \{C\} 7\.67 \{C7\} V 118 Q 7\.67 112\.75 2\.42 112\.75 H 1\.70 V 8/);
  assert.match(old.html, /data-shift="3\.7816"/);
  assert.equal((old.html.match(/<line x1="379\.89"/g) ?? []).length, 5);
  assert.doesNotMatch(labelMarkup(d, store.company, { foldMarks: 'none' }).html, /<line /);
  const bad = buildLabelData(store, { productId: 'mani-tostado' });
  const evil = { ...bad, front: { ...bad.front, productName: 'Maní <script>' } };
  assert.doesNotMatch(labelMarkup(evil, store.company).html, /<script>/);
});

test('missing sections of the ingredients panel are left out (placeholder as an option)', () => {
  const store = loadFolder(DEMO_FOLDER);
  const d = buildLabelData(store, { productId: 'mani-tostado' });
  const noOrigin = { ...d, origin: { ...d.origin, text: null } };
  const html = labelMarkup(noOrigin, store.company).html;
  assert.doesNotMatch(html, /ORIGEN:/);
  assert.doesNotMatch(html, /por confirmar/);
  assert.match(html, /<div class="p1"><b>INGREDIENTES:<\/b>/);
  assert.match(labelMarkup(noOrigin, store.company, { missingSections: 'placeholder' }).html, /<b>ORIGEN:<\/b> \[por confirmar\]\./);
  const nothing = { ...noOrigin, ingredients: null };
  const h2 = labelMarkup(nothing, store.company).html;
  assert.doesNotMatch(h2, /INGREDIENTES:/);
  assert.match(h2, /<div class="p1"><b>CONTIENE:<\/b>/);
});

// Layout in Chromium (Playwright). Skipped when the browser is not installed.
let renderer = null;
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch(); await b.close();
  const { openRenderer } = await import('../src/node/render-label.js');
  renderer = openRenderer;
} catch { renderer = null; }

test('layout in the browser: every demo label gets a length, nothing passes the cut', { skip: !renderer && 'Chromium not installed (npx playwright install chromium)' }, async () => {
  const store = loadFolder(DEMO_FOLDER);
  const r = await renderer();
  try {
    for (const p of store.products.values()) {
      if (p.type === 'management_only') continue;
      const d = buildLabelData(store, { productId: p.id });
      const { result, html } = await r.render(d, store.company);
      assert.ok(result.lengthMm >= 35 && result.lengthMm <= 80, `${p.id}: ${result.lengthMm} mm`);
      assert.ok(result.check <= 0.01, `${p.id}: content ${result.check} px past the useful limit`);
      assert.ok(VARIANTS.some((v) => v.id === result.variant));
      assert.doesNotMatch(html, /class=|data-|<script/);
      assert.match(html, new RegExp(`height: ${result.boardHeight}px`));
      if (result.redes?.where === 'tabla') {
        const { redes, colA } = result.regions;
        assert.ok(Math.abs(redes.right - colA.right) < 0.5, `${p.id}: social block not flush right (${redes.right} vs ${colA.right})`);
      }
    }
    const d = buildLabelData(store, { productId: 'mani-tostado' });
    const { result } = await r.render({ ...d, ingredients: null, origin: { ...d.origin, text: null } }, store.company);
    assert.ok(result.signature && result.lengthMm > 30);
    assert.ok(result.check <= 0.01);
  } finally { await r.close(); }
});

test('medallion letters: placed with translate inside the medallion, no scaled 300 px box (PDF of several pages)', () => {
  const front = { productName: 'Semillas de maravilla', slogan: 'Bienestar en cada bocado', ringColor: '#6E421C', seals: [], description: ['SEMILLAS'], highlight: [], netWeight: { text: '50 g' } };
  const { html } = frontParts(front, {});
  assert.doesNotMatch(html, /width: 300px; height: 300px; transform: scale/);
  const letters = html.match(/<div style="position: absolute; left: 0px; top: 0px; width: 40px;[^"]*">/g) ?? [];
  assert.equal(letters.length, 'SEMILLAS DE MARAVILLA'.length + 'BIENESTAR EN CADA BOCADO'.length);
  for (const l of letters) assert.match(l, /transform: translate\([-0-9.]+px, [-0-9.]+px\) rotate\([-0-9.]+deg\) scale\(0\.\d+\)/);
});

test('arreglo 8: a barcode override with a wrong check digit draws «SIN CÓDIGO» instead of failing', () => {
  const store = loadFolder(DEMO_FOLDER);
  const d = buildLabelData(store, { productId: 'mani-tostado' });
  const { html } = labelMarkup(d, store.company, { barcode: '0000000000001' });
  assert.match(html, /SIN CÓDIGO/);
});
