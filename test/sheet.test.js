import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { planSheet, fillPage, labelBox, PAPERS } from '../src/sheet/plan.js';
import { adjustColors, gammaChannel, sheetPage } from '../src/sheet/page.js';
import { cutFor } from '../src/template/geometry.js';

const lab = (id, lengthMm) => ({ id, cut: cutFor(lengthMm) });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('label box: the visible outline measures 205.0 mm across and the back length + stroke down', () => {
  const b = labelBox(cutFor(51.7));
  assert.ok(near(b.widthMm, 205.0, 0.01), `${b.widthMm}`);
  assert.ok(near(b.heightMm, 51.67, 0.01), `${b.heightMm}`);
});

test('plan: 5 labels of 51.7 mm on letter with margins up to 4.5 mm; with 4.6 mm the fifth goes to a new page', () => {
  const five = Array.from({ length: 5 }, (_, i) => lab(`p${i}`, 51.7));
  const a = planSheet(five, { marginMm: 4.5 });
  assert.equal(a.pages.length, 1);
  assert.equal(a.pages[0].items.length, 5);
  const b = planSheet(five, { marginMm: 4.6 });
  assert.deepEqual(b.pages.map((p) => p.items.length), [4, 1]);
});

test('plan: 3 mm between outlines, centered on the page, different lengths', () => {
  const list = [lab('a', 51.7), lab('b', 48.4), lab('c', 43.0)];
  const { pages, sideMm, paper } = planSheet(list);
  const it = pages[0].items;
  for (let i = 1; i < it.length; i++) assert.ok(near(it[i].yMm - (it[i - 1].yMm + it[i - 1].heightMm), 3, 1e-9));
  const bottom = paper.height - (it.at(-1).yMm + it.at(-1).heightMm);
  assert.ok(near(it[0].yMm, bottom, 1e-9));
  assert.ok(near(pages[0].marginTopMm, it[0].yMm, 1e-9));
  assert.ok(near(sideMm, (PAPERS.letter.width - labelBox(list[0].cut).widthMm) / 2));
});

test('plan: letter leaves 5.4 mm at the sides; A4 only 2.5 mm, with a warning', () => {
  assert.deepEqual(planSheet([lab('a', 50)]).warnings, []);
  const a4 = planSheet([lab('a', 50)], { paper: 'a4' });
  assert.equal(a4.warnings[0].code, 'side_margin_too_small');
  assert.ok(near(a4.sideMm, 2.5, 0.01));
  assert.throws(() => planSheet([lab('a', 50)], { paper: 'oficio' }));
});

test('fill: repeats the list in order until the next one does not fit', () => {
  const out = fillPage([lab('mani', 51.7), lab('cran', 51.7), lab('mix', 48.4)]);
  assert.deepEqual(out.map((l) => l.id), ['mani', 'cran', 'mix', 'mani', 'cran']);
  assert.equal(fillPage([lab('a', 43)]).length, 5);
  assert.equal(fillPage([lab('a', 43)], { paper: 'a4' }).length, 6);
});

test('color by paper type: gamma lightens middle tones, keeps black, white and HTML entities', () => {
  assert.equal(gammaChannel(0, 0.85), 0);
  assert.equal(gammaChannel(255, 0.85), 255);
  assert.ok(gammaChannel(128, 0.85) > 128);
  const html = '<div style="color: #2B1A10; background: #FFFFFF; border: 1px solid #000">&#160;<svg fill="rgb(111, 127, 42)"></svg></div>';
  const out = adjustColors(html, 0.85);
  assert.match(out, /#FFFFFF/);
  assert.match(out, /#000000/);
  assert.match(out, /&#160;/);
  assert.doesNotMatch(out, /#2B1A10/);
  assert.doesNotMatch(out, /rgb\(111, 127, 42\)/);
  assert.equal(adjustColors(html, 1), html);
});

test('sheet page: paper size, one section per page, labels at real size', () => {
  const plan = planSheet([lab('a', 51.7), lab('b', 48.4)]);
  const page = sheetPage(plan, ['<div class="label">A</div>', '<div class="label">B</div>']);
  assert.match(page, /@page \{ size: 215\.9mm 279\.4mm; margin: 0 \}/);
  assert.equal(page.match(/<section class="sheet">/g).length, 1);
  assert.match(page, /transform: scale\(0\.9994\d+\)/);
});

const hasChromium = await (async () => {
  try { const { chromium } = await import('playwright'); return existsSync(chromium.executablePath()); } catch { return false; }
})();

test('PDF of the demo labels: one page per planned sheet, letter size', { skip: !hasChromium && 'Chromium not installed (npx playwright install chromium)' }, async () => {
  const { loadFolder, DEMO_FOLDER } = await import('../src/node/load-folder.js');
  const { makeSheet } = await import('../src/node/sheet-pdf.js');
  const store = loadFolder(DEMO_FOLDER);
  const ids = [...store.products.values()].filter((p) => p.type !== 'management_only').map((p) => ({ id: p.id, copies: 2 }));
  const res = await makeSheet(store, ids, { paperType: 'fotografico' });
  const text = res.pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF'));
  const pages = text.match(/\/Type\s*\/Page[^s]/g).length;
  assert.equal(pages, res.plan.pages.length);
  assert.ok(res.plan.pages.length >= 2);
  assert.match(text, /\/MediaBox\s*\[\s*0 0 612 792\s*\]/);
});
