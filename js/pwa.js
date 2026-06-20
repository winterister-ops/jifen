// ====== PWA：Service Worker 注册与安装提示 ======

let deferredInstallPrompt = null;
let updatePromptShown = false;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function getLocalAppVersion() {
  const meta = document.querySelector('meta[name="app-version"]');
  const fromMeta = meta && meta.getAttribute('content');
  if (fromMeta && fromMeta.trim()) return fromMeta.trim();
  if (typeof APP_VERSION === 'string' && APP_VERSION) return APP_VERSION;
  return '';
}

async function fetchServerAppVersion() {
  const res = await fetch('/index.html', { cache: 'no-store' });
  if (!res.ok) return '';
  const html = await res.text();
  const match = html.match(/name="app-version"\s+content="([^"]+)"/);
  return match ? match[1].trim() : '';
}

function hideUpdateModal() {
  const modal = document.getElementById('updateModal');
  if (modal) modal.classList.remove('show');
  updatePromptShown = false;
}

function showUpdateModal(reason) {
  const titleEl = document.getElementById('updateModalTitle');
  const msgEl = document.getElementById('updateModalMsg');
  const isServer = reason === 'server';
  if (titleEl) titleEl.textContent = isServer ? '发现新版本' : '应用已更新';
  if (msgEl) {
    msgEl.textContent = isServer
      ? '发现新版本，需要刷新以加载最新内容。'
      : '应用已更新，需要刷新以加载最新内容。';
  }
  const modal = document.getElementById('updateModal');
  if (modal) modal.classList.add('show');
}

function confirmAppRefresh() {
  const modal = document.getElementById('updateModal');
  if (modal) modal.classList.remove('show');
  refreshAppNow();
}

function promptAppRefresh(reason) {
  if (updatePromptShown) return;
  updatePromptShown = true;
  showUpdateModal(reason);
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
  const localVer = getLocalAppVersion();
  if (!localVer) return;
  try {
    const serverVer = await fetchServerAppVersion();
    if (serverVer && serverVer !== localVer) {
      promptAppRefresh('server');
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
        promptAppRefresh('sw');
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

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updatePromptShown) window.location.reload();
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

function updatePwaInstallUI() {
  const item = document.getElementById('pwaInstallItem');
  const iosHint = document.getElementById('pwaIosHint');
  const installed = document.getElementById('pwaInstalledItem');
  if (!item && !iosHint && !installed) return;

  if (isStandalone()) {
    if (item) item.style.display = 'none';
    if (iosHint) iosHint.style.display = 'none';
    if (installed) installed.style.display = '';
    return;
  }
  if (installed) installed.style.display = 'none';

  if (deferredInstallPrompt) {
    if (item) item.style.display = '';
    if (iosHint) iosHint.style.display = 'none';
    return;
  }

  if (typeof isIOS === 'function' && isIOS()) {
    if (item) item.style.display = 'none';
    if (iosHint) iosHint.style.display = '';
    return;
  }

  if (item) item.style.display = 'none';
  if (iosHint) iosHint.style.display = 'none';
}

async function promptInstallApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  updatePwaInstallUI();
  if (outcome === 'accepted' && typeof toast === 'function') {
    toast('已添加到主屏幕', 'success');
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updatePwaInstallUI();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updatePwaInstallUI();
});

registerServiceWorker();
