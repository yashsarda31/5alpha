/* Alpha Nova service worker.
 * - Hashed /assets/* files are cached forever (immutable filenames).
 * - Navigations are network-first with the cached shell as an offline fallback,
 *   so deploys are picked up immediately and the app still opens offline.
 * - /api/* is never touched: market data and auth must always be live.
 */
const CACHE = 'alphanova-v5';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/assets/')) {
    // Content-hashed: cache-first, populate on miss.
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      }))
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    // Network-first so new deploys win; cached shell only when offline.
    event.respondWith(
      fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/'))
    );
  }
});

/* Web Push: server-sent signal alerts arrive here even when the app is closed.
 * Payload: { title, body, tag, url } — tag makes the tray replace duplicates. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON push */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Alpha Nova', {
      body: data.body || 'New market signal',
      tag: data.tag || 'alphanova-signal',
      icon: '/icons/icon-192-v4.png',
      badge: '/icons/icon-192-v4.png',
      data: { url: data.url || '/signals' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/signals';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
