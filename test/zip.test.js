// .zip writer of the test page (lectura/zip.js): several readings downloaded in one file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as nodeCrc32 } from 'node:zlib';
import { makeZip, crc32, uniqueNames } from '../lectura/zip.js';

/** Reads a stored (uncompressed) zip: [{ name, text, crc }] from the central directory. */
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054B50, 'end of central directory');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    assert.equal(v.getUint32(p, true), 0x02014B50, 'central header');
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034B50, 'local header');
    const start = local + 30 + v.getUint16(local + 26, true);
    out.push({ name, text: dec.decode(bytes.subarray(start, start + size)), crc });
    p += 46 + nameLen;
  }
  return out;
}

test('zip: the CRC is the standard one', () => {
  const data = new TextEncoder().encode('{"a":"maní con ñ"}');
  assert.equal(crc32(data), nodeCrc32(data));
  assert.equal(crc32(new Uint8Array()), 0);
});

test('zip: each reading is a file with its name and content; repeated names do not overwrite', () => {
  const files = [
    { name: 'lectura-prod-a_m-2026-11-10-08-05.json', data: '{"x":1}' },
    { name: 'lectura-maní_r.json', data: '{"y":"ñandú"}' },
    { name: 'lectura-prod-a_m-2026-11-10-08-05.json', data: '{"x":2}' },
  ];
  const zip = makeZip(files, new Date(2026, 10, 10, 8, 5, 30));
  const read = readZip(zip);
  assert.deepEqual(read.map((f) => f.name), ['lectura-prod-a_m-2026-11-10-08-05.json', 'lectura-maní_r.json', 'lectura-prod-a_m-2026-11-10-08-05 (2).json']);
  assert.deepEqual(read.map((f) => f.text), ['{"x":1}', '{"y":"ñandú"}', '{"x":2}']);
  for (const f of read) assert.equal(f.crc, nodeCrc32(new TextEncoder().encode(f.text)));
});

test('zip: unique names', () => {
  assert.deepEqual(uniqueNames(['a.json', 'a.json', 'b', 'b', 'a.json']), ['a.json', 'a (2).json', 'b', 'b (2)', 'a (3).json']);
});
