import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Números de versión (docs/app.md): main va como X.Y.0-beta.N hacia la próxima etiqueta vX.Y; el commit etiquetado, X.Y.0
test('la versión de package.json sigue el esquema de las etiquetas vX.Y', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.match(version, /^0\.\d+\.0(-beta\.\d+)?$/);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
});
