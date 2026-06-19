// ====== 界面渲染与交互 ======

let profilePickAvatar = DEFAULT_CHILD_AVATAR;
let lastDisplayedScore = null;
let scoreAnimFrame = null;
let currentView = 'tasks';
let currentTab = 'earn';
let pendingSpendItem = null;

const PRIMARY_VIEWS = ['tasks', 'rewards', 'history', 'settings'];

const VIEW_IDS = {
  home: 'mainView',
  history: 'historyView',
  settings: 'settingsView',
  taskManage: 'taskManageView',
  rewardManage: 'rewardManageView'
};

function updateBottomNav(view) {
  const nav = document.getElementById('bottomNav');
  if (!nav) return;
  const navKey = view === 'tasks' || view === 'rewards' ? view : view;
  const primary = PRIMARY_VIEWS.includes(navKey);
  const hideForEdit = view === 'history' && typeof historyEditMode !== 'undefined' && historyEditMode;
  const show = primary && !hideForEdit;
  nav.classList.toggle('is-hidden', !show);
  document.body.classList.toggle('has-bottom-nav', show);
  nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.nav === navKey);
  });
}

function isIOS() {
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

const vibrationSupported = !isIOS() && typeof navigator.vibrate === 'function';
let vibrationEnabled = vibrationSupported;

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
  const ver = (typeof APP_VERSION === 'string' && APP_VERSION) ? APP_VERSION : '—';
  const env = getEnvStatus();
  const tagCls = 'env-tag' + (env.text === '离线' ? ' offline' : (env.dev ? ' dev' : ''));
  el.innerHTML = `版本 ${ver} · <span class="${tagCls}">${env.text}</span>`;
}

function startApp() {
  state = loadLocal();
  lastDisplayedScore = null;
  initCloud();
  renderAppMeta();
  switchView('tasks');
  updateSettingsSection();
  render();
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
  const bottomAvatar = document.getElementById('bottomNavAvatar');
  if (bottomAvatar) bottomAvatar.textContent = state.profile.avatar;
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

function switchView(view) {
  if (currentView === 'history' && view !== 'history') exitHistoryEdit();

  if (view === 'tasks' || view === 'rewards') {
    currentView = view;
    Object.keys(VIEW_IDS).forEach(v => {
      const el = document.getElementById(VIEW_IDS[v]);
      if (el) el.style.display = v === 'home' ? '' : 'none';
    });
    switchTab(view === 'tasks' ? 'earn' : 'spend');
    updateBottomNav(view);
    window.scrollTo(0, 0);
    return;
  }

  currentView = view;
  Object.keys(VIEW_IDS).forEach(v => {
    const el = document.getElementById(VIEW_IDS[v]);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  if (view === 'history') {
    exitHistoryEdit();
    selectedDateKey = ymd(new Date());
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
  window.scrollTo(0, 0);
}

function renderSettings() {
  document.getElementById('setAvatar').textContent = state.profile.avatar;
  document.getElementById('setName').textContent = state.profile.name;
  updateSettingsSection();
}

function updateSettingsSection() {
  const vibSetting = document.getElementById('vibrationSetting');
  if (vibSetting) vibSetting.style.display = vibrationSupported ? '' : 'none';
  const vibToggle = document.getElementById('vibrationToggle');
  if (vibToggle) vibToggle.checked = vibrationEnabled;
  if (typeof updatePwaInstallUI === 'function') updatePwaInstallUI();
}

function toggleVibration() {
  const vibToggle = document.getElementById('vibrationToggle');
  vibrationEnabled = !!vibToggle?.checked;
  if (VIBRATION_KEY) localStorage.setItem(VIBRATION_KEY, vibrationEnabled ? '1' : '0');
  if (vibrationEnabled) vibrateFeedback('earn');
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

function buildCatalogItemEl(it, mode) {
  const row = document.createElement('div');
  const ptsClass = mode === 'earn' ? 'plus' : 'minus';
  const ptsLabel = mode === 'earn' ? `+${it.pts}` : `-${it.pts}`;
  row.className = 'catalog-row ' + (mode === 'earn' ? 'earn-item' : 'spend-item');
  if (mode === 'spend' && state.score < it.pts) row.classList.add('locked', 'disabled');
  row.innerHTML = `
    <button type="button" class="catalog-main">
      <span class="catalog-emoji">${it.emoji}</span>
      <span class="catalog-name">${it.name}</span>
      <span class="catalog-pts ${ptsClass}">${ptsLabel}</span>
    </button>`;
  const locked = mode === 'spend' && state.score < it.pts;
  row.querySelector('.catalog-main').onclick = () => {
    if (mode === 'earn') earn(it);
    else spend(it, null, locked);
  };
  return row;
}

function render() {
  renderHeader();
  let grid = document.getElementById('grid');
  if (!grid) {
    grid = document.getElementById('catalogSections');
    if (grid) {
      grid.id = 'grid';
      grid.className = 'catalog-list';
    }
  }
  if (!grid) return;

  grid.innerHTML = '';
  const mode = currentTab === 'earn' ? 'earn' : 'spend';
  const list = sortItemsByPtsAsc(currentTab === 'earn' ? getActiveTasks() : getActiveRewards());
  list.forEach(it => grid.appendChild(buildCatalogItemEl(it, mode)));
  renderSettings();
  renderHistory();
}

function lastEarnTimeForTask(taskId) {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const h = state.history[i];
    if (h.id === taskId && h.delta > 0) return h.ts || 0;
  }
  return 0;
}

function earn(it, e) {
  const lastTs = lastEarnTimeForTask(it.id);
  if (lastTs && Date.now() - lastTs < EARN_COOLDOWN_MS) {
    toast('刚刚已经做过啦');
    return;
  }
  state.score += it.pts;
  state.history.push({ eid: newEid(), id: it.id, emoji: it.emoji, name: it.name, delta: it.pts, time: nowStr(), ts: Date.now() });
  touchMeta();
  save();
  bump(); popup('+' + it.pts, '#06d6a0', it.emoji); confetti();
  vibrateFeedback('earn');
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
  state.score -= it.pts;
  state.history.push({ eid: newEid(), id: it.id, emoji: it.emoji, name: it.name, delta: -it.pts, time: nowStr(), ts: Date.now() });
  touchMeta();
  save();
  bump(); popup('-' + it.pts, '#ff8fab', it.emoji); confetti();
  vibrateFeedback('spend');
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

function vibrateFeedback(kind) {
  if (!vibrationSupported || !vibrationEnabled) return;
  const pattern = kind === 'earn' ? [35, 40, 55] : [50, 30, 50, 30, 70];
  try { navigator.vibrate(pattern); } catch (e) {}
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
