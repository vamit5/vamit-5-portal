// VAMIT-5 Portal Service Worker v6 — push bulletproof iOS + Android
const VERSION = 'vamit5-v6';
const LOGO_URL = 'https://res.cloudinary.com/dqqljgtna/image/upload/c_fill,w_192,h_192,q_auto,f_png/v1778337005/VAMIT-5_k3xlfh.jpg';

self.addEventListener('install', (e) => {
  console.log('[SW] install v6');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[SW] activate v6');
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
// PUSH NOTIFICATIONS — iOS + Android compatible
// ============================================================
self.addEventListener('push', (e) => {
  console.log('[SW] push event, hasData:', !!e.data);

  let data = {};
  try {
    if (e.data) {
      const txt = e.data.text();
      console.log('[SW] push raw:', txt);
      try { data = JSON.parse(txt); } catch { data = { title: 'VAMIT-5', body: txt }; }
    }
  } catch (err) {
    console.error('[SW] push parse err:', err);
    data = { title: 'VAMIT-5', body: 'Nova aktivnost' };
  }

  const title = data.title || 'VAMIT-5';
  // iOS PWA notifications require: title + body + tag + at minimum icon
  const options = {
    body: data.body || '',
    icon: LOGO_URL,
    badge: LOGO_URL,
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
          try { c.navigate(url); } catch(e){}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Resubscribe ako push subscription istekne (Chrome+Android)
self.addEventListener('pushsubscriptionchange', (e) => {
  console.log('[SW] pushsubscriptionchange');
  // Browser ce auto resubscribe-ovati u nekim slucajevima
});
