// ====== PWA：Service Worker 注册与版本更新 ======

let refreshingForUpdate = false;

async function fetchServerAppVersion() {
  const res = await fetch('/index.html', { cache: 'no-store' });
  if (!res.ok) return '';
  const html = await res.text();
  const match = html.match(/name="app-version"\s+content="([^"]+)"/);
  return match ? match[1].trim() : '';
}

function promptAppRefresh() {
  if (refreshingForUpdate) return;
  refreshingForUpdate = true;
  refreshAppNow();
}

async function refreshAppNow() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } catch (err) {
      console.warn('Service Worker 更新检查失败', err);
    }
  }
  window.location.reload();
}

async function checkServerVersion() {
  const localVer = getAppVersion();
  if (!localVer) return;
  try {
    const serverVer = await fetchServerAppVersion();
    if (serverVer && serverVer !== localVer) {
      promptAppRefresh();
    }
  } catch (err) {
    console.warn('版本检查失败', err);
  }
}

function watchServiceWorkerUpdates(registration) {
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        promptAppRefresh();
      }
    });
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const v = (typeof APP_VERSION === 'string' && APP_VERSION) ? APP_VERSION : '';
    navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(v))
      .then(registration => {
        watchServiceWorkerUpdates(registration);
        checkServerVersion();
      })
      .catch(err => {
        console.warn('Service Worker 注册失败', err);
      });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update();
      });
    }
    checkServerVersion();
  });
}

registerServiceWorker();
