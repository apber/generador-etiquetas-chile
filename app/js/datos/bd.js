// Copia local en el dispositivo (IndexedDB): un almacén clave → valor. Guarda objetos, textos y archivos (Blob).
const NOMBRE = 'etiquetas-app';
let abierta = null;

function abrir() {
  if (abierta) return abierta;
  abierta = new Promise((ok, mal) => {
    const r = indexedDB.open(NOMBRE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  return abierta;
}

async function op(modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const tx = db.transaction('kv', modo);
    const st = tx.objectStore('kv');
    const r = fn(st);
    tx.oncomplete = () => ok(r?.result);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

export const bd = {
  leer: (k) => op('readonly', (s) => s.get(k)),
  guardar: (k, v) => op('readwrite', (s) => s.put(v, k)),
  borrar: (k) => op('readwrite', (s) => s.delete(k)),
  /** Claves que empiezan con el prefijo. */
  async claves(prefijo = '') {
    const todas = await op('readonly', (s) => s.getAllKeys());
    return todas.filter((k) => String(k).startsWith(prefijo));
  },
  /** Varios valores por prefijo: [[clave, valor]]. */
  async todos(prefijo) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const out = [];
      const rango = IDBKeyRange.bound(prefijo, `${prefijo}￿`);
      const r = db.transaction('kv').objectStore('kv').openCursor(rango);
      r.onsuccess = () => { const c = r.result; if (!c) { ok(out); return; } out.push([c.key, c.value]); c.continue(); };
      r.onerror = () => mal(r.error);
    });
  },
  async vaciar() { await op('readwrite', (s) => s.clear()); },
};
