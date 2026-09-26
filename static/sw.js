// Service Worker for Tieng Anh Co Dung PWA
// Architecture: Strict Network-Only for dynamic data/APIs; Cache-First for static immutable assets

const CACHE_NAME = 'tienganh-academic-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
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

  // 2. Navigation requests: Network only to guarantee immediate reflection of deployments
  if (event.request.mode === 'navigate') {
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
