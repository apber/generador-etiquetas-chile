import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundHalfUp, declareValue, formatDeclared, formatPlain, servingsPerPackage } from '../src/rounding.js';

const text = (x) => formatDeclared(declareValue(x));

test('half-up rounding is safe against floating point', () => {
  assert.equal(roundHalfUp(1.005, 2), 1.01);
  assert.equal(roundHalfUp(0.125, 2), 0.13);
  assert.equal(roundHalfUp(2.25, 1), 2.3);
  assert.equal(roundHalfUp(0.3 * 18.5, 1), 5.6); // 5.55 in binary is 5.5499…
  assert.equal(roundHalfUp(170.5, 0), 171);
  assert.equal(roundHalfUp(170.49, 0), 170);
});

test('art. 115 ranges: integer from 100, 1 decimal from 1, 2 below 1', () => {
  assert.equal(text(569 * 0.3), '171');
  assert.equal(text(1181.1), '1181');
  assert.equal(text(21.1), '21,1');
  assert.equal(text(26), '26,0');
  assert.equal(text(3.8 * 0.3), '1,1');
  assert.equal(text(0.2 * 0.3), '0,06');
  assert.equal(text(0.1), '0,1');
  assert.equal(text(0.996), '1,0');
  assert.equal(text(0), '0');
});

test('the range is chosen again after rounding', () => {
  assert.deepEqual(declareValue(99.96), { value: 100, decimals: 0 });
  assert.equal(text(99.96), '100');
  assert.equal(text(99.94), '99,9');
  assert.equal(text(9.96), '10,0');
});

test('other decimal choices allowed by art. 115', () => {
  const ints = { from100: 0, from10: 0, from1: 2, below1: 2 };
  assert.equal(formatDeclared(declareValue(26.4, ints)), '26');
  assert.equal(formatDeclared(declareValue(1.14, ints)), '1,14');
  assert.throws(() => declareValue(-1));
});

test('plain numbers use a decimal comma', () => {
  assert.equal(formatPlain(50), '50');
  assert.equal(formatPlain(12.5), '12,5');
});

test('servings per package: whole number, "aprox." when not exact', () => {
  assert.deepEqual(servingsPerPackage(150, 30), { exact: 5, count: 5, approx: false, text: '5' });
  assert.equal(servingsPerPackage(70, 30).text, 'aprox. 2'); // 2.33, rounded down
  assert.equal(servingsPerPackage(50, 30).text, 'aprox. 2'); // 1.67, rounded up
  assert.equal(servingsPerPackage(75, 30).text, 'aprox. 3'); // 2.5 rounds up
  assert.equal(servingsPerPackage(20, 30).text, 'aprox. 1'); // never less than 1
});

test('servings per package: legal minimum marks only values rounded up', () => {
  assert.equal(servingsPerPackage(70, 30, 'when_rounded_up').text, '2');
  assert.equal(servingsPerPackage(50, 30, 'when_rounded_up').text, 'aprox. 2');
});
