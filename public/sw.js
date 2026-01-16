// Escher Financial Manager - Service Worker
// Handles caching and Push Notifications

self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: data.icon || '/icon-512.png',
            badge: '/icon-512.png',
            data: {
                url: data.url || '/'
            },
            tag: data.tag || 'escher-notification',
            renotify: true
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    } catch (err) {
        console.error('Push handling error:', err);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data.url;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If the app is already open, navigate it
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('navigate' in client) {
                    return client.navigate(targetUrl).then(c => c.focus());
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// Basic caching strategy
const CACHE_NAME = 'escher-static-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Standard network-first approach for index.html (to handle URL params)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/'))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
