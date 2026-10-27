import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitoVerificadorEan13, esEan13Valido } from '../src/ean13.js';

test('calcula el dígito verificador', () => {
  assert.equal(digitoVerificadorEan13('400638133393'), '1');
  assert.equal(digitoVerificadorEan13('200000000001'), '5');
  assert.equal(digitoVerificadorEan13('000000000000'), '0');
});

test('valida códigos completos', () => {
  assert.ok(esEan13Valido('4006381333931'));
  assert.ok(!esEan13Valido('4006381333932'));
  assert.ok(!esEan13Valido('400638133393'));
  assert.ok(!esEan13Valido('40063813339a1'));
});

test('rechaza entradas que no son 12 dígitos', () => {
  assert.throws(() => digitoVerificadorEan13('12345'));
});
