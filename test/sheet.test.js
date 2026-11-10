import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { planSheet, fillPage, labelBox, PAPERS } from '../src/sheet/plan.js';
import { adjustColors, gammaChannel, colorCorrector, correctionName, sheetPage, calibrationCaptions } from '../src/sheet/page.js';
import { cutFor, MM } from '../src/template/geometry.js';

const lab = (id, lengthMm) => ({ id, cut: cutFor(lengthMm) });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('label box: the visible outline measures 205.0 mm across and the back length + stroke down', () => {
  const b = labelBox(cutFor(51.7));
  assert.ok(near(b.widthMm, 205.0, 0.01), `${b.widthMm}`);
  assert.ok(near(b.heightMm, 51.67, 0.01), `${b.heightMm}`);
});

test('plan: 5 labels of 51.7 mm on letter with margins up to 4.5 mm; with 4.6 mm the fifth goes to a new page', () => {
  const five = Array.from({ length: 5 }, (_, i) => lab(`p${i}`, 51.7));
  const a = planSheet(five, { marginMm: 4.5, gapMm: 3 });
  assert.equal(a.pages.length, 1);
  assert.equal(a.pages[0].items.length, 5);
  const b = planSheet(five, { marginMm: 4.6, gapMm: 3 });
  assert.deepEqual(b.pages.map((p) => p.items.length), [4, 1]);
});

test('plan: 3 mm between outlines (option), centered on the page, different lengths', () => {
  const list = [lab('a', 51.7), lab('b', 48.4), lab('c', 43.0)];
  const { pages, sideMm, paper } = planSheet(list, { gapMm: 3 });
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
  assert.equal(fillPage([lab('a', 43)], { gapMm: 3 }).length, 5);
  assert.equal(fillPage([lab('a', 43)], { paper: 'a4', gapMm: 3 }).length, 6);
});

test('shared cut line (default, v0.6.1): the line of the next label lies on the one of the previous label', () => {
  const list = [lab('a', 51.7), lab('b', 43.0)];
  const it = planSheet(list).pages[0].items;
  // bottom line of a (center at cut) = top line of b (center 0.75 px below its top)
  const lineA = it[0].yMm + list[0].cut / MM, lineB = it[1].yMm + 0.75 / MM;
  assert.ok(near(lineA, lineB, 1e-9), `${lineA} ${lineB}`);
  // letter, 4 mm margins: 6 of 43.0 mm (5 with 3 mm), 5 of 51.7 mm
  assert.equal(fillPage([lab('a', 43.0)]).length, 6);
  assert.equal(fillPage([lab('a', 44.8)]).length, 6);
  assert.equal(fillPage([lab('a', 46.5)]).length, 5);
  assert.equal(fillPage([lab('a', 51.7)]).length, 5);
});

test('label box with the straight free end (2 mm from the pouch edge): 0.75 mm narrower', () => {
  const step = labelBox(cutFor(51.7)), straight = labelBox(cutFor(51.7), 1.70 + 0.75 * MM);
  assert.ok(near(step.widthMm - straight.widthMm, 0.75, 1e-9));
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

test('color by lightness only: keeps black, white and the hue; a number is still the per-channel gamma', () => {
  const fix = colorCorrector('L0.5');
  assert.deepEqual(fix(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(fix(255, 255, 255), [255, 255, 255]);
  const green = fix(0x00, 0xac, 0x55);
  assert.ok(green[1] > 0xac && green[1] > green[2] + 60, 'the WhatsApp green stays green (does not turn mint)');
  const brown = fix(0x3a, 0x22, 0x1a);
  assert.ok(brown[0] > 0x3a && brown[0] > brown[1] && brown[1] > brown[2], 'the brown gets lighter and stays brown');
  const grey = fix(128, 128, 128);
  assert.ok(Math.abs(grey[0] - grey[2]) <= 1 && grey[0] > 128, 'a grey stays grey');
  const vivid = colorCorrector('L0.5S1.25')(0x3a, 0x22, 0x1a);
  assert.ok(vivid[0] - vivid[2] > brown[0] - brown[2], 'more colorful with S');
  assert.equal(colorCorrector(1), null);
  assert.equal(colorCorrector('L1'), null);
  assert.deepEqual(colorCorrector(0.45)(0x00, 0xac, 0x55), [0, gammaChannel(0xac, 0.45), gammaChannel(0x55, 0.45)]);
  assert.throws(() => colorCorrector('X2'));
  assert.equal(adjustColors('<b style="color: #00AC55">', 'L0,5'), adjustColors('<b style="color: #00AC55">', 'L0.5'));
  assert.equal(correctionName(1), 'Sin corrección');
  assert.equal(correctionName(0.45), 'Corrección 0,45 por canal');
  assert.equal(correctionName('L0.5S1.25'), 'Luminosidad 0,5 · saturación ×1,25');
});

test('separate corrections for the drawing and the images ("drawing/images")', () => {
  const split = 'L0.475S1.2/L0.5';
  assert.deepEqual(colorCorrector(split)(0x3a, 0x22, 0x1a), colorCorrector('L0.475S1.2')(0x3a, 0x22, 0x1a));
  assert.deepEqual(colorCorrector(split, 'images')(0xd0, 0x20, 0x30), colorCorrector('L0.5')(0xd0, 0x20, 0x30));
  assert.deepEqual(colorCorrector('L0.5', 'images')(0xd0, 0x20, 0x30), colorCorrector('L0.5')(0xd0, 0x20, 0x30), 'without "/" both parts use the same');
  assert.equal(colorCorrector('L0.5/1', 'images'), null);
  assert.equal(adjustColors('<b style="color: #3A221A">', split), adjustColors('<b style="color: #3A221A">', 'L0.475S1.2'));
  assert.equal(correctionName(split), 'Dibujo: Luminosidad 0,475 · saturación ×1,2<br>Imágenes: Luminosidad 0,5');
});

test('photo paper: background of the label with its own correction (overrides)', () => {
  const html = '<p style="fill: #F8F3E8; color: #3A221A">';
  const out = adjustColors(html, 'L0.45S1.25/L0.5', { '#f8f3e8': 0.45 });
  assert.match(out, new RegExp(`fill: ${adjustColors('#F8F3E8', 0.45)};`));
  assert.match(out, new RegExp(`color: ${adjustColors('#3A221A', 'L0.45S1.25')}"`));
  assert.equal(adjustColors(html, 1, { '#F8F3E8': 1 }), html);
  const plan = planSheet([lab('a', 51.7)]);
  const photo = sheetPage(plan, ['<div class="label" style="fill: #F8F3E8"></div>'], { paperType: 'fotografico' });
  assert.match(photo, new RegExp(adjustColors('#F8F3E8', 0.45)));
  assert.match(photo, /data-correction="L0\.45S1\.25\/L0\.5"/);
  const explicit = sheetPage(plan, ['<div class="label" style="fill: #F8F3E8"></div>'], { paperType: 'fotografico', gamma: 'L0.5' });
  assert.match(explicit, new RegExp(adjustColors('#F8F3E8', 'L0.5')), 'an explicit --gamma applies to everything');
});

test('sheet page: paper size, one section per page, labels at real size', () => {
  const plan = planSheet([lab('a', 51.7), lab('b', 48.4)]);
  const page = sheetPage(plan, ['<div class="label">A</div>', '<div class="label">B</div>']);
  assert.match(page, /@page \{ size: 215\.9mm 279\.4mm; margin: 0 \}/);
  assert.equal(page.match(/<section class="sheet">/g).length, 1);
  assert.match(page, /transform: scale\(0\.9994\d+\)/);
});

test('calibration sheet: one gamma and one caption per label', () => {
  const plan = planSheet([lab('a', 50), lab('a', 50)]);
  const steps = [1, 0.6];
  const page = sheetPage(plan, ['<div style="color: #3A221A">A</div>', '<div style="color: #3A221A">A</div>'], { itemGamma: steps, captions: calibrationCaptions(steps) });
  assert.match(page, /data-correction="1"[^>]*><div style="color: #3A221A">/);
  assert.match(page, /data-correction="0.6"[^>]*><div style="color: #(?!3A221A)[0-9A-F]{6}">/);
  assert.match(page, /Prueba de color N\.º 1<\/b><br>Sin corrección/);
  assert.match(page, /Prueba de color N\.º 2<\/b><br>Corrección 0,6/);
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
