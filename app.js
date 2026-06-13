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
let sortBarExpanded = false;
let state = loadLocal();
let cloudRef = null;
let applyingRemote = false;

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.score === 'number') {
      if (!Array.isArray(d.history)) d.history = [];
      d.profile = normalizeProfile(d.profile);
      return d;
    }
  } catch(e){}
  return { score: 0, history: [], profile: defaultProfile() };
}
function saveLocal() { localStorage.setItem(KEY, JSON.stringify(state)); }

function save() {
  saveLocal();
  if (cloudRef && !applyingRemote) {
    cloudRef.set(state).catch(err => console.warn('云同步写入失败', err));
  }
}

function welcomeText() {
  const name = state.profile.name;
  const h = new Date().getHours();
  if (h < 12) return '早上好，' + name + '！';
  if (h < 18) return '下午好，' + name + '！';
  return '晚上好，' + name + '！';
}

function renderHeader() {
  document.getElementById('scoreNum').textContent = state.score;
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

function switchView(view) {
  currentView = view;
  Object.keys(VIEW_IDS).forEach(v => {
    document.getElementById(VIEW_IDS[v]).style.display = v === view ? '' : 'none';
  });
  document.getElementById('navHome').classList.toggle('active', view === 'home');
  document.getElementById('navHistory').classList.toggle('active', view === 'history');
  document.getElementById('navSettings').classList.toggle('active', view === 'settings' || view === 'stats');
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

function initCloud() {
  if (!firebaseConfig.databaseURL) {
    const s = envStatusText();
    setStatus(s.text, s.dev);
    return;
  }
  try {
    firebase.initializeApp(firebaseConfig);
    cloudRef = firebase.database().ref('families/' + FAMILY);
    let first = true;
    cloudRef.on('value', snap => {
      const val = snap.val();
      if (val && typeof val.score === 'number') {
        state = {
          score: val.score,
          history: Array.isArray(val.history) ? val.history : [],
          profile: normalizeProfile(val.profile)
        };
        saveLocal();
        applyingRemote = true; render(); applyingRemote = false;
      } else if (first) {
        cloudRef.set(state); // 云端为空时，把本机数据作为初始上传
      }
      first = false;
      const s = envStatusText();
      setStatus(s.text, s.dev);
    }, err => { console.warn(err); setStatus('离线', ENV === 'dev'); });
  } catch(e) { console.warn(e); setStatus('离线', ENV === 'dev'); }
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
  state.history.push({ id: it.id, emoji: it.emoji, name: it.name, delta: it.pts, time: nowStr(), ts: Date.now() });
  save();
  bump(); popup('+' + it.pts, '#06d6a0', it.emoji); confetti();
  render();
}

function spend(it, e, locked) {
  if (locked) {
    popup('积分不够哦', '#ff8fab', 'caution', true);
    shakeScore();
    return;
  }
  state.score -= it.pts;
  state.history.push({ id: it.id, emoji: it.emoji, name: it.name, delta: -it.pts, time: nowStr(), ts: Date.now() });
  save();
  bump(); popup('-' + it.pts, '#ff8fab', it.emoji);
  render();
}

function undoLast() {
  if (!state.history.length) return;
  const last = state.history.pop();
  state.score -= last.delta;
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
  state = { score: 0, history: [], profile: state.profile };
  save();
  render();
  hideClearModal();
}

// ====== 动画效果 ======
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

render();
{ const s = envStatusText(); setStatus(s.text, s.dev); }
initCloud();
