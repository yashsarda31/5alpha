const CACHE = 'alphanova4-v1';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })));
    return;
  }
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).then((response) => {
    caches.open(CACHE).then((cache) => cache.put('/', response.clone()));
    return response;
  }).catch(() => caches.match('/')));
});
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON push */ }
  event.waitUntil(self.registration.showNotification(data.title || 'AlphaNova4', { body: data.body || 'New market signal', tag: data.tag || 'alphanova4-signal', icon: '/favicon.svg', badge: '/favicon.svg', data: { url: data.url || '/signals' } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/signals';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const current = windows.find((windowClient) => 'focus' in windowClient);
    if (current) { current.navigate(url); return current.focus(); }
    return self.clients.openWindow(url);
  }));
});
