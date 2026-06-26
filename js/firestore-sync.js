// ====== Firestore 云同步（用户文档 + history 子集合） ======

const FS_HISTORY_PAGE_SIZE = 50;
const FS_BATCH_LIMIT = 400;

let firestoreActive = false;
let fsUserRef = null;
let fsUserUnsubscribe = null;
let fsHistoryCursor = null;
let fsHistoryHasMore = false;
let fsHistoryLoading = false;
let fsHistoryInitialLoaded = false;
let fsHistoryTotalCount = null;
let fsHistoryCountPromise = null;
let fsMigrationPromise = null;

function isFirestoreActive() {
  return firestoreActive;
}

function fsDb() {
  return firebase.firestore();
}

function fsUserDocRef(uid) {
  return fsDb().collection('users').doc(uid);
}

function fsHistoryColRef(uid) {
  return fsUserDocRef(uid).collection('history');
}

function stateToFirestoreUserDoc(s) {
  const n = normalizeState(s, false, { firestoreMode: true });
  return {
    score: n.score,
    profile: n.profile,
    catalog: n.catalog,
    meta: n.meta,
    revoked: { ...n.revoked },
  };
}

function firestoreUserDocToState(data, historyCache) {
  if (!data || typeof data.score !== 'number') return null;
  return normalizeState({
    score: data.score,
    profile: data.profile,
    catalog: data.catalog,
    meta: data.meta,
    revoked: data.revoked,
    history: historyCache || [],
  }, false, { firestoreMode: true });
}

function historyDocFromEntry(h, revokedKeys, lastClearAt) {
  const deleted = revokedKeys.has(h.eid)
    || !!(lastClearAt && (h.ts || 0) <= lastClearAt);
  return {
    eid: h.eid,
    id: h.id ?? '',
    emoji: h.emoji ?? '',
    name: h.name ?? '',
    delta: typeof h.delta === 'number' ? h.delta : 0,
    time: h.time ?? '',
    ts: typeof h.ts === 'number' ? h.ts : 0,
    deleted,
    deletedAt: deleted ? Date.now() : null,
  };
}

function historyEntryFromDoc(data) {
  if (!data || data.deleted) return null;
  return {
    eid: data.eid,
    id: data.id ?? '',
    emoji: data.emoji ?? '',
    name: data.name ?? '',
    delta: typeof data.delta === 'number' ? data.delta : 0,
    time: data.time ?? '',
    ts: typeof data.ts === 'number' ? data.ts : 0,
  };
}

function mergeUserDocs(localRaw, remoteRaw) {
  const local = normalizeState(localRaw, true);
  const remote = normalizeState(remoteRaw, true);
  const lastClearAt = Math.max(local.meta.lastClearAt, remote.meta.lastClearAt);
  const revoked = compactRevoked(mergeRevokedMaps(local.revoked, remote.revoked));
  const profile = local.meta.profileUpdatedAt >= remote.meta.profileUpdatedAt
    ? local.profile : remote.profile;
  const catalog = local.meta.catalogUpdatedAt >= remote.meta.catalogUpdatedAt
    ? normalizeCatalog(local.catalog) : normalizeCatalog(remote.catalog);
  const score = local.meta.updatedAt >= remote.meta.updatedAt
    ? local.score : remote.score;
  return {
    score,
    history: localRaw.history || [],
    profile,
    revoked,
    catalog,
    meta: {
      lastClearAt,
      profileUpdatedAt: Math.max(local.meta.profileUpdatedAt, remote.meta.profileUpdatedAt),
      catalogUpdatedAt: Math.max(local.meta.catalogUpdatedAt, remote.meta.catalogUpdatedAt),
      updatedAt: Math.max(local.meta.updatedAt, remote.meta.updatedAt),
      onboardingDone: !!(local.meta.onboardingDone || remote.meta.onboardingDone),
      firestoreMigratedAt: Math.max(
        local.meta.firestoreMigratedAt || 0,
        remote.meta.firestoreMigratedAt || 0
      ),
    },
  };
}

function readRtdbOnce(uid) {
  if (!firebaseConfig.databaseURL) return Promise.resolve(null);
  return ensureFirebaseDatabase().then(() => {
    return firebase.database().ref('users/' + uid + '/data').once('value')
      .then(snap => snap.val());
  }).catch(err => {
    console.warn('读取 RTDB 迁移数据失败', err);
    return null;
  });
}

function writeHistoryBatch(uid, history, revoked, lastClearAt) {
  const revokedKeys = revokedSet(revoked);
  const col = fsHistoryColRef(uid);
  let batch = fsDb().batch();
  let count = 0;
  const commits = [];

  function flushBatch() {
    if (!count) return Promise.resolve();
    const current = batch;
    commits.push(current.commit());
    batch = fsDb().batch();
    count = 0;
  }

  const tasks = [];
  (history || []).forEach(h => {
    if (!h || !h.eid) return;
    const ref = col.doc(h.eid);
    batch.set(ref, historyDocFromEntry(h, revokedKeys, lastClearAt), { merge: true });
    count++;
    if (count >= FS_BATCH_LIMIT) tasks.push(flushBatch());
  });
  tasks.push(flushBatch());
  return Promise.all(tasks).then(() => Promise.all(commits));
}

function migrateStateToFirestore(uid, mergedState) {
  const doc = stateToFirestoreUserDoc(mergedState);
  doc.meta = {
    ...doc.meta,
    firestoreMigratedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const fullHistory = parseHistoryList(mergedState.history).map((h, i) => ({
    ...h,
    eid: h.eid || historyEid(h, i),
    ts: typeof h.ts === 'number' ? h.ts : (entryDate(h)?.getTime() || 0),
  }));
  return fsUserDocRef(uid).set(doc)
    .then(() => writeHistoryBatch(uid, fullHistory, mergedState.revoked, doc.meta.lastClearAt));
}

function ensureFirestoreMigrated(uid) {
  if (fsMigrationPromise) return fsMigrationPromise;
  fsMigrationPromise = fsUserDocRef(uid).get().then(snap => {
    if (snap.exists && snap.data()?.meta?.firestoreMigratedAt) return false;

    return readRtdbOnce(uid).then(rtdbVal => {
      const merged = mergeStates(state, rtdbVal || {});
      return migrateStateToFirestore(uid, merged).then(() => {
        state = {
          ...merged,
          history: [],
          meta: {
            ...defaultMeta(),
            ...merged.meta,
            firestoreMigratedAt: Date.now(),
            updatedAt: Date.now(),
          },
        };
        saveLocal();
        return true;
      });
    });
  }).catch(err => {
    console.warn('Firestore 迁移失败', err);
    fsMigrationPromise = null;
    throw err;
  });
  return fsMigrationPromise;
}

function historyCountQuery(uid, lastClearAt) {
  let q = fsHistoryColRef(uid).where('deleted', '==', false);
  if (lastClearAt > 0) q = q.where('ts', '>', lastClearAt);
  return q;
}

function historyQuery(uid, lastClearAt) {
  return historyCountQuery(uid, lastClearAt)
    .orderBy('ts', 'desc')
    .orderBy('eid', 'desc');
}

function invalidateHistoryTotalCount() {
  fsHistoryTotalCount = null;
  fsHistoryCountPromise = null;
}

function fetchHistoryTotalCountFromFirestore() {
  if (!firestoreActive || !currentUser) {
    fsHistoryTotalCount = 0;
    return Promise.resolve(0);
  }
  const lastClearAt = state.meta?.lastClearAt || 0;
  const q = historyCountQuery(currentUser.uid, lastClearAt);
  // count() 聚合查询只存在于 modular SDK，compat 版没有该方法（会抛
  // “q.count is not a function”并导致初始化失败、页面误判离线）。这里改用
  // 普通查询读取匹配文档数；任何失败都降级返回，绝不向上抛出。
  let getPromise;
  try {
    getPromise = q.get();
  } catch (err) {
    console.warn('历史条数统计失败', err);
    return Promise.resolve(fsHistoryTotalCount);
  }
  return getPromise.then(snap => {
    fsHistoryTotalCount = snap.size;
    return fsHistoryTotalCount;
  }).catch(err => {
    console.warn('历史条数统计失败', err);
    return fsHistoryTotalCount;
  });
}

function ensureHistoryTotalCountFromFirestore() {
  if (fsHistoryTotalCount !== null) return Promise.resolve(fsHistoryTotalCount);
  if (fsHistoryCountPromise) return fsHistoryCountPromise;
  fsHistoryCountPromise = fetchHistoryTotalCountFromFirestore().finally(() => {
    fsHistoryCountPromise = null;
  });
  return fsHistoryCountPromise;
}

function getHistoryTotalCountFromFirestore() {
  return fsHistoryTotalCount;
}

function bumpHistoryTotalCount(delta) {
  if (fsHistoryTotalCount !== null && delta) {
    fsHistoryTotalCount = Math.max(0, fsHistoryTotalCount + delta);
  }
}

function mapHistorySnapshot(snap) {
  const items = [];
  snap.forEach(doc => {
    const entry = historyEntryFromDoc(doc.data());
    if (entry) items.push(entry);
  });
  items.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const docs = snap.docs;
  return {
    items,
    lastDoc: docs.length ? docs[docs.length - 1] : null,
    hasMore: snap.size === FS_HISTORY_PAGE_SIZE,
  };
}

function reloadHistoryFromFirestore(reset) {
  if (!firestoreActive || !currentUser) return Promise.resolve();
  if (reset) {
    fsHistoryCursor = null;
    fsHistoryHasMore = false;
  }
  const lastClearAt = state.meta?.lastClearAt || 0;
  let q = historyQuery(currentUser.uid, lastClearAt).limit(FS_HISTORY_PAGE_SIZE);
  return q.get().then(snap => {
    const page = mapHistorySnapshot(snap);
    state.history = page.items;
    fsHistoryCursor = page.lastDoc;
    fsHistoryHasMore = page.hasMore;
    fsHistoryInitialLoaded = true;
    if (typeof invalidateHistoryDateKeysCache === 'function') invalidateHistoryDateKeysCache();
    return fetchHistoryTotalCountFromFirestore().then(() => page);
  }).catch(err => {
    fsHistoryInitialLoaded = true;
    console.warn('加载历史失败', err);
    if (typeof scheduleRender === 'function') scheduleRender();
    throw err;
  });
}

function loadMoreHistoryFromFirestore() {
  if (!firestoreActive || !currentUser || !fsHistoryHasMore || fsHistoryLoading) {
    return Promise.resolve(false);
  }
  fsHistoryLoading = true;
  const lastClearAt = state.meta?.lastClearAt || 0;
  let q = historyQuery(currentUser.uid, lastClearAt)
    .limit(FS_HISTORY_PAGE_SIZE);
  if (fsHistoryCursor) q = q.startAfter(fsHistoryCursor);
  return q.get().then(snap => {
    const page = mapHistorySnapshot(snap);
    const byEid = new Map();
    [...page.items, ...state.history].forEach(h => byEid.set(h.eid, h));
    state.history = [...byEid.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    fsHistoryCursor = page.lastDoc || fsHistoryCursor;
    fsHistoryHasMore = page.hasMore;
    fsHistoryLoading = false;
    if (typeof invalidateHistoryDateKeysCache === 'function') invalidateHistoryDateKeysCache();
    return true;
  }).catch(err => {
    fsHistoryLoading = false;
    console.warn('加载更多历史失败', err);
    return false;
  });
}

function loadHistoryUntilDateKey(dateKey) {
  if (!firestoreActive || !currentUser) return Promise.resolve();
  const maxRounds = 50;
  let rounds = 0;
  function needsMore() {
    if (typeof historyFirstIndexForDateKey !== 'function') return false;
    return historyFirstIndexForDateKey(dateKey) < 0 && fsHistoryHasMore;
  }
  function step() {
    if (!needsMore() || rounds >= maxRounds) return Promise.resolve();
    rounds++;
    return loadMoreHistoryFromFirestore().then(step);
  }
  return step();
}

function queryHistoryDayStatsFromFirestore(startTs, endTs) {
  if (!firestoreActive || !currentUser) return Promise.resolve(new Map());
  const lastClearAt = state.meta?.lastClearAt || 0;
  const minTs = Math.max(startTs, lastClearAt + 1);
  if (minTs > endTs) return Promise.resolve(new Map());

  return fsHistoryColRef(currentUser.uid)
    .where('deleted', '==', false)
    .where('ts', '>=', minTs)
    .where('ts', '<=', endTs)
    .get()
    .then(snap => {
      const stats = new Map();
      snap.forEach(doc => {
        const entry = historyEntryFromDoc(doc.data());
        if (!entry) return;
        const key = entryDateKey(entry);
        if (key === 'unknown') return;
        let stat = stats.get(key);
        if (!stat) {
          stat = { earn: false, spend: false };
          stats.set(key, stat);
        }
        if (entry.delta > 0) stat.earn = true;
        else if (entry.delta < 0) stat.spend = true;
      });
      return stats;
    });
}

function writeHistoryEntryToFirestore(entry) {
  if (!firestoreActive || !currentUser || !entry?.eid) return Promise.resolve();
  const doc = historyDocFromEntry(entry, new Set(), 0);
  doc.deleted = false;
  doc.deletedAt = null;
  return fsHistoryColRef(currentUser.uid).doc(entry.eid).set(doc, { merge: true });
}

function softDeleteHistoryInFirestore(eids) {
  if (!firestoreActive || !currentUser || !eids.length) return Promise.resolve();
  const batch = fsDb().batch();
  const ts = Date.now();
  eids.forEach(eid => {
    if (!eid) return;
    batch.set(fsHistoryColRef(currentUser.uid).doc(eid), {
      deleted: true,
      deletedAt: ts,
    }, { merge: true });
  });
  return batch.commit();
}

function pushUserDocToFirestore() {
  if (!firestoreActive || !fsUserRef) return Promise.resolve();
  const doc = stateToFirestoreUserDoc(state);
  return fsUserRef.set(doc, { merge: true });
}

function tearDownFirestoreCloud() {
  if (fsUserUnsubscribe) {
    try { fsUserUnsubscribe(); } catch (e) { console.warn(e); }
  }
  fsUserUnsubscribe = null;
  fsUserRef = null;
  firestoreActive = false;
  fsHistoryCursor = null;
  fsHistoryHasMore = false;
  fsHistoryLoading = false;
  fsHistoryInitialLoaded = false;
  fsHistoryTotalCount = null;
  fsHistoryCountPromise = null;
  fsMigrationPromise = null;
}

function attachFirestoreUserListener() {
  fsUserRef = fsUserDocRef(currentUser.uid);
  fsUserUnsubscribe = fsUserRef.onSnapshot(snap => {
    const data = snap.data();
    if (!data || typeof data.score !== 'number') return;
    const prevClearAt = state.meta?.lastClearAt || 0;
    const merged = mergeUserDocs(state, {
      ...data,
      history: state.history,
    });
    const clearAtChanged = (merged.meta?.lastClearAt || 0) !== prevClearAt;
    if (clearAtChanged) invalidateHistoryTotalCount();
    if (!userDocContentEqual(state, merged)) {
      applyingRemote = true;
      state = merged;
      if (typeof invalidateLastEarnByTaskId === 'function') invalidateLastEarnByTaskId();
      saveLocal();
      scheduleRender();
      applyingRemote = false;
    }
    if (clearAtChanged) {
      ensureHistoryTotalCountFromFirestore().then(() => {
        if (typeof scheduleRender === 'function') scheduleRender();
      });
    }
    lastSyncedCloud = stateToFirestoreUserDoc(merged);
    const s = envStatusText();
    setStatus(s.text, s.dev);
  }, err => {
    console.warn(err);
    setStatus('离线', true);
  });
}

function userDocContentEqual(a, b) {
  const da = stateToFirestoreUserDoc(a);
  const db = stateToFirestoreUserDoc(b);
  if (da.score !== db.score) return false;
  if (JSON.stringify(da.profile) !== JSON.stringify(db.profile)) return false;
  if (JSON.stringify(da.catalog) !== JSON.stringify(db.catalog)) return false;
  if (da.meta.lastClearAt !== db.meta.lastClearAt) return false;
  if (da.meta.profileUpdatedAt !== db.meta.profileUpdatedAt) return false;
  if (da.meta.catalogUpdatedAt !== db.meta.catalogUpdatedAt) return false;
  if (da.meta.onboardingDone !== db.meta.onboardingDone) return false;
  if (revokedFingerprint(da.revoked) !== revokedFingerprint(db.revoked)) return false;
  return true;
}

function initFirestoreCloud() {
  tearDownFirestoreCloud();
  if (!firebaseReady || !firebaseConfig.projectId || !currentUser) {
    const s = envStatusText();
    setStatus(s.text, s.dev);
    return Promise.resolve();
  }

  return ensureFirebaseFirestore().then(() => {
    return ensureFirestoreMigrated(currentUser.uid).then(() => {
      firestoreActive = true;
      return fsUserDocRef(currentUser.uid).get();
    }).then(snap => {
      if (snap.exists) {
        const remote = firestoreUserDocToState(snap.data(), state.history);
        if (remote) {
          const merged = mergeUserDocs(state, remote);
          state = merged;
          saveLocal();
        }
      } else {
        return pushUserDocToFirestore();
      }
    }).then(() => reloadHistoryFromFirestore(true))
      .then(() => {
        attachFirestoreUserListener();
        lastSyncedCloud = stateToFirestoreUserDoc(state);
        if (cloudPushDirty) schedulePushToCloud();
        const s = envStatusText();
        setStatus(s.text, s.dev);
        if (typeof scheduleRender === 'function') scheduleRender();
      });
  }).catch(err => {
    console.warn('Firestore 初始化失败', err);
    setStatus('离线', true);
    if (typeof scheduleRender === 'function') scheduleRender();
  });
}

function historyHasMoreInFirestore() {
  return fsHistoryHasMore;
}

function historyIsLoadingFromFirestore() {
  return fsHistoryLoading;
}

function historyInitialLoadedInFirestore() {
  return fsHistoryInitialLoaded;
}
