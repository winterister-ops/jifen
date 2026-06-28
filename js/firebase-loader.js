// ====== Firebase SDK / 页面脚本按需加载（database 仅在显式开启 RTDB 迁移时使用） ======

const FIREBASE_SDK_VERSION = '10.12.2';
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION;
const FIRESTORE_SDK_URL = FIREBASE_CDN + '/firebase-firestore-compat.js';

let firebaseDatabaseLoadPromise = null;
let firebaseFirestoreLoadPromise = null;
let firestorePersistencePromise = null;
const appScriptLoadPromises = {};

function ensureFirestorePersistence() {
  if (firestorePersistencePromise) return firestorePersistencePromise;
  if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function') {
    return Promise.resolve();
  }
  firestorePersistencePromise = (() => {
    const fs = firebase.firestore();
    if (!fs || typeof fs.enablePersistence !== 'function') return Promise.resolve();
    return fs.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        const code = err && err.code;
        if (code === 'failed-precondition') {
          console.warn('Firestore 持久化：其他标签页已开启');
        } else if (code === 'unimplemented') {
          console.warn('Firestore 持久化：当前环境不支持');
        } else {
          console.warn('Firestore 持久化失败', err);
        }
      })
      .then(() => undefined);
  })();
  return firestorePersistencePromise;
}

function loadFirebaseScript(src) {
  const existing = document.querySelector('script[src="' + src + '"]');
  if (existing) {
    if (existing.dataset.loaded === '1') return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

function appRuntimeCacheName() {
  const v = (typeof APP_VERSION === 'string' && APP_VERSION) ? APP_VERSION : 'dev';
  return 'stars-bank-runtime-' + v;
}

function precacheFirestoreSdk() {
  if (typeof caches === 'undefined' || !FIRESTORE_SDK_URL) return Promise.resolve();
  return caches.open(appRuntimeCacheName())
    .then(cache => cache.add(FIRESTORE_SDK_URL))
    .catch(err => {
      console.warn('Firestore SDK 运行时缓存失败', err);
    });
}

function appScriptUrl(path) {
  const v = (typeof APP_VERSION === 'string' && APP_VERSION) ? APP_VERSION : '';
  return path + (v ? '?v=' + encodeURIComponent(v) : '');
}

function ensureAppScript(path) {
  if (appScriptLoadPromises[path]) return appScriptLoadPromises[path];
  appScriptLoadPromises[path] = loadFirebaseScript(appScriptUrl(path)).catch(err => {
    appScriptLoadPromises[path] = null;
    throw err;
  });
  return appScriptLoadPromises[path];
}

function ensureHistoryReady() {
  if (typeof renderHistory === 'function') return Promise.resolve();
  return ensureAppScript('js/history.js');
}

function ensureOnboardingReady() {
  if (typeof enterAppAfterCloudReady === 'function') return Promise.resolve();
  return ensureAppScript('js/onboarding.js');
}

function ensureFirebaseDatabase() {
  if (typeof firebase !== 'undefined' && typeof firebase.database === 'function') {
    return Promise.resolve();
  }
  if (!firebaseDatabaseLoadPromise) {
    firebaseDatabaseLoadPromise = loadFirebaseScript(
      FIREBASE_CDN + '/firebase-database-compat.js'
    ).catch(err => {
      firebaseDatabaseLoadPromise = null;
      throw err;
    });
  }
  return firebaseDatabaseLoadPromise;
}

function ensureFirebaseFirestore() {
  if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
    return ensureFirestorePersistence();
  }
  if (!firebaseFirestoreLoadPromise) {
    firebaseFirestoreLoadPromise = loadFirebaseScript(FIRESTORE_SDK_URL).then(() => {
      precacheFirestoreSdk();
      return ensureFirestorePersistence();
    }).catch(err => {
      firebaseFirestoreLoadPromise = null;
      throw err;
    });
  }
  return firebaseFirestoreLoadPromise;
}
