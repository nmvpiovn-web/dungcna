const CACHE_NAME = 'tienganh-pro-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.png',
  '/apk_version.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Network first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// PWA Background Push Notification Handler
self.addEventListener('push', (event) => {
  let data = {
    title: 'Tiếng Anh Cô Dung',
    body: 'Bạn có thông báo mới từ hệ thống đào tạo.',
    data: { url: '/admin?tab=leader_notifications' }
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { ...data, body: event.data.text() };
    }
  }

  const title = data.title || 'Tiếng Anh Cô Dung';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon.svg',
    badge: data.badge || '/icon.svg',
    tag: data.tag || `tienganh_notif_${Date.now()}`,
    data: data.data || { url: '/admin?tab=leader_notifications' },
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: data.priority === 'urgent',
    actions: data.actions || [
      { action: 'open', title: '👁️ Xem Chi Tiết' },
      { action: 'close', title: '✖️ Đóng' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// PWA Notification Click Routing
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/admin?tab=leader_notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Client-triggered Notification Bridge (postMessage)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_LEADER_NOTIFICATION') {
    const { title, body, tag, url, priority } = event.data;
    const options = {
      body: body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: tag || `tienganh_leader_${Date.now()}`,
      data: { url: url || '/admin?tab=leader_notifications' },
      vibrate: priority === 'urgent' ? [300, 150, 300, 150, 300] : [200, 100, 200],
      requireInteraction: priority === 'urgent'
    };
    self.registration.showNotification(title || 'Tiếng Anh Cô Dung - Báo Cáo Leader', options);
  }
});
