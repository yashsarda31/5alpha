/* Alpha Nova service worker.
 * - Hashed /assets/* files are cached forever (immutable filenames).
 * - Navigations are network-first with the cached shell as an offline fallback,
 *   so deploys are picked up immediately and the app still opens offline.
 * - /api/* is never touched: market data and auth must always be live.
 */
// Rotate the cache to discard shells contaminated by older navigation caching.
const CACHE = 'alphanova-next-v3';

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
      caches.match(event.request).catch(() => undefined).then((hit) => hit || fetch(event.request).then((res) => {
        // SPA fallbacks can return HTML with 200 for obsolete chunk URLs.
        // Never retain that response as executable code.
        if (res.ok && !res.headers.get('content-type')?.includes('text/html')) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {}));
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
        // Only known app entry documents may become the offline shell. Shared
        // reports, error pages and JSON downloads are not interchangeable HTML.
        if (['/', '/dashboard', '/dashboard/'].includes(url.pathname)
            && res.ok && !res.redirected
            && res.headers.get('content-type')?.includes('text/html')) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {}));
        }
        return res;
      }).catch(() => caches.open(CACHE).then((c) => c.match('/')))
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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
