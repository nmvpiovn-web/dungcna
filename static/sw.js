// Service Worker for Tieng Anh Co Dung PWA
// Architecture: Strict Network-Only for dynamic data/APIs; Cache-First for static immutable assets;
// Network-First (with offline fallback) for navigations.

const CACHE_NAME = 'tienganh-academic-v6';

// App shell precache (offline fallback + icons + manifest). Individual failures must not break install.
const PRECACHE_URLS = [
  '/offline/',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

// Clean up all obsolete caches from previous deployments (including tienganh-pro-v5)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Purging obsolete cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. STRICT PRIVACY & FAIL-CLOSED:
  // NEVER intercept or persist any API endpoints, auth tokens, or private user requests in CacheStorage
  if (url.pathname.startsWith('/api/') || event.request.headers.has('Authorization')) {
    // Direct network only
    return;
  }

  // 2. Navigation requests: Network-First so deployments reflect immediately,
  //    with cache + offline fallback when the device is offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => networkResponse)
        .catch(() =>
          caches.match(event.request).then(
            (cachedPage) => cachedPage || caches.match('/offline/')
          )
        )
    );
    return;
  }

  // 3. Static Assets Only: Strictly restrict caching to recognized immutable media & bundle assets
  const isStaticAsset = /\.(css|js|woff2?|png|jpe?g|gif|svg|ico|webp)$/i.test(url.pathname);
  if (!isStaticAsset) {
    return;
  }

  // Cache-First with Network fallback for static assets only
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          // Double check URL does not touch /api/
          if (!url.pathname.startsWith('/api/')) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
        }
        return networkResponse;
      });
    })
  );
});

// PWA Background Push Event Listener
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Thông Báo Mới', body: event.data.text() };
    }
  }

  const title = data.title || 'Tiếng Anh Cô Dung';
  const options = {
    body: data.body || 'Bạn có thông báo mới trong hệ thống.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      url: data.url || '/cpanel/notifications',
      referenceId: data.referenceId
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// PWA Notification Click Handler (Deep Link navigation)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/cpanel/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Message Listener for Leader in-app push simulation (SHOW_LEADER_NOTIFICATION)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_LEADER_NOTIFICATION') {
    const payload = event.data.payload || {};
    const title = payload.title || 'Báo Cáo Leader';
    const options = {
      body: payload.body || 'Cập nhật lịch học và điểm danh mới.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: {
        url: payload.url || '/admin?tab=leader_notifications'
      }
    };
    self.registration.showNotification(title, options);
  }
});
