// Pool Intelligence Pro — Service Worker (offline fallback)
const CACHE_NAME = 'pool-intel-v1';
const OFFLINE_URL = '/offline.html';

// Install: cache the offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to offline page for navigation requests
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});

// ============================================================
// PUSH NOTIFICATIONS — ETAPA 17
// ============================================================

// Handle push events from server
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = { title: 'Pool Intelligence Pro', body: 'Nova notificação', icon: '/icon-192.svg', url: '/' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: payload.tag || 'pool-intel-alert',
    data: { url: payload.url || '/' },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// Handle notification click — navigate to relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
