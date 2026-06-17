// ====== 界面渲染与交互 ======

let profilePickAvatar = DEFAULT_CHILD_AVATAR;
let taskSort = 'default';
let sortBarExpanded = false;
let lastDisplayedScore = null;
let scoreAnimFrame = null;
let currentView = 'home';
let currentTab = 'earn';
let pendingSpendItem = null;
let clearConfirmStep = 1;

const VIEW_IDS = { home: 'mainView', history: 'historyView', settings: 'settingsView', stats: 'statsView' };

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
  switchView('home');
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
  currentView = view;
  Object.keys(VIEW_IDS).forEach(v => {
    document.getElementById(VIEW_IDS[v]).style.display = v === view ? '' : 'none';
  });
  if (view === 'history') {
    selectedDateKey = ymd(new Date());
    renderDateHeader();
    renderHistory();
  }
  if (view === 'settings') {
    renderSettings();
    renderAppMeta();
  }
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
  const historyDescEl = document.getElementById('historyEntryDesc');
  if (historyDescEl) {
    historyDescEl.textContent = totalCount ? `共 ${totalCount} 条记录` : '按日期查看记录';
  }
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
  if (VIBRATION_KEY) localStorage.setItem(VIBRATION_KEY, vibrationEnabled ? '1' : '0');
  if (vibrationEnabled) vibrateFeedback('earn');
}

function countOf(id) {
  return state.history.filter(h => h.id === id).length;
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
  if (SORT_KEY) localStorage.setItem(SORT_KEY, mode);
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

function earn(it, e) {
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
