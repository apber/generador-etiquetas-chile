// Lector de .zip de la app (src/zip-read.js): carga inicial de la carpeta de datos desde una copia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { makeZip } from '../lectura/zip.js';
import { readZip, dataFolderFiles } from '../src/zip-read.js';

/** Zip con deflate (como el de Windows o el programa zip). files: [{ name, bytes }]. */
function deflateZip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), data = deflateRawSync(f.bytes), crc = crc32(f.bytes);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034B50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(f.bytes.length, 22); h.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014B50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(f.bytes.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(off, 42);
    parts.push(h, name, data); central.push(c, name);
    off += h.length + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054B50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, e]));
}

const enc = (s) => new TextEncoder().encode(s);

test('reads a deflate zip and a stored zip', async () => {
  const pdf = new Uint8Array(5000).map((_, i) => i % 251);
  const z = deflateZip([{ name: 'company.json', bytes: enc('{"brand":"Demo"}') }, { name: 'etiquetas/a.pdf', bytes: pdf }]);
  const r = await readZip(z);
  assert.deepEqual(r.map((f) => f.name), ['company.json', 'etiquetas/a.pdf']);
  assert.deepEqual(r[1].bytes, pdf);
  const s = await readZip(makeZip([{ name: 'company.json', data: enc('{}') }]));
  assert.equal(new TextDecoder().decode(s[0].bytes), '{}');
  await assert.rejects(readZip(enc('no soy un zip')), /zip/);
});

test('the data folder: top folder removed, system files left out, company.json required', async () => {
  const z = deflateZip([
    { name: 'Etiquetas/company.json', bytes: enc('{"brand":"Demo"}') },
    { name: 'Etiquetas/products/x.json', bytes: enc('{"id":"x"}') },
    { name: 'Etiquetas/marca/logo.png', bytes: new Uint8Array([1, 2, 3]) },
    { name: '__MACOSX/Etiquetas/._company.json', bytes: enc('x') },
  ]);
  const a = dataFolderFiles(await readZip(z));
  assert.deepEqual(a.map((f) => f.ruta), ['company.json', 'products/x.json', 'marca/logo.png']);
  assert.equal(a[0].contenido, '{"brand":"Demo"}');
  assert.equal(a[2].contenido.type, 'image/png');
  assert.throws(() => dataFolderFiles([{ name: 'products/x.json', bytes: enc('{}') }]), /sin_company/);
});
