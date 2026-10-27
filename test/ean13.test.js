import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ean13CheckDigit, isValidEan13 } from '../src/ean13.js';

test('computes the check digit', () => {
  assert.equal(ean13CheckDigit('400638133393'), '1');
  assert.equal(ean13CheckDigit('200000000001'), '5');
  assert.equal(ean13CheckDigit('000000000000'), '0');
});

test('validates full codes', () => {
  assert.ok(isValidEan13('4006381333931'));
  assert.ok(!isValidEan13('4006381333932'));
  assert.ok(!isValidEan13('400638133393'));
  assert.ok(!isValidEan13('40063813339a1'));
});

test('rejects input that is not 12 digits', () => {
  assert.throws(() => ean13CheckDigit('12345'));
});
