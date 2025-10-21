// Basic service worker for offline caching (Network falling back to cache)
const CACHE_NAME = 'todo-pwa-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // only cache GETs

  // Try network first, fallback to cache, then to offline page if desired
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      // cache successful 200 GETs
      if (res.status === 200 && req.url.startsWith(self.location.origin)) {
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});

// Focus app when a notification is clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const url = self.location.origin + '/';
    for (const client of allClients) {
      if ('focus' in client) {
        client.focus();
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
