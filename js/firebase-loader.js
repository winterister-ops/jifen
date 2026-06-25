// ====== Firebase SDK 按需加载（database / firestore 在登录后加载） ======

const FIREBASE_SDK_VERSION = '10.12.2';
const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION;

let firebaseDatabaseLoadPromise = null;
let firebaseFirestoreLoadPromise = null;

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
    return Promise.resolve();
  }
  if (!firebaseFirestoreLoadPromise) {
    firebaseFirestoreLoadPromise = loadFirebaseScript(
      FIREBASE_CDN + '/firebase-firestore-compat.js'
    ).catch(err => {
      firebaseFirestoreLoadPromise = null;
      throw err;
    });
  }
  return firebaseFirestoreLoadPromise;
}
