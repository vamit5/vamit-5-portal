// VAMIT-5 Portal Service Worker v10 — notif click absolute URL fix
const VERSION = 'vamit5-v10';
const LOGO_URL = '/vamit5-icon.svg?v=10';

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
  // Normalizuj URL → uvek mora biti apsolutna path-ruta (pocinje sa /)
  let rawUrl = (e.notification.data && e.notification.data.url) || '/#/dashboard';
  if (typeof rawUrl !== 'string') rawUrl = '/#/dashboard';
  // Ako URL pocinje sa # ili je relativan, dodaj / pred njega
  if (rawUrl.startsWith('#')) rawUrl = '/' + rawUrl;
  else if (!rawUrl.startsWith('/') && !rawUrl.startsWith('http')) rawUrl = '/#/' + rawUrl.replace(/^\/+/, '');
  // Sastavi PUNI URL prema scope-u SW-a (ne pravimo relativne pozive jer mogu da prikazu code/JSON)
  const fullUrl = new URL(rawUrl, self.registration.scope).href;
  console.log('[SW] navigate to', fullUrl);

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      // Pokusaj da pronadjes vec otvoreni PWA tab/window
      for (const c of clients) {
        if (c.url.startsWith(self.registration.scope)) {
          try { await c.navigate(fullUrl); } catch (err) { console.warn('navigate fail:', err); }
          return c.focus();
        }
      }
      // Inace otvori nov
      if (self.clients.openWindow) return self.clients.openWindow(fullUrl);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (e) => {
  console.log('[SW] pushsubscriptionchange');
});
