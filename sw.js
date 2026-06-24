// VAMIT-5 Portal Service Worker v7 — fix Android logo + brand prefix
const VERSION = 'vamit5-v7';
// Direktan JPG URL bez Cloudinary transforms (uvek dostupan)
const LOGO_URL = 'https://res.cloudinary.com/dqqljgtna/image/upload/v1778337005/VAMIT-5_k3xlfh.jpg';

self.addEventListener('install', (e) => {
  console.log('[SW] install v7');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] activate v7');
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
  ]));
});

// Network-first fetch (preskoči Supabase)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('supabase.co') || req.url.includes('/auth/')) return;

  e.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(VERSION).then(c => c.put(req, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || new Response('Offline', { status: 503 })))
  );
});

// ============================================================
// PUSH NOTIFICATIONS — iOS + Android, sa brand prefix + logo
// ============================================================
self.addEventListener('push', (e) => {
  console.log('[SW] push event');

  let data = {};
  try {
    if (e.data) {
      const txt = e.data.text();
      try { data = JSON.parse(txt); } catch { data = { title: 'VAMIT-5', body: txt }; }
    }
  } catch (err) {
    console.error('[SW] push parse err:', err);
    data = { title: 'VAMIT-5', body: 'Nova aktivnost' };
  }

  // Brand prefix u title-u tako da atleta zna od koga je notifikacija
  const rawTitle = data.title || 'Notifikacija';
  const title = rawTitle.startsWith('VAMIT-5') ? rawTitle : 'VAMIT-5 · ' + rawTitle;

  // VAZNO: NE postavljamo 'badge' jer Android trazi monochrome 24x24 PNG;
  // bilo koja druga slika se prikazuje kao bela kutija. Ako ga ne postavimo,
  // Android koristi 'icon' kao fallback.
  const options = {
    body: data.body || '',
    icon: LOGO_URL,
    tag: data.tag || 'vamit5-' + Date.now(),
    data: { url: data.action_url || '/#/dashboard' },
    vibrate: [200, 100, 200],
    requireInteraction: data.priority === 'celebration',
    renotify: true,
    silent: false
  };

  e.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] notification shown:', title))
      .catch(err => console.error('[SW] showNotification fail:', err))
  );
});

// Klik na notifikaciju → otvori PWA na zadatoj ruti
self.addEventListener('notificationclick', (e) => {
  console.log('[SW] notif click');
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#/dashboard';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes(self.registration.scope) && 'focus' in c) {
          try { c.navigate(url); } catch (e) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (e) => {
  console.log('[SW] pushsubscriptionchange');
});
