const CACHE_VERSION = '0.0.61';
const PRECACHE = 'stars-bank-precache-' + CACHE_VERSION;
const RUNTIME = 'stars-bank-runtime-' + CACHE_VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/data.js',
  '/js/firebase-loader.js',
  '/js/sync.js',
  '/js/history.js',
  '/js/catalog.js',
  '/js/ui.js',
  '/js/auth.js',
  '/js/pwa.js',
  '/manifest.webmanifest',
  '/icons/star.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/muscle.svg',
  '/icons/plus.svg',
  '/icons/gift.svg',
  '/icons/calendar.svg',
  '/icons/user.svg',
  '/icons/edit.svg',
  '/icons/lock.svg',
  '/icons/shake.svg',
  '/icons/caution.svg',
  '/icons/home.svg',
  '/icons/clear.svg',
  '/icons/clear-format.svg',
  '/icons/inbox.svg',
  '/icons/rocket.svg',
  '/icons/transaction-order.svg',
  '/icons/undo.svg'
];

const CDN_ORIGINS = [
  'https://www.gstatic.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

function stripQuery(url) {
  const u = new URL(url);
  u.search = '';
  return u.href;
}

async function matchCache(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  if (request.url.startsWith(self.location.origin)) {
    return caches.match(stripQuery(request.url));
  }
  return null;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== PRECACHE && k !== RUNTIME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.pathname === '/sw.js') return;

  if (CDN_ORIGINS.some(origin => url.origin === origin)) {
    event.respondWith(
      caches.open(RUNTIME).then(async cache => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then(res => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/data.js' || url.pathname === '/styles.css' || url.pathname.startsWith('/js/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PRECACHE).then(c => c.put(stripQuery(event.request.url), copy));
          }
          return res;
        })
        .catch(() => matchCache(event.request))
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(PRECACHE).then(c => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    matchCache(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (!res.ok) return res;
        const copy = res.clone();
        caches.open(PRECACHE).then(c => c.put(event.request, copy));
        return res;
      });
    })
  );
});
