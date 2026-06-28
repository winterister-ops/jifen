const CACHE_VERSION = '0.0.98';
const PRECACHE = 'stars-bank-precache-' + CACHE_VERSION;
const RUNTIME = 'stars-bank-runtime-' + CACHE_VERSION;
const FIREBASE_SDK_VERSION = '10.12.2';
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles.css',
  '/data.js',
  '/js/firebase-loader.js',
  '/js/sync.js',
  '/js/firestore-sync.js',
  '/js/history.js',
  '/js/catalog.js',
  '/js/ui.js',
  '/js/onboarding.js',
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
  '/icons/caution.svg',
  '/icons/home.svg',
  '/icons/clear.svg',
  '/icons/clear-format.svg',
  '/icons/inbox.svg',
  '/icons/rocket.svg',
  '/icons/transaction-order.svg',
  '/icons/undo.svg'
];

const AUTH_SDK_URLS = [
  FIREBASE_CDN + '/firebase-app-compat.js',
  FIREBASE_CDN + '/firebase-auth-compat.js'
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

// 缓存优先：命中立即返回，后台静默刷新缓存（stale-while-revalidate）
async function cacheFirstRevalidate(request, cacheKey) {
  const cache = await caches.open(PRECACHE);
  const key = cacheKey || stripQuery(request.url);
  const cached = await cache.match(key) || await cache.match(request);
  const revalidate = fetch(request).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  }).catch(() => null);
  if (cached) {
    revalidate;
    return cached;
  }
  const network = await revalidate;
  if (network) return network;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function networkFirst(request) {
  const cache = await caches.open(PRECACHE);
  const key = stripQuery(request.url);
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(request, res.clone());
      cache.put(key, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match(key);
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE).then(cache => {
      const appShell = cache.addAll(PRECACHE_URLS);
      const authSdk = cache.addAll(AUTH_SDK_URLS)
        .catch(err => console.warn('Firebase Auth SDK 预缓存失败', err));
      return Promise.all([appShell, authSdk]);
    })
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
    event.respondWith(url.search ? networkFirst(event.request) : cacheFirstRevalidate(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(cacheFirstRevalidate(event.request, '/index.html'));
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
