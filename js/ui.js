// ====== 界面渲染与交互 ======

let profilePickAvatar = DEFAULT_CHILD_AVATAR;
let lastDisplayedScore = null;
let scoreAnimFrame = null;
let currentView = 'tasks';
let currentTab = 'earn';
let pendingSpendItem = null;
let catalogActionLockTimer = null;
let earnCooldownRefreshTimer = null;
let lastEarnByTaskId = null; // Map<taskId, last earn ts>

const CATALOG_ACTION_LOCK_MS = 500;

const PRIMARY_VIEWS = ['tasks', 'rewards', 'history', 'settings'];

const VIEW_IDS = {
  home: 'mainView',
  history: 'historyView',
  settings: 'settingsView',
  taskManage: 'taskManageView',
  rewardManage: 'rewardManageView'
};

function bottomNavKey(view) {
  if (view === 'tasks' || view === 'rewards') return view;
  return view;
}

function shouldShowBottomNav(view) {
  return PRIMARY_VIEWS.includes(view);
}

let safeAreaProbe;
let safeAreaBurstTimer;

function lockPageScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function mountSafeAreaProbe() {
  if (safeAreaProbe) safeAreaProbe.remove();
  safeAreaProbe = document.createElement('div');
  safeAreaProbe.setAttribute('aria-hidden', 'true');
  safeAreaProbe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;z-index:-1;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
  document.documentElement.appendChild(safeAreaProbe);
}

function syncSafeAreaInsets(useViewportOffset) {
  if (!safeAreaProbe) mountSafeAreaProbe();
  void safeAreaProbe.offsetHeight;
  const s = getComputedStyle(safeAreaProbe);
  const root = document.documentElement;
  let top = s.paddingTop;
  const bottom = s.paddingBottom;
  if (useViewportOffset && isIOS() && window.visualViewport) {
    const vvTop = Math.round(window.visualViewport.offsetTop);
    const envTop = parseFloat(top) || 0;
    if (vvTop > envTop) top = `${vvTop}px`;
  }
  root.style.setProperty('--safe-top', top);
  root.style.setProperty('--safe-bottom', bottom);
  if (typeof updateHistoryStickyOffset === 'function') updateHistoryStickyOffset();
}

function burstSafeAreaSync() {
  mountSafeAreaProbe();
  clearTimeout(safeAreaBurstTimer);
  [0, 50, 150, 300, 600, 1000].forEach(ms => {
    setTimeout(() => syncSafeAreaInsets(true), ms);
  });
  safeAreaBurstTimer = setTimeout(() => syncSafeAreaInsets(true), 1500);
}

function initSafeAreaSync() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  lockPageScroll();
  syncSafeAreaInsets(false);
  window.addEventListener('orientationchange', burstSafeAreaSync);
  window.addEventListener('resize', () => syncSafeAreaInsets(false));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => syncSafeAreaInsets(false));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') burstSafeAreaSync();
  });
}

function updateBottomNav(view) {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const navKey = bottomNavKey(view);
  const show = shouldShowBottomNav(view);
  nav.classList.toggle('is-hidden', !show);
  nav.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('has-bottom-nav', show);
  document.body.classList.toggle('is-subpage', view === 'taskManage' || view === 'rewardManage');
  lockPageScroll();
  if (show) syncSafeAreaInsets(false);
  nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const active = show && btn.dataset.nav === navKey;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

function isIOS() {
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function ipIcon(name, cls = 'ui-ic') {
  return `<img class="${cls}" src="icons/${name}.svg" alt="">`;
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return '早上好！';
  if (h < 18) return '下午好！';
  return '晚上好！';
}

function renderAppMeta() {
  const el = document.getElementById('appMeta');
  if (!el) return;
  const ver = getAppVersion() || '—';
  const env = getEnvStatus();
  const tagCls = 'env-tag' + (env.text === '离线' ? ' offline' : (env.dev ? ' dev' : ''));
  el.innerHTML = `版本 ${ver} · <span class="${tagCls}">${env.text}</span>`;
}

function startApp() {
  state = loadLocal();
  invalidateLastEarnByTaskId();
  lastDisplayedScore = null;
  initCloud();
  renderAppMeta();
  switchView('tasks');
  render();
  lockPageScroll();
  if (typeof onboardingAfterStartApp === 'function') onboardingAfterStartApp();
}

function renderHeader() {
  const scoreEl = document.getElementById('scoreNum');
  const newScore = state.score;
  if (lastDisplayedScore !== null && lastDisplayedScore !== newScore) {
    animateScoreNum(lastDisplayedScore, newScore);
  } else {
    scoreEl.textContent = newScore;
  }
  lastDisplayedScore = newScore;
  document.getElementById('welcomeName').textContent = state.profile.name;
  document.getElementById('welcomeSub').textContent = greetingText();
  document.getElementById('avatar').textContent = state.profile.avatar;
}

function renderEmojiPicker() {
  const grid = document.getElementById('emojiPicker');
  grid.innerHTML = '';
  AVATAR_OPTIONS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-opt' + (em === profilePickAvatar ? ' selected' : '');
    btn.textContent = em;
    btn.onclick = () => { profilePickAvatar = em; renderEmojiPicker(); };
    grid.appendChild(btn);
  });
}

function openProfileModal() {
  profilePickAvatar = state.profile.avatar;
  document.getElementById('profileNameInput').value = state.profile.name;
  renderEmojiPicker();
  document.getElementById('profileModal').classList.add('show');
  setTimeout(() => document.getElementById('profileNameInput').focus(), 200);
}

function hideProfileModal() {
  document.getElementById('profileModal').classList.remove('show');
}

function markCatalogAction() {
  document.body.classList.add('catalog-action-lock');
  if (catalogActionLockTimer) clearTimeout(catalogActionLockTimer);
  catalogActionLockTimer = setTimeout(() => {
    document.body.classList.remove('catalog-action-lock');
    catalogActionLockTimer = null;
  }, CATALOG_ACTION_LOCK_MS);
}

function resetViewScroll() {
  if (currentView === 'history') {
    const el = document.getElementById('history');
    if (el) { el.scrollTop = 0; return; }
  }
  const viewId = (currentView === 'tasks' || currentView === 'rewards')
    ? 'mainView'
    : VIEW_IDS[currentView];
  if (viewId) {
    const el = document.getElementById(viewId);
    if (el) { el.scrollTop = 0; return; }
  }
  window.scrollTo(0, 0);
}

function applyViewVisibility(view) {
  if (view === 'tasks' || view === 'rewards') {
    Object.keys(VIEW_IDS).forEach(v => {
      const el = document.getElementById(VIEW_IDS[v]);
      if (el) el.style.display = v === 'home' ? '' : 'none';
    });
    return;
  }
  Object.keys(VIEW_IDS).forEach(v => {
    const el = document.getElementById(VIEW_IDS[v]);
    if (el) el.style.display = v === view ? '' : 'none';
  });
}

function switchView(view) {
  if (currentView === 'history' && view !== 'history') exitHistoryEdit();

  if (view === 'tasks' || view === 'rewards') {
    currentView = view;
    applyViewVisibility(view);
    switchTab(view === 'tasks' ? 'earn' : 'spend');
    updateBottomNav(view);
    resetViewScroll();
    return;
  }

  currentView = view;
  applyViewVisibility(view);
  if (view === 'history') {
    exitHistoryEdit();
    focusedDateKey = null;
    resetHistoryAllLimit();
    renderDateHeader();
    renderHistory();
  }
  if (view === 'settings') {
    renderSettings();
    renderAppMeta();
  }
  if (view === 'taskManage') {
    catalogManageType = 'tasks';
    renderCatalogManage();
  }
  if (view === 'rewardManage') {
    catalogManageType = 'rewards';
    renderCatalogManage();
  }
  updateBottomNav(view);
  resetViewScroll();
}

function renderSettings() {
  document.getElementById('setAvatar').textContent = state.profile.avatar;
  document.getElementById('setName').textContent = state.profile.name;
}

function saveProfile() {
  const name = document.getElementById('profileNameInput').value.trim();
  if (!name) {
    toast('请输入昵称', 'error');
    return;
  }
  state.profile = { name: name.slice(0, 12), avatar: profilePickAvatar };
  state.meta = { ...defaultMeta(), ...state.meta, profileUpdatedAt: Date.now(), updatedAt: Date.now() };
  save();
  renderHeader();
  renderSettings();
  hideProfileModal();
}

function switchTab(t) {
  currentTab = t;
  render();
}

function buildLastEarnByTaskId() {
  const map = new Map();
  for (let i = 0; i < state.history.length; i++) {
    const h = state.history[i];
    if (h.delta <= 0 || !h.id) continue;
    const ts = h.ts || 0;
    const prev = map.get(h.id);
    if (!prev || ts > prev) map.set(h.id, ts);
  }
  return map;
}

function getLastEarnByTaskId() {
  if (!lastEarnByTaskId) lastEarnByTaskId = buildLastEarnByTaskId();
  return lastEarnByTaskId;
}

function invalidateLastEarnByTaskId() {
  lastEarnByTaskId = null;
}

function recordLastEarn(taskId, ts) {
  if (!lastEarnByTaskId) lastEarnByTaskId = buildLastEarnByTaskId();
  const prev = lastEarnByTaskId.get(taskId) || 0;
  if (ts >= prev) lastEarnByTaskId.set(taskId, ts);
}

function earnCooldownRemainingMs(taskId, now) {
  const lastTs = getLastEarnByTaskId().get(taskId);
  if (!lastTs) return 0;
  return Math.max(0, EARN_COOLDOWN_MS - ((now ?? Date.now()) - lastTs));
}

function isTaskInEarnCooldown(taskId) {
  return earnCooldownRemainingMs(taskId) > 0;
}

function scheduleEarnCooldownRefresh() {
  if (earnCooldownRefreshTimer) {
    clearTimeout(earnCooldownRefreshTimer);
    earnCooldownRefreshTimer = null;
  }
  if (currentTab !== 'earn') return;

  const earnMap = getLastEarnByTaskId();
  const now = Date.now();
  let minRemaining = Infinity;
  getActiveTasks().forEach((it) => {
    const lastTs = earnMap.get(it.id);
    if (!lastTs) return;
    const remaining = EARN_COOLDOWN_MS - (now - lastTs);
    if (remaining > 0) minRemaining = Math.min(minRemaining, remaining);
  });
  if (minRemaining === Infinity) return;

  earnCooldownRefreshTimer = setTimeout(() => {
    earnCooldownRefreshTimer = null;
    if (currentTab === 'earn' && (currentView === 'tasks' || currentView === 'rewards')) {
      renderCatalog();
      scheduleEarnCooldownRefresh();
    }
  }, minRemaining + 50);
}

function shakeEarnRow(taskId) {
  const row = document.querySelector('.earn-item[data-task-id="' + taskId + '"]');
  if (!row || !row.animate) return;
  row.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
    { duration: 280 }
  );
}

function buildCatalogItemEl(it, mode) {
  const row = document.createElement('div');
  const ptsClass = mode === 'earn' ? 'plus' : 'minus';
  const ptsLabel = mode === 'earn' ? `+${it.pts}` : `-${it.pts}`;
  row.className = 'catalog-row ' + (mode === 'earn' ? 'earn-item' : 'spend-item');
  if (mode === 'earn') {
    row.dataset.taskId = it.id;
    if (isTaskInEarnCooldown(it.id)) row.classList.add('cooldown');
  }
  if (mode === 'spend' && state.score < it.pts) row.classList.add('locked', 'disabled');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'catalog-main';

  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'catalog-emoji';
  emojiSpan.textContent = it.emoji;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'catalog-name';
  nameSpan.textContent = it.name;

  const ptsSpan = document.createElement('span');
  ptsSpan.className = 'catalog-pts ' + ptsClass;
  ptsSpan.textContent = ptsLabel;

  btn.append(emojiSpan, nameSpan, ptsSpan);

  const locked = mode === 'spend' && state.score < it.pts;
  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    markCatalogAction();
    if (mode === 'earn') earn(it);
    else spend(it, e, locked);
  };

  row.appendChild(btn);
  return row;
}

function getCatalogGrid() {
  let grid = document.getElementById('grid');
  if (!grid) {
    grid = document.getElementById('catalogSections');
    if (grid) {
      grid.id = 'grid';
      grid.className = 'catalog-list';
    }
  }
  return grid;
}

function renderCatalog() {
  const grid = getCatalogGrid();
  if (!grid) return;

  grid.innerHTML = '';
  const mode = currentTab === 'earn' ? 'earn' : 'spend';
  if (mode === 'earn') {
    sortItemsByPtsAsc(getActiveTasks()).forEach(it => grid.appendChild(buildCatalogItemEl(it, mode)));
    scheduleEarnCooldownRefresh();
    return;
  }

  sortItemsByPtsAsc(getActiveRewards()).forEach(it => grid.appendChild(buildCatalogItemEl(it, mode)));
}

function render() {
  if (currentView === 'tasks' || currentView === 'rewards') {
    applyViewVisibility(currentView);
    renderHeader();
    renderCatalog();
  } else if (currentView === 'history') {
    renderHistory();
  } else if (currentView === 'settings') {
    renderSettings();
    renderAppMeta();
  }
}

function lastEarnTimeForTask(taskId) {
  return getLastEarnByTaskId().get(taskId) || 0;
}

function earn(it, e) {
  if (isTaskInEarnCooldown(it.id)) {
    shakeEarnRow(it.id);
    return;
  }
  const ts = Date.now();
  state.history.push({ eid: newEid(), id: it.id, emoji: it.emoji, name: it.name, delta: it.pts, time: nowStr(), ts });
  recordLastEarn(it.id, ts);
  touchMeta();
  save();
  bump(); popup('+' + it.pts, '#06d6a0', it.emoji); confetti();
  render();
}

function spend(it, e, locked) {
  if (locked) {
    toast('积分不够哦', 'error');
    shakeScore();
    return;
  }
  pendingSpendItem = it;
  document.getElementById('spendModalEmoji').textContent = it.emoji;
  document.getElementById('spendModalMsg').textContent =
    `将消耗 ${it.pts} 颗星星兑换「${it.name}」`;
  document.getElementById('spendModal').classList.add('show');
}

function hideSpendModal() {
  document.getElementById('spendModal').classList.remove('show');
  pendingSpendItem = null;
}

function confirmSpend() {
  const it = pendingSpendItem;
  if (!it) return;
  hideSpendModal();
  state.history.push({ eid: newEid(), id: it.id, emoji: it.emoji, name: it.name, delta: -it.pts, time: nowStr(), ts: Date.now() });
  touchMeta();
  save();
  bump(); popup('-' + it.pts, '#ff8fab', it.emoji); confetti();
  markCatalogAction();
  render();
}

// ====== 动画效果 ======
function animateScoreNum(from, to) {
  const el = document.getElementById('scoreNum');
  if (scoreAnimFrame) cancelAnimationFrame(scoreAnimFrame);
  const dir = to > from ? 'up' : 'down';
  el.classList.remove('score-up', 'score-down', 'score-pulse');
  void el.offsetWidth;
  el.classList.add(dir === 'up' ? 'score-up' : 'score-down', 'score-pulse');
  const duration = Math.min(350 + Math.abs(to - from) * 40, 700);
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) {
      scoreAnimFrame = requestAnimationFrame(tick);
    } else {
      el.textContent = to;
      scoreAnimFrame = null;
      setTimeout(() => el.classList.remove('score-up', 'score-down', 'score-pulse'), 450);
    }
  }
  scoreAnimFrame = requestAnimationFrame(tick);
}

function bump() {
  const el = document.getElementById('starBadge');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 300);
}

function shakeScore() {
  const el = document.getElementById('starBadge');
  el.animate([{transform:'scale(1)'},{transform:'scale(1.1) translateX(-4px)'},{transform:'scale(1.1) translateX(4px)'},{transform:'scale(1)'}],{duration:300});
}

function popup(text, color, visual, asIcon) {
  const p = document.createElement('div');
  p.className = 'pop';
  p.style.color = color;
  const prefix = asIcon ? ipIcon(visual, 'pop-ic') : ((visual || '') + ' ');
  p.innerHTML = prefix + text;
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1000);
}

let toastHideTimer = null;

function toast(text, kind) {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    wrap.innerHTML = '<div class="toast" id="toastEl"></div>';
    document.body.appendChild(wrap);
  }
  const el = document.getElementById('toastEl');
  if (!el) return;
  if (toastHideTimer) clearTimeout(toastHideTimer);

  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = text;

  wrap.classList.remove('show');
  void wrap.offsetWidth;
  wrap.classList.add('show');

  toastHideTimer = setTimeout(() => wrap.classList.remove('show'), 2200);
}

function confetti() {
  const colors = ['#ff7b3d','#ffc233','#ffb627','#ff9a3c','#ff5e62'];
  for (let i = 0; i < 24; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random()*100 + 'vw';
    c.style.background = colors[Math.floor(Math.random()*colors.length)];
    const dur = 1.2 + Math.random()*1;
    c.style.animation = `fall ${dur}s linear forwards`;
    c.style.transform = `rotate(${Math.random()*360}deg)`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), dur*1000 + 100);
  }
}

// ====== 事件委托（替代 HTML 内联 onclick / onkeydown） ======

const OVERLAY_DISMISS_HANDLERS = {
  catalogEditModal: () => hideCatalogEditModal(),
  passwordModal: () => hidePasswordModal(),
  profileModal: () => hideProfileModal(),
  calModal: () => hideCalendar(),
  spendModal: () => hideSpendModal(),
  deleteModal: () => hideDeleteConfirmModal(),
  updateModal: () => hideUpdateModal(),
};

const CLICK_ACTION_HANDLERS = {
  'submit-login': () => submitLogin(),
  'show-forgot-panel': () => showForgotPanel(),
  'show-login-panel': () => showLoginPanel(),
  'submit-forgot-password': () => submitForgotPassword(),
  'submit-reset-password': () => submitResetPassword(),
  'show-forgot-send-panel': () => showForgotSendPanel(),
  'enter-history-edit': () => enterHistoryEdit(),
  'exit-history-edit': () => exitHistoryEdit(),
  'open-calendar': () => openCalendar(),
  'select-all-history': () => selectAllVisibleHistory(),
  'show-delete-confirm': () => showDeleteConfirmModal(),
  'open-profile-modal': () => openProfileModal(),
  'open-onboarding': () => openOnboardingReconfigure(),
  'open-catalog-manage': el => openCatalogManage(el.dataset.catalogType),
  'open-password-modal': () => openPasswordModal(),
  'logout': () => logoutApp(),
  'open-catalog-edit': el => openCatalogEditModal(el.dataset.catalogType),
  'nav': el => switchView(el.dataset.nav),
  'delete-catalog-item': () => deleteCatalogItem(),
  'hide-catalog-edit-modal': () => hideCatalogEditModal(),
  'save-catalog-edit': () => saveCatalogEdit(),
  'hide-password-modal': () => hidePasswordModal(),
  'submit-change-password': () => submitChangePassword(),
  'hide-profile-modal': () => hideProfileModal(),
  'save-profile': () => saveProfile(),
  'cal-shift': el => calShift(Number(el.dataset.months)),
  'hide-calendar': () => hideCalendar(),
  'cal-pick-today': () => calPickToday(),
  'hide-spend-modal': () => hideSpendModal(),
  'confirm-spend': () => confirmSpend(),
  'hide-delete-confirm-modal': () => hideDeleteConfirmModal(),
  'confirm-delete-selected': () => confirmDeleteSelected(),
  'hide-update-modal': () => hideUpdateModal(),
  'confirm-app-refresh': () => confirmAppRefresh(),
};

const KEY_ACTION_HANDLERS = {
  'focus-next': el => document.getElementById(el.dataset.focusTarget)?.focus(),
  'submit-login': () => submitLogin(),
  'submit-forgot-password': () => submitForgotPassword(),
  'submit-reset-password': () => submitResetPassword(),
  'save-catalog-edit': () => saveCatalogEdit(),
  'submit-change-password': () => submitChangePassword(),
  'save-profile': () => saveProfile(),
};

function findActionEl(el, attr) {
  return el && el.closest ? el.closest('[' + attr + ']') : null;
}

function initAppEvents() {
  document.addEventListener('click', e => {
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) {
      const dismiss = OVERLAY_DISMISS_HANDLERS[overlay.id];
      if (dismiss) dismiss();
      return;
    }

    const el = findActionEl(e.target, 'data-action');
    if (!el) return;
    const handler = CLICK_ACTION_HANDLERS[el.dataset.action];
    if (handler) handler(el);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const el = findActionEl(e.target, 'data-action-key');
    if (!el || el !== e.target) return;
    const handler = KEY_ACTION_HANDLERS[el.dataset.actionKey];
    if (handler) handler(el);
  });

}

initAppEvents();
initSafeAreaSync();
