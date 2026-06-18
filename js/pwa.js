// ====== PWA：Service Worker 注册与安装提示 ======

let deferredInstallPrompt = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=0.0.46').catch(err => {
      console.warn('Service Worker 注册失败', err);
    });
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
