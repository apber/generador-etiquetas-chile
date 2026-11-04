// Service worker of the test page: only to show the "reading ready" notifications on Android
// (Chrome there does not allow new Notification() from the page). It does not cache anything.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const page = wins.find((w) => w.url.includes('/lectura/'));
    if (page) return page.focus();
    return self.clients.openWindow('./');
  })());
});
