import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcaDeModelo, marcaImpresoraDe, enlacePlayStore, MARCAS_IMPRESORA } from '../app/js/impresora-marcas.js';

test('marca del teléfono desde el modelo', () => {
  assert.equal(marcaDeModelo('SM-A245M'), 'samsung');
  assert.equal(marcaDeModelo('Galaxy A15'), 'samsung');
  assert.equal(marcaDeModelo('2201117TG'), 'xiaomi');
  assert.equal(marcaDeModelo('23129RAA4G'), 'xiaomi');
  assert.equal(marcaDeModelo('M2101K6G'), 'xiaomi');
  assert.equal(marcaDeModelo('Redmi Note 13'), 'xiaomi');
  assert.equal(marcaDeModelo('POCO X6 Pro'), 'xiaomi');
  assert.equal(marcaDeModelo('Pixel 8'), null);
  assert.equal(marcaDeModelo('moto g54 5G'), null);
  assert.equal(marcaDeModelo('CPH2449'), null);
  assert.equal(marcaDeModelo(''), null);
});

test('marca del teléfono desde el texto del navegador si no hay modelo', () => {
  assert.equal(marcaDeModelo('', 'Mozilla/5.0 (Linux; Android 12; SM-A125M) AppleWebKit/537.36'), 'samsung');
  assert.equal(marcaDeModelo('', 'Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36'), 'xiaomi');
  assert.equal(marcaDeModelo('', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'), null);
});

test('marca de la impresora guardada en app.json', () => {
  assert.equal(marcaImpresoraDe({ marcaImpresora: 'epson' }), 'epson');
  assert.equal(marcaImpresoraDe({ marcaImpresora: 'Epson ' }), 'epson');
  assert.equal(marcaImpresoraDe({ marcaImpresora: 'brother' }), 'otra');
  assert.equal(marcaImpresoraDe({}), null);
  assert.equal(marcaImpresoraDe(null), null);
});

test('enlace a Play Store de cada complemento', () => {
  for (const m of Object.values(MARCAS_IMPRESORA)) {
    assert.match(enlacePlayStore(m.paquete), /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[a-z.]+$/);
  }
});
