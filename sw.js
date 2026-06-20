// VAMIT-5 Portal Service Worker v3 — NOV LOGO
const VERSION = 'vamit5-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    // Brisemo stare cache-ove da nov logo bude vidljiv
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
  ]));
});

// Network-first sa fallback (online-prvo, offline-keširano)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Preskoci API i Supabase pozive
  if (req.url.includes('supabase.co') || req.url.includes('/auth/')) return;

  e.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(VERSION).then(c => c.put(req, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || new Response('Offline', { status: 503 })))
  );
});

// Push notifications
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = { title: 'VAMIT-5', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'VAMIT-5';
  const options = {
    body: data.body || '',
    icon: 'https://res.cloudinary.com/dqqljgtna/image/upload/v1778337005/VAMIT-5_k3xlfh.jpg',
    badge: 'https://res.cloudinary.com/dqqljgtna/image/upload/v1778337005/VAMIT-5_k3xlfh.jpg',
    data: { url: data.action_url || '/#/dashboard' },
    vibrate: [200, 100, 200],
    requireInteraction: data.priority === 'celebration'
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#/dashboard';
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
