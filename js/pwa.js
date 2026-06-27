// ====== PWA：Service Worker 注册与静默版本更新 ======

function triggerServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then(reg => {
    if (reg) reg.update();
  }).catch(err => {
    console.warn('Service Worker 更新检查失败', err);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const v = (typeof APP_VERSION === 'string' && APP_VERSION) ? APP_VERSION : '';
    navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(v))
      .then(() => triggerServiceWorkerUpdate())
      .catch(err => {
        console.warn('Service Worker 注册失败', err);
      });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    triggerServiceWorkerUpdate();
  });
}

registerServiceWorker();
