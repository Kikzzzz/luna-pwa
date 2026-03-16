// ============================================================
// LUNA SERVICE WORKER
// Strategy: Cache First for static assets, Network First for API
// ============================================================

const CACHE_NAME = 'luna-v1.3.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/supabase-config.js',
  './js/cycle-engine.js',
  './js/fasting.js',
  './js/calendar.js',
  './js/analysis.js',
  './js/notifications.js',
  './js/settings.js',
  './js/app.js',
  './manifest.json',
  './offline.html',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── Install: Pre-cache static assets ───────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: Clean old caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Stale-While-Revalidate for static, skip for API ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase API requests (handled by client)
  if (url.hostname.includes('supabase.co')) return;

  // Skip chrome-extension and non-http
  if (!url.protocol.startsWith('http')) return;

  // For navigation requests: try network, fall back to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || caches.match('./offline.html')
          )
        )
    );
    return;
  }

  // Stale-While-Revalidate for all other static assets
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => null);

        return cached || networkFetch || new Response('Offline', { status: 503 });
      })
    )
  );
});

// ── Background Sync ──────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'luna-sync') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
}

// ── Push Notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || 'Luna';
  const opts = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'luna-notification',
    data: data.url ? { url: data.url } : {},
    vibrate: [100, 50, 100],
    ...data.opts,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ── Show notification (from main thread message) ──────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, opts } = event.data;
    self.registration.showNotification(title, { body, ...opts });
  }
});
