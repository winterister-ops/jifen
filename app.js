let profilePickAvatar = DEFAULT_CHILD_AVATAR;

function ipIcon(name, cls = 'ui-ic') {
  return `<img class="${cls}" src="icons/${name}.svg" alt="">`;
}

function defaultProfile() {
  return { name: DEFAULT_CHILD_NAME, avatar: DEFAULT_CHILD_AVATAR };
}

function normalizeProfile(p) {
  if (p && typeof p.name === 'string' && p.name.trim()) {
    return {
      name: p.name.trim().slice(0, 12),
      avatar: AVATAR_OPTIONS.includes(p.avatar) ? p.avatar : DEFAULT_CHILD_AVATAR
    };
  }
  return defaultProfile();
}

let taskSort = SORT_MODES.includes(localStorage.getItem(SORT_KEY))
  ? localStorage.getItem(SORT_KEY) : 'default';
function isIOS() {
  if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

const vibrationSupported = !isIOS() && typeof navigator.vibrate === 'function';
let vibrationEnabled = vibrationSupported && localStorage.getItem(VIBRATION_KEY) !== '0';
let sortBarExpanded = false;
let state = defaultState();
let cloudRef = null;
let cloudUnsubscribe = null;
let applyingRemote = false;
let firebaseReady = false;

function defaultMeta() {
  return { lastClearAt: 0, profileUpdatedAt: 0, updatedAt: 0 };
}

function defaultState() {
  return { score: 0, history: [], profile: defaultProfile(), revokedEids: [], meta: defaultMeta() };
}

function newEid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function historyEid(h, index) {
  if (h.eid) return h.eid;
  return 'legacy_' + (h.ts || 0) + '_' + index + '_' + h.id + '_' + h.delta;
}

function touchMeta() {
  state.meta = { ...defaultMeta(), ...state.meta, updatedAt: Date.now() };
}

function applyClearAndRevoked(history, lastClearAt, revokedSet) {
  return history.filter(h => {
    if (revokedSet.has(h.eid)) return false;
    if (lastClearAt && (h.ts || 0) <= lastClearAt) return false;
    return true;
  });
}

function normalizeState(raw, forMerge) {
  if (!raw || typeof raw.score !== 'number') return defaultState();
  const history = (Array.isArray(raw.history) ? raw.history : []).map((h, i) => ({
    id: h.id,
    emoji: h.emoji,
    name: h.name,
    delta: h.delta,
    time: h.time,
    ts: h.ts,
    eid: historyEid(h, i)
  }));
  const meta = { ...defaultMeta(), ...(raw.meta || {}) };
  const revokedEids = Array.isArray(raw.revokedEids) ? raw.revokedEids : [];
  const profile = normalizeProfile(raw.profile);
  if (forMerge) {
    return { score: raw.score, history, profile, revokedEids, meta };
  }
  const filtered = applyClearAndRevoked(history, meta.lastClearAt, new Set(revokedEids))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const score = filtered.reduce((s, h) => s + h.delta, 0);
  return { score, history: filtered, profile, revokedEids, meta };
}

function mergeStates(localRaw, remoteRaw) {
  const local = normalizeState(localRaw, true);
  const remote = normalizeState(remoteRaw, true);
  const lastClearAt = Math.max(local.meta.lastClearAt, remote.meta.lastClearAt);
  const revokedEids = [...new Set([...local.revokedEids, ...remote.revokedEids])];
  const revokedSet = new Set(revokedEids);
  const byEid = new Map();
  [...local.history, ...remote.history].forEach(h => byEid.set(h.eid, h));
  const history = applyClearAndRevoked([...byEid.values()], lastClearAt, revokedSet)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const score = history.reduce((s, h) => s + h.delta, 0);
  const profile = local.meta.profileUpdatedAt >= remote.meta.profileUpdatedAt
    ? local.profile : remote.profile;
  return {
    score,
    history,
    profile,
    revokedEids,
    meta: {
      lastClearAt,
      profileUpdatedAt: Math.max(local.meta.profileUpdatedAt, remote.meta.profileUpdatedAt),
      updatedAt: Math.max(local.meta.updatedAt, remote.meta.updatedAt, Date.now())
    }
  };
}

function stateFingerprint(s) {
  const n = normalizeState(s);
  return JSON.stringify({
    score: n.score,
    history: n.history.map(h => h.eid + ':' + h.delta),
    profile: n.profile,
    revoked: [...n.revokedEids].sort(),
    meta: n.meta
  });
}

function stateEqual(a, b) {
  return stateFingerprint(a) === stateFingerprint(b);
}

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.score === 'number') return normalizeState(d);
  } catch(e){}
  return defaultState();
}

function saveLocal() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let cloudPushPending = false;

function pushToCloud() {
  if (!cloudRef || applyingRemote || cloudPushPending) return;
  cloudPushPending = true;
  cloudRef.transaction(current => {
    const remote = current ? normalizeState(current, true) : null;
    return remote ? mergeStates(state, remote) : normalizeState(state);
  }, (error, committed, snapshot) => {
    cloudPushPending = false;
    if (error) {
      console.warn('云同步写入失败', error);
      return;
    }
    if (committed && snapshot) {
      const merged = normalizeState(snapshot.val());
      if (!stateEqual(state, merged)) {
        applyingRemote = true;
        state = merged;
        saveLocal();
        render();
        applyingRemote = false;
      }
    }
  });
}

function save() {
  saveLocal();
  pushToCloud();
}

function welcomeText() {
  const name = state.profile.name;
  const h = new Date().getHours();
  if (h < 12) return '早上好，' + name + '！';
  if (h < 18) return '下午好，' + name + '！';
  return '晚上好，' + name + '！';
}

let lastDisplayedScore = null;
let scoreAnimFrame = null;

function renderHeader() {
  const scoreEl = document.getElementById('scoreNum');
  const newScore = state.score;
  if (lastDisplayedScore !== null && lastDisplayedScore !== newScore) {
    animateScoreNum(lastDisplayedScore, newScore);
  } else {
    scoreEl.textContent = newScore;
  }
  lastDisplayedScore = newScore;
  document.getElementById('welcomeGreet').textContent = welcomeText();
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

// ====== 积分记录页面 + 日期筛选 ======
let selectedDateKey = ymd(new Date()); // 'YYYY-MM-DD' 或 'all'

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 旧记录可能没有 ts，尽量从 "M月D日 HH:MM" 解析（按当前年份）
function entryDate(log) {
  if (typeof log.ts === 'number') return new Date(log.ts);
  const m = /(\d+)月(\d+)日\s+(\d+):(\d+)/.exec(log.time || '');
  if (m) {
    const now = new Date();
    return new Date(now.getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]);
  }
  return null;
}
function entryDateKey(log) {
  const d = entryDate(log);
  return d ? ymd(d) : 'unknown';
}

function dateHeadLabel(key) {
  if (key === 'all') return '全部记录';
  if (key === 'unknown') return '更早的记录';
  const [y, mo, da] = key.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  const today = ymd(new Date());
  const yest = ymd(new Date(Date.now() - 86400000));
  const curYear = new Date().getFullYear();
  let prefix = key === today ? '今天 · ' : (key === yest ? '昨天 · ' : '');
  const yearPart = y !== curYear ? `${y}年` : '';
  return prefix + `${yearPart}${mo}月${da}日 ${WEEKDAYS[d.getDay()]}`;
}

function buildStats(list) {
  if (!list.length) return '暂无记录';
  const net = list.reduce((s, x) => s + x.delta, 0);
  const cls = net >= 0 ? 'plus' : 'minus';
  const sign = net > 0 ? '+' : '';
  return `共 ${list.length} 条 · 净 <span class="net ${cls}">${sign}${net}</span> ${ipIcon('star', 'ui-ic-sm')}`;
}

function filteredHistory() {
  let list = state.history.slice();
  if (selectedDateKey !== 'all') list = list.filter(log => entryDateKey(log) === selectedDateKey);
  return list;
}

function renderDateHeader() {
  const titleEl = document.getElementById('hpDateTitle');
  const statsEl = document.getElementById('hpDateStats');
  const allBtn = document.getElementById('allToggle');
  const todayBtn = document.getElementById('todayBtn');
  if (!titleEl) return;

  const list = filteredHistory();
  const showAll = selectedDateKey === 'all';
  titleEl.textContent = showAll ? '全部记录' : dateHeadLabel(selectedDateKey);
  if (statsEl) statsEl.innerHTML = buildStats(list);
  if (allBtn) allBtn.classList.toggle('active', showAll);

  const todayKey = ymd(new Date());
  if (todayBtn) todayBtn.style.display = (selectedDateKey !== todayKey && selectedDateKey !== 'all') ? '' : 'none';
}

function selectDate(key) {
  selectedDateKey = key;
  renderDateHeader();
  renderHistory();
}

function toggleAllFilter() {
  selectDate(selectedDateKey === 'all' ? ymd(new Date()) : 'all');
}

function goToToday() {
  selectDate(ymd(new Date()));
}

// ====== 自定义日历选择器 ======
let calYear, calMonth; // calMonth: 0-11

function openCalendar() {
  let base;
  if (selectedDateKey !== 'all' && selectedDateKey !== 'unknown') {
    const [y, m] = selectedDateKey.split('-').map(Number);
    base = new Date(y, m - 1, 1);
  } else {
    base = new Date();
  }
  calYear = base.getFullYear();
  calMonth = base.getMonth();
  renderCalendar();
  document.getElementById('calModal').classList.add('show');
}
function hideCalendar() {
  document.getElementById('calModal').classList.remove('show');
}
function calShift(deltaMonths) {
  const d = new Date(calYear, calMonth + deltaMonths, 1);
  calYear = d.getFullYear();
  calMonth = d.getMonth();
  renderCalendar();
}
function calSelect(key) {
  hideCalendar();
  selectDate(key);
}
function calPickToday() {
  calSelect(ymd(new Date()));
}
function renderCalendar() {
  document.getElementById('calTitle').textContent = `${calYear}年${calMonth + 1}月`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  const startDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayKey = ymd(new Date());
  const recDays = new Set(state.history.map(entryDateKey));

  for (let i = 0; i < startDow; i++) {
    const b = document.createElement('div');
    b.className = 'cal-cell blank';
    grid.appendChild(b);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const key = ymd(new Date(calYear, calMonth, day));
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell'
      + (key === todayKey ? ' today' : '')
      + (key === selectedDateKey ? ' sel' : '');
    cell.innerHTML = day + (recDays.has(key) ? '<i class="dot"></i>' : '');
    cell.onclick = () => calSelect(key);
    grid.appendChild(cell);
  }
}

let currentView = 'home';
const VIEW_IDS = { home: 'mainView', history: 'historyView', settings: 'settingsView', stats: 'statsView' };
const PRIMARY_VIEWS = new Set(['home', 'history', 'settings']);

function switchView(view) {
  currentView = view;
  Object.keys(VIEW_IDS).forEach(v => {
    document.getElementById(VIEW_IDS[v]).style.display = v === view ? '' : 'none';
  });
  document.getElementById('navHome').classList.toggle('active', view === 'home');
  document.getElementById('navHistory').classList.toggle('active', view === 'history');
  document.getElementById('navSettings').classList.toggle('active', view === 'settings' || view === 'stats');
  const showNav = PRIMARY_VIEWS.has(view);
  document.body.classList.toggle('has-bottom-nav', showNav);
  if (showNav) resetBottomNav();
  else setBottomNavVisible(false);
  if (view === 'history') {
    selectedDateKey = ymd(new Date());
    renderDateHeader();
    renderHistory();
  }
  if (view === 'settings') renderSettings();
  if (view === 'stats') renderTaskStats();
  window.scrollTo(0, 0);
}

function renderSettings() {
  document.getElementById('setAvatar').textContent = state.profile.avatar;
  document.getElementById('setName').textContent = state.profile.name;
  document.getElementById('setScore').textContent = state.score;
  let earned = 0, spent = 0;
  state.history.forEach(h => { if (h.delta > 0) earned += h.delta; else spent += -h.delta; });
  document.getElementById('setEarned').textContent = '+' + earned;
  document.getElementById('setSpent').textContent = '-' + spent;
  const totalCount = state.history.length;
  const descEl = document.getElementById('statsEntryDesc');
  if (descEl) {
    descEl.textContent = totalCount ? `共 ${totalCount} 条完成记录` : '查看完成记录';
  }
  updateSettingsSection();
}

function updateSettingsSection() {
  const section = document.getElementById('settingsSection');
  const vibSetting = document.getElementById('vibrationSetting');
  if (vibSetting) vibSetting.style.display = vibrationSupported ? '' : 'none';
  if (section) section.style.display = vibrationSupported ? '' : 'none';
  const vibToggle = document.getElementById('vibrationToggle');
  if (vibToggle) vibToggle.checked = vibrationEnabled;
}

function toggleVibration() {
  const vibToggle = document.getElementById('vibrationToggle');
  vibrationEnabled = !!vibToggle?.checked;
  localStorage.setItem(VIBRATION_KEY, vibrationEnabled ? '1' : '0');
  if (vibrationEnabled) vibrateFeedback('earn');
}

function renderTaskStats() {
  const el = document.getElementById('taskStats');
  if (!el) return;
  const earnStats = TASKS.map(t => ({ ...t, count: countOf(t.id) })).filter(t => t.count > 0);
  const rewardStats = REWARDS.map(t => ({ ...t, count: countOf(t.id) })).filter(t => t.count > 0);
  if (!earnStats.length && !rewardStats.length) {
    el.innerHTML = '<div class="empty">还没有完成记录</div>';
    return;
  }
  let html = '';
  if (earnStats.length) {
    html += '<div class="date-head">完成任务</div><div class="task-stat-list">';
    earnStats.forEach(t => {
      html += `<div class="task-stat-row">
        <div class="task-stat-left"><span class="task-stat-emoji">${t.emoji}</span><span class="task-stat-name">${t.name}</span></div>
        <span class="task-stat-count">${t.count}次</span>
      </div>`;
    });
    html += '</div>';
  }
  if (rewardStats.length) {
    html += '<div class="date-head">兑换奖励</div><div class="task-stat-list">';
    rewardStats.forEach(t => {
      html += `<div class="task-stat-row">
        <div class="task-stat-left"><span class="task-stat-emoji">${t.emoji}</span><span class="task-stat-name">${t.name}</span></div>
        <span class="task-stat-count">${t.count}次</span>
      </div>`;
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

function saveProfile() {
  const name = document.getElementById('profileNameInput').value.trim();
  if (!name) {
    popup('请输入昵称', '#ff8fab', 'edit', true);
    return;
  }
  state.profile = { name: name.slice(0, 12), avatar: profilePickAvatar };
  state.meta = { ...defaultMeta(), ...state.meta, profileUpdatedAt: Date.now(), updatedAt: Date.now() };
  save();
  renderHeader();
  renderSettings();
  hideProfileModal();
}

function setStatus(text, isDev) {
  const el = document.getElementById('envBadge');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('dev', !!isDev);
}

function envStatusText() {
  if (ENV === 'prod') return { text: '线上', dev: false };
  return { text: '开发', dev: true };
}

function tearDownCloud() {
  if (cloudUnsubscribe) {
    cloudUnsubscribe();
    cloudUnsubscribe = null;
  }
  cloudRef = null;
}

function initCloud() {
  tearDownCloud();
  if (!firebaseReady || !firebaseConfig.databaseURL) {
    const s = envStatusText();
    setStatus(s.text, s.dev);
    return;
  }
  try {
    cloudRef = firebase.database().ref(CLOUD_PATH);
    let first = true;
    cloudUnsubscribe = cloudRef.on('value', snap => {
      const val = snap.val();
      if (val && typeof val.score === 'number') {
        const merged = mergeStates(state, val);
        if (!stateEqual(state, merged)) {
          applyingRemote = true;
          state = merged;
          saveLocal();
          render();
          applyingRemote = false;
          const remoteNorm = normalizeState(val, true);
          if (!stateEqual(merged, remoteNorm)) {
            cloudRef.set(merged).catch(err => console.warn('云同步合并回写失败', err));
          }
        }
      } else if (first) {
        cloudRef.set(normalizeState(state));
      }
      first = false;
      const s = envStatusText();
      setStatus(s.text, s.dev);
    }, err => {
      console.warn(err);
      setStatus('离线', ENV === 'dev');
    });
  } catch(e) {
    console.warn(e);
    setStatus('离线', ENV === 'dev');
  }
}

let currentUser = null;

function startApp() {
  state = loadLocal();
  lastDisplayedScore = null;
  initCloud();
  switchView('home');
  updateSettingsSection();
  render();
}

function showAuthView() {
  const authView = document.getElementById('authView');
  const appRoot = document.getElementById('appRoot');
  if (authView) authView.style.display = 'flex';
  if (appRoot) appRoot.style.display = 'none';
  document.body.classList.remove('has-bottom-nav');
  setTimeout(() => {
    const input = document.getElementById('pinInput');
    if (input) input.focus();
  }, 200);
}

function hideAuthView() {
  const authView = document.getElementById('authView');
  const appRoot = document.getElementById('appRoot');
  if (authView) authView.style.display = 'none';
  if (appRoot) appRoot.style.display = '';
}

function setAuthError(msg) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
}

function pinErrorText(err) {
  const code = (err && err.code) || '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential'
      || code === 'auth/invalid-login-credentials') return 'PIN 码不正确，请重试';
  if (code === 'auth/too-many-requests') return '尝试次数过多，请稍后再试';
  if (code === 'auth/network-request-failed') return '网络连接失败，请检查网络后重试';
  if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return '账号配置有误，请检查 OWNER_EMAIL';
  return '解锁失败，请重试';
}

function submitPin() {
  const input = document.getElementById('pinInput');
  const btn = document.getElementById('pinSubmitBtn');
  const pin = (input ? input.value : '').trim();
  if (!pin) { setAuthError('请输入 PIN 码'); return; }
  if (!firebaseReady) { setAuthError('云服务未配置，无法解锁'); return; }
  setAuthError('');
  if (btn) { btn.disabled = true; btn.textContent = '解锁中…'; }
  firebase.auth().signInWithEmailAndPassword(OWNER_EMAIL, pin)
    .then(() => { if (input) input.value = ''; })
    .catch(err => {
      console.warn('解锁失败', err);
      setAuthError(pinErrorText(err));
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '解锁'; }
    });
}

function lockApp() {
  if (!firebaseReady) return;
  firebase.auth().signOut().catch(err => console.warn('锁定失败', err));
}

function onAuthChanged(user) {
  currentUser = user || null;
  if (user) {
    setAuthError('');
    hideAuthView();
    startApp();
  } else {
    tearDownCloud();
    state = defaultState();
    lastDisplayedScore = null;
    showAuthView();
  }
}

function initFirebase() {
  if (firebaseConfig.databaseURL) {
    try {
      firebase.initializeApp(firebaseConfig);
      firebaseReady = true;
    } catch (e) {
      console.warn(e);
      firebaseReady = false;
    }
  } else {
    firebaseReady = false;
  }

  if (firebaseReady) {
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION)
      .catch(err => console.warn('设置登录持久化失败', err))
      .finally(() => {
        firebase.auth().onAuthStateChanged(onAuthChanged);
      });
  } else {
    showAuthView();
    setAuthError('云服务未配置，无法解锁');
  }
}

let currentTab = 'earn';

function switchTab(t) {
  currentTab = t;
  document.getElementById('tabEarn').classList.toggle('active', t === 'earn');
  document.getElementById('tabSpend').classList.toggle('active', t === 'spend');
  render();
}

function toggleSortBar() {
  sortBarExpanded = !sortBarExpanded;
  document.getElementById('sortBar').classList.toggle('expanded', sortBarExpanded);
}

function setTaskSort(mode) {
  if (!SORT_MODES.includes(mode)) return;
  taskSort = mode;
  localStorage.setItem(SORT_KEY, mode);
  renderSortBar();
  render();
}

function renderSortBar() {
  document.querySelectorAll('.sort-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === taskSort);
  });
  const cur = document.getElementById('sortCurrent');
  if (cur) cur.textContent = SORT_LABELS[taskSort] || '默认';
  document.getElementById('sortBar').classList.toggle('expanded', sortBarExpanded);
}

function sortItems(list) {
  const items = list.slice();
  switch (taskSort) {
    case 'pts-asc':
      return items.sort((a, b) => a.pts - b.pts || a.name.localeCompare(b.name, 'zh-CN'));
    case 'pts-desc':
      return items.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name, 'zh-CN'));
    default:
      return items;
  }
}

function countOf(id) {
  return state.history.filter(h => h.id === id).length;
}

function render() {
  renderHeader();
  renderSortBar();
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const list = sortItems(currentTab === 'earn' ? TASKS : REWARDS);
  list.forEach(it => {
    const div = document.createElement('div');
    if (currentTab === 'earn') {
      div.className = 'item earn-item';
      div.innerHTML = `
        <span class="pts">+${it.pts}</span>
        <span class="emoji">${it.emoji}</span>
        <span class="name">${it.name}</span>`;
      div.onclick = (e) => earn(it, e);
    } else {
      const locked = state.score < it.pts;
      div.className = 'item spend-item' + (locked ? ' locked' : '');
      div.innerHTML = `
        <span class="pts">-${it.pts}</span>
        <span class="emoji">${it.emoji}</span>
        <span class="name">${it.name}</span>`;
      div.onclick = (e) => spend(it, e, locked);
    }
    grid.appendChild(div);
  });
  renderSettings();
  if (currentView === 'stats') renderTaskStats();
  renderHistory();
}

function renderHistory() {
  const h = document.getElementById('history');
  if (!h) return;
  renderDateHeader();

  let list = filteredHistory();
  const showAll = selectedDateKey === 'all';

  if (!list.length) {
    h.innerHTML = showAll
      ? `<div class="empty">${ipIcon('rocket')}还没有记录，快去做任务赚积分吧！</div>`
      : `<div class="empty">${ipIcon('inbox')}这一天还没有积分记录哦</div>`;
    return;
  }

  h.innerHTML = '';
  let lastKey = null;
  list.slice().reverse().forEach(log => {
    const key = entryDateKey(log);
    if (showAll && key !== lastKey) {
      lastKey = key;
      const head = document.createElement('div');
      head.className = 'date-head';
      head.textContent = dateHeadLabel(key);
      h.appendChild(head);
    }
    const row = document.createElement('div');
    row.className = 'log';
    const plus = log.delta > 0;
    row.innerHTML = `
      <div class="left">
        <span class="le">${log.emoji}</span>
        <div>
          <div>${log.name}</div>
          <div class="time">${log.time}</div>
        </div>
      </div>
      <div class="delta ${plus ? 'plus' : 'minus'}">${plus ? '+' : ''}${log.delta}</div>`;
    h.appendChild(row);
  });
}

function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth()+1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function earn(it, e) {
  state.score += it.pts;
  state.history.push({ eid: newEid(), id: it.id, emoji: it.emoji, name: it.name, delta: it.pts, time: nowStr(), ts: Date.now() });
  touchMeta();
  save();
  bump(); popup('+' + it.pts, '#06d6a0', it.emoji); confetti();
  vibrateFeedback('earn');
  render();
}

let pendingSpendItem = null;

function spend(it, e, locked) {
  if (locked) {
    popup('积分不够哦', '#ff8fab', 'caution', true);
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
  bump(); popup('-' + it.pts, '#ff8fab', it.emoji);
  vibrateFeedback('spend');
  render();
}

function undoLast() {
  if (!state.history.length) return;
  const last = state.history.pop();
  if (!Array.isArray(state.revokedEids)) state.revokedEids = [];
  state.revokedEids.push(last.eid || historyEid(last, state.history.length));
  state.score -= last.delta;
  touchMeta();
  save();
  render();
}

let clearConfirmStep = 1;

function showClearModalStep(step) {
  clearConfirmStep = step;
  const s = CLEAR_STEPS[step - 1];
  document.getElementById('clearModalEmoji').innerHTML = ipIcon(s.icon);
  document.getElementById('clearModalTitle').textContent = s.title;
  document.getElementById('clearModalMsg').textContent = s.msg;
  document.getElementById('clearModalStep').textContent = s.step;
  const okBtn = document.getElementById('clearModalOk');
  okBtn.textContent = s.btn;
  okBtn.className = 'modal-btn ' + (s.danger ? 'danger' : 'confirm');
  document.getElementById('clearModal').classList.add('show');
}

function hideClearModal() {
  document.getElementById('clearModal').classList.remove('show');
  clearConfirmStep = 1;
}

function clearAll() {
  if (!state.score && !state.history.length) return;
  showClearModalStep(1);
}

function onClearConfirm() {
  if (clearConfirmStep === 1) {
    showClearModalStep(2);
    return;
  }
  state = {
    score: 0,
    history: [],
    profile: state.profile,
    revokedEids: [],
    meta: { ...defaultMeta(), ...state.meta, lastClearAt: Date.now(), updatedAt: Date.now() }
  };
  save();
  render();
  hideClearModal();
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

// 底部栏随滚动隐藏/展示（上滑隐藏，下滑展示，参考 X App）
const bottomNav = document.querySelector('.bottom-nav');
let navLastScrollY = 0;
let navScrollTicking = false;

function setBottomNavVisible(visible) {
  if (bottomNav) bottomNav.classList.toggle('nav-hidden', !visible);
}

function resetBottomNav() {
  navLastScrollY = window.scrollY;
  setBottomNavVisible(true);
}

function onBottomNavScroll() {
  if (!PRIMARY_VIEWS.has(currentView)) return;
  if (navScrollTicking) return;
  navScrollTicking = true;
  requestAnimationFrame(() => {
    const y = window.scrollY;
    const delta = 6;
    if (y <= 12) {
      setBottomNavVisible(true);
    } else if (y > navLastScrollY + delta) {
      setBottomNavVisible(false);
    } else if (y < navLastScrollY - delta) {
      setBottomNavVisible(true);
    }
    navLastScrollY = y;
    navScrollTicking = false;
  });
}

window.addEventListener('scroll', onBottomNavScroll, { passive: true });

initFirebase();
