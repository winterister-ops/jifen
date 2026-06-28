// ====== 新用户引导 ======

const ONBOARDING_STEPS = ['profile', 'habits', 'rewards', 'done'];
const ONBOARDING_HABIT_MAX = 12;
const ONBOARDING_HABIT_WARN = 10;
const ONBOARDING_REWARD_MAX = 8;

let onboardingMode = 'initial';
let onboardingStep = 'profile';
let onboardingAvatar = DEFAULT_CHILD_AVATAR;
let onboardingName = DEFAULT_CHILD_NAME;
let onboardingHabitCat = 'all';
let onboardingHabits = new Set();
let onboardingRewards = new Set();

function recommendedHabitIds() {
  return new Set(RECOMMENDED_TASK_IDS);
}

function recommendedRewardIds() {
  return new Set(RECOMMENDED_REWARD_IDS);
}

function enabledCatalogIds(type) {
  const list = type === 'rewards' ? (state.catalog?.rewards || []) : (state.catalog?.tasks || []);
  return new Set(list.filter(it => it.enabled).map(it => it.id));
}

function resetOnboardingDraft(opts) {
  onboardingMode = opts?.mode === 'reconfigure' ? 'reconfigure' : 'initial';
  onboardingStep = opts?.step || (onboardingMode === 'reconfigure' ? 'habits' : 'profile');
  onboardingAvatar = state.profile?.avatar || DEFAULT_CHILD_AVATAR;
  onboardingName = state.profile?.name || DEFAULT_CHILD_NAME;
  onboardingHabitCat = 'all';
  if (onboardingMode === 'reconfigure') {
    onboardingHabits = enabledCatalogIds('tasks');
    onboardingRewards = enabledCatalogIds('rewards');
  } else {
    onboardingHabits = recommendedHabitIds();
    onboardingRewards = recommendedRewardIds();
  }
}

function isOnboardingVisible() {
  const el = document.getElementById('onboardingView');
  return !!el && el.style.display !== 'none' && !el.hidden;
}

function showOnboarding(opts) {
  resetOnboardingDraft(opts);
  setOnboardingShellVisible(true);
  renderOnboarding();
  lockPageScroll();
}

function hideOnboarding() {
  setOnboardingShellVisible(false);
  updateBottomNav(currentView);
  lockPageScroll();
}

function finishOnboardingToApp() {
  hideOnboarding();
  switchView('tasks');
  render();
  lockPageScroll();
}

// 云端首次同步在加载页完成后调用：直接进入引导或首页，不再先露出首页再等账号确认。
function enterAppAfterCloudReady() {
  if (needsOnboarding()) {
    showOnboarding({ mode: 'initial' });
    return;
  }
  hideOnboarding();
  switchView('tasks');
  render();
  lockPageScroll();
}

// 实时同步（onSnapshot）后：若仍停留在初次引导但该账号其实已有数据，则自动退出引导。
function reconcileOnboardingWithRemote() {
  if (onboardingMode !== 'initial') return;
  if (!isOnboardingVisible()) return;
  if (needsOnboarding()) return;
  finishOnboardingToApp();
}

function openOnboardingReconfigure() {
  showOnboarding({ mode: 'reconfigure', step: 'habits' });
}

function setOnboardingStep(step) {
  if (!ONBOARDING_STEPS.includes(step)) return;
  onboardingStep = step;
  renderOnboarding();
  const body = document.getElementById('onboardingBody');
  if (body) body.scrollTop = 0;
}

function onboardingActiveSteps() {
  return onboardingMode === 'reconfigure'
    ? ['habits', 'rewards']
    : ['profile', 'habits', 'rewards'];
}

function renderOnboardingDots() {
  const steps = onboardingActiveSteps();
  const idx = steps.indexOf(onboardingStep);
  const activePanel = document.querySelector('#onboardingView .ob-screen.active .ob-step-dots');
  if (!activePanel) return;

  const dots = [...activePanel.querySelectorAll('.ob-step-dot')];
  const visibleCount = onboardingMode === 'reconfigure' ? 2 : 3;
  dots.forEach((dot, i) => {
    const show = i < visibleCount;
    dot.style.display = show ? '' : 'none';
    if (!show) return;
    dot.classList.toggle('done', i < idx);
    dot.classList.toggle('current', i === idx);
  });
}

function updateOnboardingChrome() {
  const view = document.getElementById('onboardingView');
  if (view) view.classList.toggle('is-reconfigure', onboardingMode === 'reconfigure');

  const habitsBack = document.getElementById('obHabitsBackBtn');
  if (habitsBack) habitsBack.hidden = onboardingMode === 'reconfigure';

  const habitsHint = document.querySelector('#obStep-habits .ob-hint-box');
  if (habitsHint) {
    habitsHint.innerHTML = onboardingMode === 'reconfigure'
      ? '点一下可以增减习惯。头像和昵称请在「我的」里修改。'
      : '<strong>推荐</strong> 项已帮你选好，点一下可以增减。完成后每天点一下就能赚星星。';
  }

  const rewardsDoneBtn = document.getElementById('obRewardsDoneBtn');
  if (rewardsDoneBtn) {
    rewardsDoneBtn.textContent = onboardingMode === 'reconfigure' ? '保存习惯计划' : '开始星星计划';
  }
}

function renderOnboardingProfile() {
  document.getElementById('obPreviewAvatar').textContent = onboardingAvatar;
  document.getElementById('obPreviewName').textContent = onboardingName || '宝贝';
  const input = document.getElementById('obNameInput');
  if (input && document.activeElement !== input) input.value = onboardingName;

  const grid = document.getElementById('obAvatarGrid');
  if (!grid) return;
  grid.innerHTML = '';
  AVATAR_OPTIONS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ob-avatar-btn' + (em === onboardingAvatar ? ' selected' : '');
    btn.textContent = em;
    btn.onclick = () => {
      onboardingAvatar = em;
      renderOnboardingProfile();
    };
    grid.appendChild(btn);
  });
}

function onboardingHabitsFiltered() {
  const tasks = state.catalog?.tasks || [];
  if (onboardingHabitCat === 'all') return tasks;
  return tasks.filter(t => HABIT_CAT_BY_ID[t.id] === onboardingHabitCat);
}

function estimateOnboardingDailyStars() {
  const tasks = (state.catalog?.tasks || []).filter(t => onboardingHabits.has(t.id));
  if (!tasks.length) return { low: 0, high: 0 };
  const total = tasks.reduce((s, t) => s + t.pts, 0);
  const low = Math.max(8, Math.round(total * 0.55));
  const high = Math.max(low + 4, Math.round(total * 0.75));
  return { low, high };
}

function renderOnboardingHabitTabs() {
  const wrap = document.getElementById('obHabitTabs');
  if (!wrap) return;
  wrap.innerHTML = '';
  ONBOARDING_HABIT_CATS.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ob-cat-tab' + (onboardingHabitCat === cat.id ? ' active' : '');
    btn.textContent = cat.label;
    btn.onclick = () => {
      onboardingHabitCat = cat.id;
      renderOnboardingHabits();
    };
    wrap.appendChild(btn);
  });
}

function updateOnboardingHabitCount() {
  const n = onboardingHabits.size;
  const pill = document.getElementById('obHabitCount');
  if (!pill) return;
  pill.textContent = `已选 ${n} 项`;
  pill.classList.toggle('warn', n > ONBOARDING_HABIT_WARN || n < 3);
  const nextBtn = document.getElementById('obHabitsNextBtn');
  if (nextBtn) nextBtn.disabled = n < 1;
}

function toggleOnboardingHabit(id) {
  if (onboardingHabits.has(id)) {
    onboardingHabits.delete(id);
  } else {
    if (onboardingHabits.size >= ONBOARDING_HABIT_MAX) {
      toast('先选 5–8 个就好，太多做不过来哦', 'error');
      return;
    }
    onboardingHabits.add(id);
    if (onboardingHabits.size > ONBOARDING_HABIT_WARN) {
      toast('超过 10 个了，孩子可能会觉得太多', 'error');
    }
  }
  renderOnboardingHabits();
  updateOnboardingEconomyHint();
}

function buildOnboardingPickCard(item, selected, mode) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'ob-pick-card' + (selected ? ' selected' : '');
  const recommended = mode === 'habits' ? isRecommendedTask(item.id) : isRecommendedReward(item.id);
  card.innerHTML =
    `<span class="ob-pick-emoji">${item.emoji}</span>` +
    `<span class="ob-pick-info">` +
      `<span class="ob-pick-name">${item.name}</span>` +
      `<span class="ob-pick-meta">` +
        `<span class="ob-pick-pts ${mode === 'rewards' ? 'reward' : ''}">${mode === 'rewards' ? item.pts + ' 星' : '+' + item.pts + ' 星'}</span>` +
        (recommended ? '<span class="ob-badge">推荐</span>' : '') +
      `</span>` +
    `</span>` +
    `<span class="ob-check">✓</span>`;
  return card;
}

function renderOnboardingHabits() {
  renderOnboardingHabitTabs();
  const list = document.getElementById('obHabitList');
  if (!list) return;
  list.innerHTML = '';
  onboardingHabitsFiltered().forEach(item => {
    const card = buildOnboardingPickCard(item, onboardingHabits.has(item.id), 'habits');
    card.onclick = () => toggleOnboardingHabit(item.id);
    list.appendChild(card);
  });
  updateOnboardingHabitCount();
}

function updateOnboardingRewardCount() {
  const n = onboardingRewards.size;
  const pill = document.getElementById('obRewardCount');
  if (!pill) return;
  pill.textContent = `已选 ${n} 项`;
  pill.classList.toggle('warn', n > 6 || n < 2);
  const doneBtn = document.getElementById('obRewardsDoneBtn');
  if (doneBtn) doneBtn.disabled = n < 1;
}

function toggleOnboardingReward(id) {
  if (onboardingRewards.has(id)) {
    onboardingRewards.delete(id);
  } else {
    if (onboardingRewards.size >= ONBOARDING_REWARD_MAX) {
      toast('奖励选 3–5 个最合适', 'error');
      return;
    }
    onboardingRewards.add(id);
  }
  renderOnboardingRewards();
  updateOnboardingEconomyHint();
}

function renderOnboardingRewards() {
  const list = document.getElementById('obRewardList');
  if (!list) return;
  list.innerHTML = '';
  (state.catalog?.rewards || []).forEach(item => {
    const card = buildOnboardingPickCard(item, onboardingRewards.has(item.id), 'rewards');
    card.onclick = () => toggleOnboardingReward(item.id);
    list.appendChild(card);
  });
  updateOnboardingRewardCount();
}

function updateOnboardingEconomyHint() {
  const el = document.getElementById('obEconomyHint');
  if (!el) return;
  const { low, high } = estimateOnboardingDailyStars();
  el.innerHTML = `按你选的习惯估算：每天大约能攒 <strong>${low}–${high}</strong> 颗星星。`;
}

function renderOnboardingDone() {
  const habits = (state.catalog?.tasks || []).filter(t => onboardingHabits.has(t.id));
  const rewards = (state.catalog?.rewards || []).filter(r => onboardingRewards.has(r.id));
  const { low, high } = estimateOnboardingDailyStars();
  const snack = rewards.find(r => r.id === 'snack');
  const park = rewards.find(r => r.id === 'park');

  document.getElementById('obDoneGreet').textContent = `${onboardingName || '宝贝'}，今天开始攒星星吧！`;
  document.getElementById('obDoneHabitCount').textContent = habits.length;
  document.getElementById('obDoneRewardCount').textContent = rewards.length;

  document.getElementById('obDoneHabits').innerHTML = habits.map(h =>
    `<span class="ob-chip">${h.emoji} ${h.name}</span>`
  ).join('');

  document.getElementById('obDoneRewards').innerHTML = rewards.map(r =>
    `<span class="ob-chip">${r.emoji} ${r.name}</span>`
  ).join('');

  let economy = `每天大约 <span class="ob-num">${low}–${high}</span> 星。`;
  const avg = (low + high) / 2;
  if (snack && avg > 0) {
    economy += ` 小零食大约 <span class="ob-num">${(snack.pts / avg).toFixed(1)}</span> 天能换一次。`;
  }
  if (park && avg > 0) {
    economy += ` 去游乐场大约 <span class="ob-num">${Math.round(park.pts / avg)}</span> 天能换一次。`;
  }
  document.getElementById('obDoneEconomy').innerHTML = economy;
}

function renderOnboarding() {
  updateOnboardingChrome();
  renderOnboardingDots();
  ONBOARDING_STEPS.forEach(step => {
    const panel = document.getElementById('obStep-' + step);
    if (panel) panel.classList.toggle('active', step === onboardingStep);
  });

  if (onboardingStep === 'profile') renderOnboardingProfile();
  if (onboardingStep === 'habits') renderOnboardingHabits();
  if (onboardingStep === 'rewards') {
    renderOnboardingRewards();
    updateOnboardingEconomyHint();
  }
  if (onboardingStep === 'done') renderOnboardingDone();
}

function applyOnboardingSelections() {
  if (onboardingMode !== 'reconfigure') {
    state.profile = normalizeProfile({ name: onboardingName, avatar: onboardingAvatar });
  }
  (state.catalog?.tasks || []).forEach(t => {
    t.enabled = onboardingHabits.has(t.id);
  });
  (state.catalog?.rewards || []).forEach(r => {
    r.enabled = onboardingRewards.has(r.id);
  });
  const metaPatch = {
    onboardingDone: true,
    catalogUpdatedAt: Date.now(),
    updatedAt: Date.now()
  };
  if (onboardingMode !== 'reconfigure') {
    metaPatch.profileUpdatedAt = Date.now();
  }
  state.meta = { ...defaultMeta(), ...state.meta, ...metaPatch };
  save();
}

function onboardingProfileNext() {
  const name = (document.getElementById('obNameInput')?.value || '').trim();
  if (!name) {
    toast('请输入宝贝昵称', 'error');
    return;
  }
  onboardingName = name.slice(0, 12);
  setOnboardingStep('habits');
}

function onboardingHabitsNext() {
  if (onboardingHabits.size < 1) return;
  if (onboardingHabits.size > ONBOARDING_HABIT_WARN) {
    toast('建议先减到 10 个以内', 'error');
    return;
  }
  setOnboardingStep('rewards');
}

function onboardingRewardsDone() {
  if (onboardingRewards.size < 1) return;
  applyOnboardingSelections();
  if (onboardingMode === 'reconfigure') {
    toast('习惯计划已更新', 'success');
    finishOnboardingToApp();
    switchView('settings');
    render();
    return;
  }
  setOnboardingStep('done');
}

function onboardingEnterApp() {
  finishOnboardingToApp();
}

function onboardingRestoreHabits() {
  onboardingHabits = recommendedHabitIds();
  renderOnboardingHabits();
  updateOnboardingEconomyHint();
  toast('已恢复推荐习惯', 'success');
}

function onboardingRestoreRewards() {
  onboardingRewards = recommendedRewardIds();
  renderOnboardingRewards();
  updateOnboardingEconomyHint();
  toast('已恢复推荐奖励', 'success');
}

function initOnboardingEvents() {
  document.getElementById('obNameInput')?.addEventListener('input', e => {
    onboardingName = e.target.value.trim() || '宝贝';
    renderOnboardingProfile();
  });

  const actions = {
    'ob-profile-next': () => onboardingProfileNext(),
    'ob-habits-next': () => onboardingHabitsNext(),
    'ob-habits-back': () => setOnboardingStep('profile'),
    'ob-habits-restore': () => onboardingRestoreHabits(),
    'ob-rewards-done': () => onboardingRewardsDone(),
    'ob-rewards-back': () => setOnboardingStep('habits'),
    'ob-rewards-restore': () => onboardingRestoreRewards(),
    'ob-enter-app': () => onboardingEnterApp(),
  };

  document.addEventListener('click', e => {
    if (!isOnboardingVisible()) return;
    const el = e.target.closest('[data-ob-action]');
    if (!el) return;
    const fn = actions[el.dataset.obAction];
    if (fn) fn();
  });
}

initOnboardingEvents();
