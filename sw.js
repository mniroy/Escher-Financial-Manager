const CACHE_NAME = 'escher-cache-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn-icons-png.flaticon.com/512/1247/1247833.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Handle External CDNs (esm.sh, tailwind, fonts, icons)
  // We use a Stale-While-Revalidate strategy here
  if (url.origin !== self.location.origin) {
     event.respondWith(
       caches.match(event.request).then((cachedResponse) => {
         const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'cors' && networkResponse.type !== 'basic' && networkResponse.type !== 'opaque')) {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            return networkResponse;
         }).catch(err => console.log('Fetch failed for external asset', err));

         return cachedResponse || fetchPromise;
       })
     );
     return;
  }

  // 2. Handle Local Assets
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html');
      })
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});