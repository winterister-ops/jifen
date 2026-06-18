// ====== 状态与云同步 ======

let KEY = null;
let SORT_KEY = null;
let VIBRATION_KEY = null;
let state = defaultState();
let cloudRef = null;
let cloudUnsubscribe = null;
let applyingRemote = false;
let firebaseReady = false;
let cloudPushPending = false;
let renderTimer = null;

function scheduleRender() {
  if (typeof render !== 'function') return;
  if (renderTimer) return;
  renderTimer = requestAnimationFrame(() => {
    renderTimer = null;
    render();
  });
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
    id: h.id ?? '',
    emoji: h.emoji ?? '',
    name: h.name ?? '',
    delta: typeof h.delta === 'number' ? h.delta : 0,
    time: h.time ?? '',
    ts: typeof h.ts === 'number' ? h.ts : (entryDate(h)?.getTime() || 0),
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
      updatedAt: Math.max(local.meta.updatedAt, remote.meta.updatedAt)
    }
  };
}

function stateContentFingerprint(s) {
  const n = normalizeState(s);
  return JSON.stringify({
    score: n.score,
    history: n.history.map(h => h.eid + ':' + h.delta),
    profile: n.profile,
    revoked: [...n.revokedEids].sort(),
    lastClearAt: n.meta.lastClearAt,
    profileUpdatedAt: n.meta.profileUpdatedAt
  });
}

function stateContentEqual(a, b) {
  return stateContentFingerprint(a) === stateContentFingerprint(b);
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
  if (!KEY) return defaultState();
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.score === 'number') return normalizeState(d);
  } catch (e) {}
  return defaultState();
}

function saveLocal() {
  if (!KEY) return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

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
      if (!stateContentEqual(state, merged)) {
        applyingRemote = true;
        state = merged;
        saveLocal();
        scheduleRender();
        applyingRemote = false;
      }
    }
  });
}

function save() {
  saveLocal();
  pushToCloud();
}

let lastEnvStatus = null;

function setStatus(text, isDev) {
  lastEnvStatus = { text: text || '', dev: !!isDev };
  if (typeof renderAppMeta === 'function') renderAppMeta();
}

function getEnvStatus() {
  return lastEnvStatus || envStatusText();
}

function envStatusText() {
  if (ENV === 'prod') return { text: '线上', dev: false };
  return { text: '开发', dev: true };
}

function tearDownCloud() {
  if (renderTimer) {
    cancelAnimationFrame(renderTimer);
    renderTimer = null;
  }
  if (cloudRef && cloudUnsubscribe) {
    try { cloudRef.off('value', cloudUnsubscribe); } catch (e) { console.warn(e); }
  }
  cloudUnsubscribe = null;
  cloudRef = null;
}

function storageKeysForUser(uid) {
  KEY = STORAGE_PREFIX + uid;
  SORT_KEY = STORAGE_PREFIX + uid + '_sort';
  VIBRATION_KEY = STORAGE_PREFIX + uid + '_vibration';
  taskSort = SORT_MODES.includes(localStorage.getItem(SORT_KEY))
    ? localStorage.getItem(SORT_KEY) : 'default';
  vibrationEnabled = vibrationSupported && localStorage.getItem(VIBRATION_KEY) !== '0';
}

function cloudPathForUser(user) {
  return `users/${user.uid}/data`;
}

function initCloud() {
  tearDownCloud();
  if (!firebaseReady || !firebaseConfig.databaseURL || !currentUser) {
    const s = envStatusText();
    setStatus(s.text, s.dev);
    return;
  }
  try {
    cloudRef = firebase.database().ref(cloudPathForUser(currentUser));
    let first = true;
    cloudUnsubscribe = cloudRef.on('value', snap => {
      const val = snap.val();
      if (val && typeof val.score === 'number') {
        const merged = mergeStates(state, val);
        if (!stateContentEqual(state, merged)) {
          applyingRemote = true;
          state = merged;
          saveLocal();
          scheduleRender();
          applyingRemote = false;
          if (!stateContentEqual(merged, val)) {
            cloudRef.set(normalizeState(merged)).catch(err => console.warn('云同步合并回写失败', err));
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
      setStatus('离线', true);
    });
  } catch (e) {
    console.warn(e);
    setStatus('离线', true);
  }
}
