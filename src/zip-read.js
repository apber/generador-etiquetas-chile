// Lee un .zip en el navegador o en Node (sin dependencias): para cargar la carpeta de datos de la empresa desde una
// copia. Entiende archivos guardados sin comprimir (método 0) y comprimidos con deflate (método 8), que es lo que hacen
// Windows, macOS, Android y el programa zip. Usa DecompressionStream('deflate-raw').

const MIME = {
  json: 'application/json', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  svg: 'image/svg+xml', webp: 'image/webp', txt: 'text/plain',
};
export const mimeOf = (name) => MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream';

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Archivos del zip: [{ name, bytes }]. Las carpetas no se devuelven. Error si no es un zip. */
export async function readZip(data) {
  const u = data instanceof Uint8Array ? data : new Uint8Array(data);
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let end = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054B50) { end = i; break; }
  }
  if (end < 0) throw new Error('no es un archivo .zip');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const utf8 = new TextDecoder('utf-8');
  const out = [];
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014B50) throw new Error('zip dañado');
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = utf8.decode(u.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = u.subarray(start, start + csize);
    if (method === 0) out.push({ name, bytes: raw.slice() });
    else if (method === 8) out.push({ name, bytes: await inflate(raw) });
    else throw new Error(`método de compresión ${method} no soportado`);
  }
  return out;
}

/**
 * De los archivos de un zip a los de la carpeta de datos: [{ ruta, contenido (texto o Blob) }].
 * Quita una carpeta de arriba si todo viene dentro de ella y descarta lo del sistema (__MACOSX, .DS_Store, ocultos).
 * Error si no trae company.json.
 */
export function dataFolderFiles(files) {
  let list = files.filter((f) => !f.name.split('/').some((s) => s.startsWith('.') || s === '__MACOSX') && !/Thumbs\.db$/i.test(f.name));
  if (!list.some((f) => f.name === 'company.json')) {
    const tops = new Set(list.map((f) => f.name.split('/')[0]));
    const top = [...tops][0];
    if (tops.size === 1 && list.some((f) => f.name === `${top}/company.json`)) {
      list = list.map((f) => ({ ...f, name: f.name.slice(top.length + 1) }));
    }
  }
  if (!list.some((f) => f.name === 'company.json')) throw new Error('sin_company');
  const text = new TextDecoder('utf-8');
  return list.map((f) => ({
    ruta: f.name,
    contenido: f.name.endsWith('.json') ? text.decode(f.bytes) : new Blob([f.bytes], { type: mimeOf(f.name) }),
  }));
}
