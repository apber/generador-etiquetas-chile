// Funciona sin internet: guarda los archivos de la app la primera vez que se usan (la caché lleva la versión de la
// publicación: al publicar otra, se empieza de nuevo). Las llamadas al servidor y a Microsoft no pasan por aquí.
const CACHE = 'etiquetas-local';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './estilos.css', './textos.js', './entorno.js', './js/main.js']).catch(() => null)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const guardado = await c.match(e.request, { ignoreSearch: true });
    if (guardado) return guardado;
    const r = await fetch(e.request);
    if (r.ok) c.put(e.request, r.clone());
    return r;
  })());
});
