// Service Worker for Tieng Anh Co Dung PWA
// Architecture: Strict Network-Only for dynamic data/APIs; Cache-First for static immutable assets;
// Network-First (with offline fallback) for navigations.

const CACHE_NAME = 'tienganh-academic-v7';
const QUIZ_CACHE_NAME = 'tienganh-quiz-public-v1';
const QUIZ_QUEUE_DB = 'tienganh-quiz-offline-v1';

// App shell precache (offline fallback + icons + manifest). Individual failures must not break install.
const PRECACHE_URLS = [
  '/offline/',
  '/quiz-menu/',
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
          if (name !== CACHE_NAME && name !== QUIZ_CACHE_NAME) {
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

  // Public Quiz Menu catalog/details contain no answer keys and no personal data.
  // Cache only anonymous GETs; staff/mine/include_answers and attempt endpoints stay network-only.
  const isPublicQuizRead = url.origin === self.location.origin
    && /^\/api\/quiz-menu(?:\/[^/]+)?$/.test(url.pathname)
    && !url.searchParams.has('mine')
    && !url.searchParams.has('include_answers')
    && !event.request.headers.has('Authorization');
  if (isPublicQuizRead) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(QUIZ_CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response(
          JSON.stringify({ success: false, error: 'OfflineCacheMiss' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )))
    );
    return;
  }

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

function openQuizQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUIZ_QUEUE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'queueId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function flushGuestQuizQueue() {
  const db = await openQuizQueue();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction('attempts', 'readonly').objectStore('attempts').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  for (const item of items) {
    // Authenticated attempts are flushed by the foreground app so auth tokens never enter IndexedDB.
    if (!item.attemptToken) continue;
    try {
      const response = await fetch(`/api/quiz-menu/${encodeURIComponent(item.quizId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: item.action || 'submit', attempt_id: item.attemptId, attempt_token: item.attemptToken, answers: item.answers, deferred_question_ids: item.deferredQuestionIds || [] })
      });
      if (response.ok || response.status === 409) {
        await new Promise((resolve, reject) => {
          const request = db.transaction('attempts', 'readwrite').objectStore('attempts').delete(item.queueId);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    } catch {}
  }
  db.close();
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'quiz-attempt-sync') event.waitUntil(flushGuestQuizQueue());
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
