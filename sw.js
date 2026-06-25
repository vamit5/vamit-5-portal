// VAMIT-5 Portal Service Worker v11 — push handler bulletproof
const VERSION = 'vamit5-v11';
// Direktan PNG URL (NIKAD ne pucne, fallback ako lokalni icon ne radi)
const LOGO_URL = 'https://res.cloudinary.com/dqqljgtna/image/upload/c_fill,w_192,h_192,q_auto,f_png/v1778337005/VAMIT-5_k3xlfh.jpg';

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
// PUSH NOTIFICATIONS — BULLETPROOF iOS + Android
// 3-koraka fallback: ako icon URL ne radi, pokaze bez ikona;
// ako payload je los, pokaze generic poruku.
// ============================================================
self.addEventListener('push', (e) => {
  console.log('[SW] push event arrived');
  e.waitUntil(handlePush(e));
});

async function handlePush(e) {
  let data = {};
  try {
    if (e.data) {
      const txt = e.data.text();
      console.log('[SW] push raw payload:', txt.slice(0, 200));
      try { data = JSON.parse(txt); } catch { data = { title: 'VAMIT-5', body: txt }; }
    }
  } catch (err) {
    console.error('[SW] push parse err:', err);
    data = { title: 'VAMIT-5', body: 'Nova aktivnost' };
  }

  const rawTitle = data.title || 'Notifikacija';
  const title = rawTitle.startsWith('VAMIT-5') ? rawTitle : 'VAMIT-5 · ' + rawTitle;
  const body = data.body || '';
  const tag = data.tag || ('vamit5-' + Date.now());
  const urlForClick = data.action_url || '/#/dashboard';

  // STEP 1: sa icon-om (best look)
  try {
    await self.registration.showNotification(title, {
      body, icon: LOGO_URL, tag,
      data: { url: urlForClick },
      vibrate: [200, 100, 200],
      requireInteraction: data.priority === 'celebration',
      renotify: true, silent: false
    });
    console.log('[SW] notification OK (with icon):', title);
    return;
  } catch (err1) {
    console.warn('[SW] showNotification fail with icon:', err1);
  }

  // STEP 2: bez icon (fallback)
  try {
    await self.registration.showNotification(title, {
      body, tag, data: { url: urlForClick }, renotify: true
    });
    console.log('[SW] notification OK (no icon)');
    return;
  } catch (err2) {
    console.warn('[SW] showNotification fail no icon:', err2);
  }

  // STEP 3: minimalna poruka (poslednji izbor)
  try {
    await self.registration.showNotification('VAMIT-5', { body: 'Nova aktivnost' });
    console.log('[SW] notification OK (minimal)');
  } catch (err3) {
    console.error('[SW] showNotification COMPLETELY FAILED:', err3);
  }
}

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
