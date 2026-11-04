// Readings waiting for the normal reader, with their photos (IndexedDB: photos are too big for localStorage).
// If this browser refuses IndexedDB (private window), the queue lives only while the page is open.

const DB = 'lectura';
const STORE = 'queue';
let memory = null;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  if (memory) return fn(null);
  let db;
  try {
    db = await open();
  } catch {
    memory = new Map();
    return fn(null);
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const queueStore = {
  async all() {
    const items = await run('readonly', (s) => (s ? s.getAll() : [...memory.values()]));
    const key = (x) => x.order ?? Date.parse(x.createdAt) * 1000;
    return [...items].sort((a, b) => key(a) - key(b));
  },
  put(item) {
    return run('readwrite', (s) => (s ? s.put(item) : memory.set(item.id, item)));
  },
  remove(id) {
    return run('readwrite', (s) => (s ? s.delete(id) : memory.delete(id)));
  },
  get persistent() { return !memory; },
};
