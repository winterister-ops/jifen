// ====== 状态与云同步 ======

const CLOUD_PUSH_DEBOUNCE_MS = 400;
const REVOKED_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

let KEY = null;
let state = defaultState();
let cloudRef = null;
let cloudUnsubscribe = null;
let applyingRemote = false;
let firebaseReady = false;
let cloudPushPending = false;
let cloudPushDirty = false;
let cloudPushTimer = null;
let lastSyncedCloud = null;
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
  return {
    lastClearAt: 0,
    profileUpdatedAt: 0,
    catalogUpdatedAt: 0,
    scoreUpdatedAt: 0,
    updatedAt: 0,
    onboardingDone: false,
    firestoreMigratedAt: 0,
  };
}

function needsOnboarding(s) {
  if (typeof window !== 'undefined' && window.__testFlags?.skipOnboarding) return false;
  const st = s || state;
  if (!st || !st.meta) return false;
  if (st.meta.onboardingDone === true) return false;
  if ((st.history || []).length > 0) return false;
  if (st.meta.catalogUpdatedAt > 0) return false;
  if (st.meta.profileUpdatedAt > 0) return false;
  return true;
}

function defaultCatalog() {
  return {
    tasks: DEFAULT_TASKS.map(t => ({ ...t })),
    rewards: DEFAULT_REWARDS.map(r => ({ ...r }))
  };
}

function presetTaskIds() {
  return new Set(DEFAULT_TASKS.map(t => t.id));
}

function presetRewardIds() {
  return new Set(DEFAULT_REWARDS.map(r => r.id));
}

function normalizeCatalogItem(item, presetIds) {
  if (!item || typeof item.id !== 'string' || !item.id) return null;
  const name = typeof item.name === 'string' ? item.name.trim().slice(0, 20) : '';
  if (!name) return null;
  const pts = Math.max(1, Math.min(999, Math.round(Number(item.pts) || 1)));
  const preset = presetIds.has(item.id);
  return {
    id: item.id,
    emoji: typeof item.emoji === 'string' && item.emoji ? firstEmojiOrDefault(item.emoji) : '⭐',
    name,
    pts,
    enabled: item.enabled !== false,
    preset
  };
}

function normalizeCatalogList(rawList, defaults, presetIds) {
  const byId = new Map();
  (Array.isArray(rawList) ? rawList : []).forEach(item => {
    const n = normalizeCatalogItem(item, presetIds);
    if (n) byId.set(n.id, n);
  });
  const list = defaults.map(def => {
    const existing = byId.get(def.id);
    return existing ? { ...existing, preset: true } : { ...def };
  });
  byId.forEach((item, id) => {
    if (!presetIds.has(id)) list.push(item);
  });
  return list;
}

function normalizeCatalog(raw) {
  const base = raw && typeof raw === 'object' ? raw : {};
  return {
    tasks: normalizeCatalogList(base.tasks, DEFAULT_TASKS, presetTaskIds()),
    rewards: normalizeCatalogList(base.rewards, DEFAULT_REWARDS, presetRewardIds())
  };
}

function defaultState() {
  return { score: 0, history: [], profile: defaultProfile(), revoked: {}, catalog: defaultCatalog(), meta: defaultMeta() };
}

function normalizeRevoked(raw) {
  if (raw && typeof raw.revoked === 'object' && !Array.isArray(raw.revoked)) {
    const out = {};
    Object.entries(raw.revoked).forEach(([eid, ts]) => {
      if (eid) out[eid] = typeof ts === 'number' ? ts : 0;
    });
    return out;
  }
  const out = {};
  (Array.isArray(raw?.revokedEids) ? raw.revokedEids : []).forEach(eid => {
    if (!eid) return;
    out[eid] = Date.now();
  });
  return out;
}

function compactRevoked(revoked) {
  const ageCutoff = Date.now() - REVOKED_MAX_AGE_MS;
  const out = {};
  Object.entries(revoked).forEach(([eid, ts]) => {
    const t = typeof ts === 'number' ? ts : 0;
    if (t >= ageCutoff) out[eid] = t;
  });
  return out;
}

function mergeRevokedMaps(a, b) {
  const out = { ...normalizeRevoked({ revoked: a }) };
  Object.entries(normalizeRevoked({ revoked: b })).forEach(([eid, ts]) => {
    out[eid] = Math.max(out[eid] || 0, ts);
  });
  return out;
}

function revokedSet(revoked) {
  return new Set(Object.keys(revoked || {}));
}

function parseHistoryList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return Object.values(raw);
  return [];
}

function historyToCloudMap(history) {
  const map = {};
  (history || []).forEach(h => {
    if (h && h.eid) map[h.eid] = h;
  });
  return map;
}

function stateToCloudBlob(s) {
  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) {
    return stateToFirestoreUserDoc(s);
  }
  const n = normalizeState(s);
  return {
    score: n.score,
    profile: n.profile,
    catalog: n.catalog,
    meta: n.meta,
    revoked: { ...n.revoked },
    history: historyToCloudMap(n.history)
  };
}

function applyCloudPatch(base, patch) {
  const next = base ? JSON.parse(JSON.stringify(base)) : {};
  Object.entries(patch || {}).forEach(([path, val]) => {
    const slash = path.indexOf('/');
    if (slash === -1) {
      if (val === null) delete next[path];
      else next[path] = val;
      return;
    }
    const top = path.slice(0, slash);
    const key = path.slice(slash + 1);
    if (!next[top] || typeof next[top] !== 'object') next[top] = {};
    if (val === null) delete next[top][key];
    else next[top][key] = val;
  });
  return next;
}

function buildCloudPatch(prev, next) {
  const patch = {};
  let hasStructuralChange = false;

  if (!prev || prev.score !== next.score) patch.score = next.score;

  if (!prev || JSON.stringify(prev.profile) !== JSON.stringify(next.profile)) {
    patch.profile = next.profile;
    hasStructuralChange = true;
  }
  if (!prev || JSON.stringify(prev.catalog) !== JSON.stringify(next.catalog)) {
    patch.catalog = next.catalog;
    hasStructuralChange = true;
  }

  const prevMeta = (prev && prev.meta) || {};
  const nextMeta = next.meta || {};
  const metaConflict = !prev
    || prevMeta.lastClearAt !== nextMeta.lastClearAt
    || prevMeta.profileUpdatedAt !== nextMeta.profileUpdatedAt
    || prevMeta.catalogUpdatedAt !== nextMeta.catalogUpdatedAt;
  if (metaConflict) {
    patch.meta = next.meta;
    hasStructuralChange = true;
  } else if (prevMeta.updatedAt !== nextMeta.updatedAt) {
    patch.meta = next.meta;
  }

  const prevRev = (prev && prev.revoked) || {};
  const nextRev = next.revoked || {};
  Object.keys(nextRev).forEach(eid => {
    if (prevRev[eid] !== nextRev[eid]) patch['revoked/' + eid] = nextRev[eid];
  });
  Object.keys(prevRev).forEach(eid => {
    if (!(eid in nextRev)) patch['revoked/' + eid] = null;
  });
  if (Object.keys(patch).some(k => k.startsWith('revoked/'))) hasStructuralChange = true;

  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) {
    return { patch, incremental: !hasStructuralChange };
  }

  const prevHist = (prev && prev.history) || {};
  const nextHist = next.history || {};
  Object.keys(nextHist).forEach(eid => {
    if (JSON.stringify(prevHist[eid]) !== JSON.stringify(nextHist[eid])) {
      patch['history/' + eid] = nextHist[eid];
    }
  });
  Object.keys(prevHist).forEach(eid => {
    if (!(eid in nextHist)) patch['history/' + eid] = null;
  });

  return { patch, incremental: !hasStructuralChange };
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

function touchScoreMeta() {
  const now = Date.now();
  state.meta = { ...defaultMeta(), ...state.meta, scoreUpdatedAt: now, updatedAt: now };
}

function scoreAuthoredAt(meta) {
  if (!meta) return 0;
  if (typeof meta.scoreUpdatedAt === 'number' && meta.scoreUpdatedAt > 0) return meta.scoreUpdatedAt;
  return 0;
}

function pickMergedScore(local, remote) {
  const localScoreAt = scoreAuthoredAt(local.meta);
  const remoteScoreAt = scoreAuthoredAt(remote.meta);
  if (localScoreAt > 0 || remoteScoreAt > 0) {
    return localScoreAt >= remoteScoreAt ? local.score : remote.score;
  }
  return (local.meta.updatedAt || 0) >= (remote.meta.updatedAt || 0)
    ? local.score : remote.score;
}

function touchCatalogMeta() {
  state.meta = { ...defaultMeta(), ...state.meta, catalogUpdatedAt: Date.now(), updatedAt: Date.now() };
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

function recomputeScore(history, lastClearAt, revoked) {
  return applyClearAndRevoked(history, lastClearAt, revokedSet(revoked))
    .reduce((s, h) => s + h.delta, 0);
}

function normalizeState(raw, forMerge, options) {
  const firestoreMode = !!(options && options.firestoreMode);
  if (!raw || typeof raw.score !== 'number') return defaultState();
  const history = parseHistoryList(raw.history).map((h, i) => ({
    id: h.id ?? '',
    emoji: h.emoji ?? '',
    name: h.name ?? '',
    delta: typeof h.delta === 'number' ? h.delta : 0,
    time: h.time ?? '',
    ts: typeof h.ts === 'number' ? h.ts : (entryDate(h)?.getTime() || 0),
    eid: historyEid(h, i)
  }));
  const meta = { ...defaultMeta(), ...(raw.meta || {}) };
  let revoked = normalizeRevoked(raw);
  const profile = normalizeProfile(raw.profile);
  const catalog = normalizeCatalog(raw.catalog);
  if (forMerge) {
    return { score: raw.score, history, profile, revoked, catalog, meta };
  }
  revoked = compactRevoked(revoked);
  if (firestoreMode) {
    return {
      score: raw.score,
      history,
      profile,
      revoked,
      catalog,
      meta,
    };
  }
  const filtered = applyClearAndRevoked(history, meta.lastClearAt, revokedSet(revoked))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const score = recomputeScore(history, meta.lastClearAt, revoked);
  return { score, history: filtered, profile, revoked, catalog, meta };
}

function mergeStates(localRaw, remoteRaw) {
  const local = normalizeState(localRaw, true);
  const remote = normalizeState(remoteRaw, true);
  const lastClearAt = Math.max(local.meta.lastClearAt, remote.meta.lastClearAt);
  const revoked = compactRevoked(mergeRevokedMaps(local.revoked, remote.revoked));
  const revokedKeys = revokedSet(revoked);
  const byEid = new Map();
  [...local.history, ...remote.history].forEach(h => byEid.set(h.eid, h));
  const history = applyClearAndRevoked([...byEid.values()], lastClearAt, revokedKeys)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const score = history.reduce((s, h) => s + h.delta, 0);
  const profile = local.meta.profileUpdatedAt >= remote.meta.profileUpdatedAt
    ? local.profile : remote.profile;
  const catalog = local.meta.catalogUpdatedAt >= remote.meta.catalogUpdatedAt
    ? normalizeCatalog(local.catalog) : normalizeCatalog(remote.catalog);
  return {
    score,
    history,
    profile,
    revoked,
    catalog,
    meta: {
      lastClearAt,
      profileUpdatedAt: Math.max(local.meta.profileUpdatedAt, remote.meta.profileUpdatedAt),
      catalogUpdatedAt: Math.max(local.meta.catalogUpdatedAt, remote.meta.catalogUpdatedAt),
      updatedAt: Math.max(local.meta.updatedAt, remote.meta.updatedAt),
      onboardingDone: !!(local.meta.onboardingDone || remote.meta.onboardingDone)
    }
  };
}

function revokedFingerprint(revoked) {
  return Object.keys(revoked || {}).sort().map(k => k + ':' + revoked[k]).join(',');
}

function catalogQuickSig(catalog) {
  if (!catalog) return '';
  const parts = [];
  (catalog.tasks || []).forEach(t => {
    parts.push('t' + t.id + ':' + t.pts + ':' + (t.enabled === false ? 0 : 1));
  });
  (catalog.rewards || []).forEach(r => {
    parts.push('r' + r.id + ':' + r.pts + ':' + (r.enabled === false ? 0 : 1));
  });
  return parts.join('|');
}

function stateContentQuickKey(s) {
  if (!s || typeof s.score !== 'number') return '';
  const h = parseHistoryList(s.history);
  const parts = [
    s.score,
    s.meta?.lastClearAt || 0,
    s.meta?.profileUpdatedAt || 0,
    s.meta?.catalogUpdatedAt || 0,
    s.profile?.name || '',
    s.profile?.avatar || '',
    revokedFingerprint(normalizeRevoked(s)),
    catalogQuickSig(s.catalog)
  ];
  if (!(typeof isFirestoreActive === 'function' && isFirestoreActive())) {
    parts.splice(1, 0, h.length);
    for (let i = 0; i < h.length; i++) {
      const item = h[i];
      parts.push((item.eid || historyEid(item, i)) + ':' + (item.delta || 0));
    }
  }
  return parts.join('\x1e');
}

function stateContentFullEqual(a, b) {
  const na = normalizeState(a);
  const nb = normalizeState(b);
  if (na.score !== nb.score) return false;
  if (na.meta.lastClearAt !== nb.meta.lastClearAt) return false;
  if (na.meta.profileUpdatedAt !== nb.meta.profileUpdatedAt) return false;
  if (na.meta.catalogUpdatedAt !== nb.meta.catalogUpdatedAt) return false;
  if (na.profile.name !== nb.profile.name || na.profile.avatar !== nb.profile.avatar) return false;
  if (revokedFingerprint(na.revoked) !== revokedFingerprint(nb.revoked)) return false;
  if (catalogQuickSig(na.catalog) !== catalogQuickSig(nb.catalog)) return false;
  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) return true;
  if (na.history.length !== nb.history.length) return false;
  for (let i = 0; i < na.history.length; i++) {
    const ah = na.history[i];
    const bh = nb.history[i];
    if (ah.eid !== bh.eid || ah.delta !== bh.delta) return false;
  }
  return true;
}

function stateContentFingerprint(s) {
  return stateContentQuickKey(s);
}

function stateContentEqual(a, b) {
  if (a === b) return true;
  const ka = stateContentQuickKey(a);
  const kb = stateContentQuickKey(b);
  if (ka && kb && ka === kb) return true;
  return stateContentFullEqual(a, b);
}

function stateFingerprint(s) {
  const n = normalizeState(s);
  return stateContentQuickKey(n) + '\x1f' + (n.meta?.updatedAt || 0);
}

function stateEqual(a, b) {
  return stateFingerprint(a) === stateFingerprint(b);
}

function loadLocal() {
  if (!KEY) return defaultState();
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d.score === 'number') {
      const firestoreMode = !!(d.meta && d.meta.firestoreMigratedAt);
      return normalizeState(d, false, { firestoreMode });
    }
  } catch (e) {}
  return defaultState();
}

function saveLocal() {
  if (!KEY) return;
  localStorage.setItem(KEY, JSON.stringify(state));
}

function finishCloudPush(error) {
  cloudPushPending = false;
  if (error) {
    console.warn('云同步写入失败', error);
    cloudPushDirty = true;
    schedulePushToCloud();
    return;
  }
  lastSyncedCloud = stateToCloudBlob(state);
  if (cloudPushDirty) schedulePushToCloud();
}

function pushToCloudFull(nextCloud) {
  cloudPushPending = true;
  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) {
    pushUserDocToFirestore()
      .then(() => finishCloudPush(null))
      .catch(err => finishCloudPush(err));
    return;
  }
  cloudRef.set(nextCloud)
    .then(() => finishCloudPush(null))
    .catch(err => finishCloudPush(err));
}

function pushToCloudTransaction() {
  cloudPushPending = true;
  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) {
    pushUserDocToFirestore()
      .then(() => finishCloudPush(null))
      .catch(err => finishCloudPush(err));
    return;
  }
  cloudRef.transaction(current => {
    const remote = current ? normalizeState(current, true) : null;
    const merged = remote ? mergeStates(state, current) : normalizeState(state);
    return stateToCloudBlob(merged);
  }, (error, committed, snapshot) => {
    if (error || !committed || !snapshot) {
      finishCloudPush(error || new Error('transaction not committed'));
      return;
    }
    finishCloudPush(null);
  });
}

function pushToCloudIncremental(patch) {
  cloudPushPending = true;
  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) {
    pushUserDocToFirestore()
      .then(() => finishCloudPush(null))
      .catch(err => finishCloudPush(err));
    return;
  }
  cloudRef.update(patch)
    .then(() => {
      lastSyncedCloud = applyCloudPatch(lastSyncedCloud, patch);
      finishCloudPush(null);
    })
    .catch(err => {
      console.warn('增量云同步失败，回退全量合并', err);
      cloudPushPending = false;
      pushToCloudTransaction();
    });
}

function flushPushToCloud() {
  cloudPushTimer = null;
  const cloudReady = (typeof isFirestoreActive === 'function' && isFirestoreActive())
    || cloudRef;
  if (!cloudPushDirty || !cloudReady || applyingRemote) return;
  if (cloudPushPending) {
    cloudPushTimer = setTimeout(flushPushToCloud, 80);
    return;
  }

  cloudPushDirty = false;
  const nextCloud = stateToCloudBlob(state);

  if (!lastSyncedCloud) {
    pushToCloudFull(nextCloud);
    return;
  }

  const { patch, incremental } = buildCloudPatch(lastSyncedCloud, nextCloud);
  if (!Object.keys(patch).length) return;

  if (incremental) {
    pushToCloudIncremental(patch);
  } else {
    pushToCloudTransaction();
  }
}

function schedulePushToCloud() {
  const cloudReady = (typeof isFirestoreActive === 'function' && isFirestoreActive())
    || cloudRef;
  if (!cloudReady || applyingRemote) return;
  cloudPushDirty = true;
  if (cloudPushTimer) return;
  cloudPushTimer = setTimeout(flushPushToCloud, CLOUD_PUSH_DEBOUNCE_MS);
}

function pushToCloud() {
  schedulePushToCloud();
}

function save() {
  const firestoreMode = typeof isFirestoreActive === 'function' && isFirestoreActive();
  state = normalizeState(state, false, { firestoreMode });
  if (typeof invalidateHistoryDateKeysCache === 'function') invalidateHistoryDateKeysCache();
  saveLocal();
  pushToCloud();
}

function appendHistoryEntry(entry) {
  state.history.push(entry);
  state.score += entry.delta;
  touchScoreMeta();
  if (typeof invalidateHistoryDateKeysCache === 'function') invalidateHistoryDateKeysCache();
  if (typeof isFirestoreActive === 'function' && isFirestoreActive()) {
    bumpHistoryTotalCount(1);
    writeHistoryEntryToFirestore(entry).catch(err => console.warn('历史写入失败', err));
  }
}

let lastEnvStatus = null;

function setStatus(text, isDev) {
  lastEnvStatus = { text: text || '', dev: !!isDev };
  if (typeof renderAppMeta === 'function') renderAppMeta();
}

function getEnvStatus() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { text: '离线', dev: false };
  }
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
  if (cloudPushTimer) {
    clearTimeout(cloudPushTimer);
    cloudPushTimer = null;
  }
  cloudPushPending = false;
  lastSyncedCloud = null;
  if (typeof tearDownFirestoreCloud === 'function') tearDownFirestoreCloud();
  if (cloudRef && cloudUnsubscribe) {
    try { cloudRef.off('value', cloudUnsubscribe); } catch (e) { console.warn(e); }
  }
  cloudUnsubscribe = null;
  cloudRef = null;
}

function storageKeysForUser(uid) {
  KEY = STORAGE_PREFIX + uid;
}

function cloudPathForUser(user) {
  return `users/${user.uid}/data`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (currentUser && typeof isFirestoreActive === 'function' && isFirestoreActive()) {
      const afterReconnect = () => {
        cloudPushDirty = true;
        schedulePushToCloud();
        if (typeof renderAppMeta === 'function') renderAppMeta();
      };
      if (typeof retryPendingHistoryWrites === 'function') {
        retryPendingHistoryWrites().finally(afterReconnect);
      } else {
        afterReconnect();
      }
    } else if (currentUser && typeof initCloud === 'function') {
      initCloud();
    } else if (typeof renderAppMeta === 'function') {
      renderAppMeta();
    }
  });
  window.addEventListener('offline', () => {
    if (typeof renderAppMeta === 'function') renderAppMeta();
  });
}

function initCloud() {
  tearDownCloud();
  if (!firebaseReady || !firebaseConfig.projectId || !currentUser) {
    const s = envStatusText();
    setStatus(s.text, s.dev);
    return;
  }
  initFirestoreCloud();
}
