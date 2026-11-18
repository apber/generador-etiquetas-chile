// Colors of the medallion ring (18-11-2026): letter on the ring, ring-colored text on the cream, color differences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, ringLetterColor, ringInk, deltaELab, deltaE, similarRingColors, freeRingColors, ringColorProblems, nameBase,
  DARK_INK, WHITE } from '../src/ring-colors.js';
import { frontParts } from '../src/template/front.js';
import { labelMarkup } from '../src/template/label.js';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import { buildLabelData } from '../src/label-data.js';

test('WCAG contrast: black on white is 21, a color with itself is 1', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(contrast('#6E421C', '#6E421C'), 1);
});

test('CIEDE2000 matches the reference pairs of Sharma, Wu and Dalal (2005)', () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  ];
  for (const [a, b, want] of pairs) assert.ok(Math.abs(deltaELab(a, b) - want) < 1e-4, `${a} / ${b}: ${deltaELab(a, b)} ≠ ${want}`);
  assert.equal(deltaE('#C2185B', '#C2185B'), 0);
});

test('letter on the ring: white on dark or medium rings, dark brown on light ones', () => {
  assert.equal(ringLetterColor('#362A2D'), WHITE);
  assert.equal(ringLetterColor('#BD5B10'), WHITE);
  assert.equal(ringLetterColor('#F2E116'), DARK_INK);
  assert.equal(ringLetterColor('#C58B45'), DARK_INK);
});

test('ring-colored text on the cream: the ring color only from 4.5:1, otherwise dark brown', () => {
  assert.equal(ringInk('#743431'), '#743431');
  assert.equal(ringInk('#C2185B'), '#C2185B');
  assert.equal(ringInk('#986A29'), DARK_INK);   // 4.28
  assert.equal(ringInk('#F2E116'), DARK_INK);
});

test('look-alike colors: under 12 between products, under 9 between variants of the same product', () => {
  assert.equal(nameBase('Maní con chocolate leche'), 'mani');
  assert.equal(nameBase('Castañas de cajú sin sal'), 'castanas de caju');
  const others = [{ id: 'a', name: 'Maní con sal', color: '#BD5B10' }, { id: 'b', name: 'Linaza', color: '#986A29' }];
  // 10.x from "Maní con sal": a look-alike for another product, not for a variant of maní
  const near = '#E0781C';
  const d = deltaE(near, '#BD5B10');
  assert.ok(d >= 9 && d < 12, String(d));
  assert.deepEqual(similarRingColors(near, 'Huesillos', others).map((o) => o.id), ['a']);
  assert.deepEqual(similarRingColors(near, 'Maní sin sal', others).map((o) => o.id), []);
});

test('free palette colors are the ones no product uses; problems of a color by itself', () => {
  const palette = ['#C2185B', '#2B7D35', '#085BB4'];
  assert.deepEqual(freeRingColors(palette, [{ ring_color: '#c2185b' }, { ring_color: null }]), ['#2B7D35', '#085BB4']);
  assert.deepEqual(ringColorProblems('#F6EEDF'), ['like_background']);
  assert.deepEqual(ringColorProblems('#8E7E70'), ['low_letter_contrast']);
  assert.deepEqual(ringColorProblems('#2B7D35'), []);
});

test('template: ring letters and ring-colored texts follow the contrast rules', () => {
  const base = { productName: 'Banana chips', slogan: 'Bienestar en cada bocado', seals: [], description: ['BANANA CHIPS'], highlight: [], netWeight: { text: '50 g' } };
  const light = frontParts({ ...base, ringColor: '#F2E116' }, {}).html;
  assert.match(light, /fill="#F2E116"/);
  assert.doesNotMatch(light, /color: #FFFFFF/);
  assert.match(light, /font-weight: 800; font-size: [0-9.]+px; line-height: 1; color: #3A221A/);
  assert.match(light, /letter-spacing: 0.3px; color: #3A221A">/);
  const dark = frontParts({ ...base, ringColor: '#743431' }, {}).html;
  assert.match(dark, /line-height: 1; color: #FFFFFF/);
  assert.match(dark, /letter-spacing: 0.3px; color: #743431">/);
  const store = loadFolder(DEMO_FOLDER);
  const id = [...store.products.values()].find((p) => p.type === 'simple' && p.status === 'active').id;
  const d = buildLabelData(store, { productId: id });
  const back = labelMarkup(d, store.company, { ring: '#F2E116' }).html;
  assert.match(back, /class="name[TN]"[^>]*color: #3A221A/);
  assert.doesNotMatch(back, /class="name[TN]"[^>]*color: #F2E116/);
});
