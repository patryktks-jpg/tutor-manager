const CACHE_NAME = 'tutor-manager-cache-v2.3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never intercept Google Script or external APIs
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate' || event.request.url.endsWith('index.html');

  if (isNavigation) {
    // PUNKT 6: NETWORK-FIRST for HTML navigation!
    // Ensures iPhone ALWAYS gets new updates immediately when online,
    // while seamlessly falling back to cache when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for hashed static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          if (
            response &&
            response.status === 200 &&
            event.request.method === 'GET' &&
            !event.request.url.startsWith('chrome-extension')
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
      );
    })
  );
});
