// ====== 积分记录页面 + 日期定位 + 多选编辑 ======

const HISTORY_PAGE_SIZE = 50;

let focusedDateKey = null; // 日历高亮 / 滚动定位 'YYYY-MM-DD'
let calYear, calMonth; // calMonth: 0-11
let historyEditMode = false;
let selectedEids = new Set();
let historyAllLimit = HISTORY_PAGE_SIZE;
let historyDayStatsIndex = null;
let historyDateKeysMonthCache = { key: '', stats: null };
let historyReversedCache = null; // { items, dateFirstIndex }

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function entryDateKey(log) {
  const d = entryDate(log);
  return d ? ymd(d) : 'unknown';
}

function logEid(log, index) {
  return log.eid || historyEid(log, index);
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

function formatStatsHtml(count, net) {
  if (!count) return '暂无记录';
  const cls = net >= 0 ? 'plus' : 'minus';
  const sign = net > 0 ? '+' : '';
  return `共 ${count} 条 · 净 <span class="net ${cls}">${sign}${net}</span> ${ipIcon('star', 'ui-ic-sm')}`;
}

function buildStats(list) {
  if (!list.length) return '暂无记录';
  const net = list.reduce((s, x) => s + x.delta, 0);
  return formatStatsHtml(list.length, net);
}

function buildFirestoreStatsHtml() {
  const total = getHistoryTotalCountFromFirestore();
  const net = state.score;
  if (total !== null) return formatStatsHtml(total, net);
  if (!historyInitialLoadedInFirestore()) return '加载中…';
  ensureHistoryTotalCountFromFirestore().then(() => {
    if (typeof currentView !== 'undefined' && currentView === 'history') renderDateHeader();
  });
  const cls = net >= 0 ? 'plus' : 'minus';
  const sign = net > 0 ? '+' : '';
  return `共 … 条 · 净 <span class="net ${cls}">${sign}${net}</span> ${ipIcon('star', 'ui-ic-sm')}`;
}

function historyTimeLabel(log) {
  if (log.time) {
    const m = /(\d{1,2}:\d{2})\s*$/.exec(log.time.trim());
    if (m) return m[1];
    return log.time;
  }
  if (typeof log.ts === 'number' && log.ts > 0) {
    const d = new Date(log.ts);
    const p = n => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  return '';
}

function appendHistoryInfo(parent, log) {
  const info = document.createElement('span');
  info.className = 'catalog-info';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'catalog-name';
  nameSpan.textContent = log.name;

  const time = historyTimeLabel(log);
  if (time) {
    const timeSpan = document.createElement('span');
    timeSpan.className = 'catalog-time';
    timeSpan.textContent = time;
    info.append(nameSpan, timeSpan);
  } else {
    info.appendChild(nameSpan);
  }

  parent.appendChild(info);
}

function filteredHistory() {
  return state.history.slice();
}

function getHistoryReversedCache() {
  if (!historyReversedCache) {
    const items = historyEntriesWithEids(state.history);
    items.reverse();
    const dateFirstIndex = new Map();
    for (let i = 0; i < items.length; i++) {
      const key = entryDateKey(items[i].log);
      if (!dateFirstIndex.has(key)) dateFirstIndex.set(key, i);
    }
    historyReversedCache = { items, dateFirstIndex };
  }
  return historyReversedCache;
}

function historyReversedWithEids() {
  return getHistoryReversedCache().items;
}

function historyFirstIndexForDateKey(key) {
  const idx = getHistoryReversedCache().dateFirstIndex.get(key);
  return idx !== undefined ? idx : -1;
}

function historyDateHeadScrollTop(el, scrollEl) {
  const prev = scrollEl.scrollTop;
  if (prev !== 0) scrollEl.scrollTop = 0;
  const top = el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
  if (prev !== 0) scrollEl.scrollTop = prev;
  return top;
}

function scrollToHistoryDateHead(key) {
  const el = document.querySelector('#history .date-head[data-date="' + key + '"]');
  const scrollEl = document.getElementById('history');
  if (!el || !scrollEl) return;
  const top = Math.max(0, Math.ceil(historyDateHeadScrollTop(el, scrollEl)));
  scrollEl.scrollTop = top;
}

function updateHistoryStickyOffset() {
  const head = document.getElementById('hpStickyHead');
  const view = document.getElementById('historyView');
  if (!head || !view || view.style.display === 'none') return;
  const h = Math.ceil(head.getBoundingClientRect().height);
  view.style.setProperty('--hp-sticky-head-h', h + 'px');
}

function jumpToHistoryDate(key) {
  if (historyEditMode) return;
  const go = () => {
    const idx = historyFirstIndexForDateKey(key);
    if (idx < 0) {
      if (typeof toast === 'function') toast('这一天还没有积分记录哦');
      return;
    }
    focusedDateKey = key;
    const need = idx + 1;
    if (!isFirestoreActive() && need > historyAllLimit) {
      historyAllLimit = need;
      renderHistory();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToHistoryDateHead(key));
      });
      return;
    }
    renderDateHeader();
    scrollToHistoryDateHead(key);
  };

  if (isFirestoreActive() && historyFirstIndexForDateKey(key) < 0 && historyHasMoreInFirestore()) {
    loadHistoryUntilDateKey(key).then(() => {
      renderHistory();
      requestAnimationFrame(() => go());
    });
    return;
  }
  go();
}

function historyEntriesWithEids(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const log = items[i];
    out.push({ log, eid: log.eid || logEid(log, i) });
  }
  return out;
}

function visibleHistoryWithEids() {
  return historyEntriesWithEids(filteredHistory());
}

function visibleHistoryPage() {
  const items = historyReversedWithEids();
  const total = items.length;
  if (isFirestoreActive()) {
    return {
      items,
      hasMore: historyHasMoreInFirestore(),
      total: historyHasMoreInFirestore() ? total + 1 : total,
    };
  }
  return {
    items: items.slice(0, historyAllLimit),
    hasMore: total > historyAllLimit,
    total
  };
}

function loadMoreHistory() {
  if (isFirestoreActive()) {
    if (historyIsLoadingFromFirestore()) return;
    const p = loadMoreHistoryFromFirestore();
    renderHistory();
    p.then(() => renderHistory());
    return;
  }
  historyAllLimit += HISTORY_PAGE_SIZE;
  renderHistory();
}

function resetHistoryAllLimit() {
  historyAllLimit = HISTORY_PAGE_SIZE;
}

function invalidateHistoryDateKeysCache() {
  historyDayStatsIndex = null;
  historyDayStatsPromise = null;
  historyDateKeysMonthCache = { key: '', stats: null };
  historyReversedCache = null;
}

let historyDayStatsPromise = null;

function dayRangeTs(year, month, day) {
  const start = new Date(year, month, day, 0, 0, 0, 0).getTime();
  const end = new Date(year, month, day, 23, 59, 59, 999).getTime();
  return { start, end };
}

function buildHistoryDayStatsIndex() {
  const stats = new Map();
  const list = state.history;
  for (let i = 0; i < list.length; i++) {
    const key = entryDateKey(list[i]);
    if (key === 'unknown') continue;
    let stat = stats.get(key);
    if (!stat) {
      stat = { earn: false, spend: false };
      stats.set(key, stat);
    }
    if (list[i].delta > 0) stat.earn = true;
    else if (list[i].delta < 0) stat.spend = true;
  }
  return stats;
}

function ensureHistoryDayStatsIndex() {
  if (historyDayStatsIndex) return Promise.resolve(historyDayStatsIndex);
  if (!isFirestoreActive()) {
    historyDayStatsIndex = buildHistoryDayStatsIndex();
    return Promise.resolve(historyDayStatsIndex);
  }
  if (historyDayStatsPromise) return historyDayStatsPromise;
  const keys = weekCalKeys();
  const [y0, m0, d0] = keys[0].split('-').map(Number);
  const [y1, m1, d1] = keys[keys.length - 1].split('-').map(Number);
  const start = dayRangeTs(y0, m0 - 1, d0).start;
  const end = dayRangeTs(y1, m1 - 1, d1).end;
  historyDayStatsPromise = queryHistoryDayStatsFromFirestore(start, end).then(stats => {
    historyDayStatsIndex = stats;
    historyDayStatsPromise = null;
    return stats;
  });
  return historyDayStatsPromise;
}

function getHistoryDayStatsIndex() {
  if (!historyDayStatsIndex && !isFirestoreActive()) {
    historyDayStatsIndex = buildHistoryDayStatsIndex();
  }
  return historyDayStatsIndex || new Map();
}

function historyDayStatsForMonth(year, month) {
  const cacheKey = year + '-' + month;
  if (historyDateKeysMonthCache.key === cacheKey && historyDateKeysMonthCache.stats) {
    return historyDateKeysMonthCache.stats;
  }
  if (isFirestoreActive()) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const start = dayRangeTs(year, month, 1).start;
    const end = dayRangeTs(year, month, daysInMonth).end;
    queryHistoryDayStatsFromFirestore(start, end).then(stats => {
      historyDateKeysMonthCache = { key: cacheKey, stats };
      renderCalendar();
    });
    return historyDateKeysMonthCache.stats || new Map();
  }
  const prefix = year + '-' + String(month + 1).padStart(2, '0') + '-';
  const stats = new Map();
  getHistoryDayStatsIndex().forEach((stat, key) => {
    if (key.startsWith(prefix)) stats.set(key, stat);
  });
  historyDateKeysMonthCache = { key: cacheKey, stats };
  return stats;
}

function weekCalKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.push(ymd(d));
  }
  return keys;
}

function appendCalDayMarkers(cell, stat) {
  if (!stat || (!stat.earn && !stat.spend)) return;
  const marks = document.createElement('span');
  marks.className = 'cal-marks';
  if (stat.earn) {
    const dot = document.createElement('i');
    dot.className = 'dot earn';
    marks.appendChild(dot);
  }
  if (stat.spend) {
    const dot = document.createElement('i');
    dot.className = 'dot spend';
    marks.appendChild(dot);
  }
  cell.appendChild(marks);
}

function pruneSelection() {
  const visible = new Set(visibleHistoryWithEids().map(x => x.eid));
  selectedEids.forEach(eid => { if (!visible.has(eid)) selectedEids.delete(eid); });
}

function enterHistoryEdit() {
  if (!filteredHistory().length) return;
  historyEditMode = true;
  selectedEids.clear();
  updateHistoryEditChrome();
  renderHistory();
}

function exitHistoryEdit() {
  if (!historyEditMode) return;
  historyEditMode = false;
  selectedEids.clear();
  hideDeleteConfirmModal();
  document.body.classList.remove('history-editing');
  updateHistoryEditChrome();
  renderHistory();
}

function toggleHistorySelection(eid) {
  if (!historyEditMode) return;
  if (selectedEids.has(eid)) selectedEids.delete(eid);
  else selectedEids.add(eid);
  renderDateHeader();
  renderEditBar();
  document.querySelectorAll('.catalog-row[data-eid]').forEach(row => {
    const on = selectedEids.has(row.dataset.eid);
    row.classList.toggle('sel', on);
    row.setAttribute('aria-selected', on ? 'true' : 'false');
    const cb = row.querySelector('.catalog-check input');
    if (cb) cb.checked = on;
  });
}

function selectAllVisibleHistory() {
  if (!historyEditMode) return;
  const items = visibleHistoryWithEids();
  const allSelected = items.length > 0 && items.every(x => selectedEids.has(x.eid));
  if (allSelected) selectedEids.clear();
  else items.forEach(x => selectedEids.add(x.eid));
  renderDateHeader();
  renderHistory();
}

function updateHistoryEditChrome() {
  const editBtn = document.getElementById('historyEditBtn');
  const cancelBtn = document.getElementById('historyCancelEditBtn');
  const editBar = document.getElementById('hpEditBar');
  const weekExpand = document.getElementById('hpWeekCalExpand');
  const historyView = document.getElementById('historyView');
  const hasVisible = filteredHistory().length > 0;

  if (editBtn) {
    editBtn.style.display = historyEditMode ? 'none' : '';
    editBtn.disabled = !hasVisible;
    editBtn.style.opacity = hasVisible ? '' : '.45';
  }
  if (cancelBtn) cancelBtn.style.display = historyEditMode ? '' : 'none';
  if (editBar) editBar.style.display = historyEditMode ? '' : 'none';
  if (historyView) historyView.classList.toggle('history-editing', historyEditMode);
  document.body.classList.toggle('history-editing', historyEditMode && currentView === 'history');
  if (typeof updateBottomNav === 'function') updateBottomNav(currentView === 'history' ? 'history' : currentView);

  const filterLocked = historyEditMode;
  if (weekExpand) {
    weekExpand.disabled = filterLocked;
    weekExpand.style.opacity = filterLocked ? '.45' : '';
    weekExpand.style.pointerEvents = filterLocked ? 'none' : '';
  }
  document.querySelectorAll('.hp-weekcal-day').forEach(el => {
    el.disabled = filterLocked;
    el.style.opacity = filterLocked ? '.45' : '';
    el.style.pointerEvents = filterLocked ? 'none' : '';
  });
}

function renderEditBar() {
  const selectBtn = document.getElementById('hpSelectAllBtn');
  const deleteBtn = document.getElementById('hpDeleteBtn');
  if (!selectBtn || !deleteBtn) return;

  const items = visibleHistoryWithEids();
  const count = selectedEids.size;
  const allSelected = items.length > 0 && items.every(x => selectedEids.has(x.eid));

  selectBtn.textContent = allSelected ? '取消全选' : '全选';
  deleteBtn.disabled = count === 0;
  deleteBtn.textContent = count ? `删除 (${count})` : '删除';
  deleteBtn.classList.toggle('disabled', count === 0);
}

function renderDateHeader() {
  const titleEl = document.getElementById('hpDateTitle');
  const statsEl = document.getElementById('hpDateStats');
  if (!titleEl) return;

  const list = filteredHistory();
  titleEl.textContent = '全部记录';

  if (statsEl) {
    if (historyEditMode) {
      const n = selectedEids.size;
      statsEl.textContent = n ? `已选 ${n} 条` : '点选要删除的记录';
    } else {
      const statsHtml = isFirestoreActive() ? buildFirestoreStatsHtml() : buildStats(list);
      statsEl.innerHTML = statsHtml;
    }
  }

  renderWeekCalendar();
  updateHistoryEditChrome();
  updateHistoryStickyOffset();
  if (historyEditMode) renderEditBar();
}

function renderWeekCalendar() {
  const wrap = document.getElementById('hpWeekCalDays');
  if (!wrap) return;
  const paint = () => {
    wrap.innerHTML = '';
    const todayKey = ymd(new Date());
    const dayStats = getHistoryDayStatsIndex();
    weekCalKeys().forEach(key => {
      const [y, mo, da] = key.split('-').map(Number);
      const d = new Date(y, mo - 1, da);
      const stat = dayStats.get(key);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'hp-weekcal-day'
        + (key === todayKey ? ' today' : '')
        + (key === focusedDateKey ? ' sel' : '');
      cell.disabled = historyEditMode;

      const dow = document.createElement('span');
      dow.className = 'hp-weekcal-dow';
      dow.textContent = key === todayKey ? '今' : WEEKDAYS[d.getDay()].slice(-1);

      const num = document.createElement('span');
      num.className = 'hp-weekcal-num';
      num.textContent = da;

      cell.append(dow, num);
      appendCalDayMarkers(cell, stat);
      cell.onclick = () => jumpToHistoryDate(key);
      wrap.appendChild(cell);
    });
  };
  if (isFirestoreActive() && !historyDayStatsIndex) {
    ensureHistoryDayStatsIndex().then(paint);
    return;
  }
  paint();
}

function openCalendar() {
  if (historyEditMode) return;
  let base;
  if (focusedDateKey && focusedDateKey !== 'unknown') {
    const [y, m] = focusedDateKey.split('-').map(Number);
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
  jumpToHistoryDate(key);
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
  const dayStats = historyDayStatsForMonth(calYear, calMonth);

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
      + (key === focusedDateKey ? ' sel' : '');
    cell.textContent = day;
    appendCalDayMarkers(cell, dayStats.get(key));
    cell.onclick = () => calSelect(key);
    grid.appendChild(cell);
  }
}

function deleteHistoryRecords(eids) {
  const set = new Set(eids);
  if (!set.size) return;

  let removedDelta = 0;
  const remaining = [];
  for (let i = 0; i < state.history.length; i++) {
    const h = state.history[i];
    const eid = logEid(h, i);
    if (set.has(eid)) {
      removedDelta += h.delta;
      if (!isFirestoreActive()) {
        if (!state.revoked || typeof state.revoked !== 'object') state.revoked = {};
        state.revoked[eid] = Date.now();
      }
    } else {
      remaining.push(h);
    }
  }
  state.history = remaining;
  state.score -= removedDelta;

  if (isFirestoreActive()) {
    bumpHistoryTotalCount(-set.size);
    softDeleteHistoryInFirestore([...set]).catch(err => console.warn('历史删除同步失败', err));
  }

  invalidateHistoryDateKeysCache();
  if (typeof invalidateLastEarnByTaskId === 'function') invalidateLastEarnByTaskId();
  touchMeta();
  save();
}

function formatDeleteScoreHint(totalDelta) {
  const change = -totalDelta;
  if (change > 0) return `积分增加 ${change} 分`;
  if (change < 0) return `积分减少 ${Math.abs(change)} 分`;
  return '积分不变';
}

function showDeleteConfirmModal() {
  if (!selectedEids.size) return;
  const count = selectedEids.size;
  let delta = 0;
  state.history.forEach((h, i) => {
    const eid = logEid(h, i);
    if (selectedEids.has(eid)) delta += h.delta;
  });
  const scoreHint = formatDeleteScoreHint(delta);
  const msgEl = document.getElementById('deleteModalMsg');
  if (msgEl) {
    msgEl.textContent = count === 1
      ? `将删除 1 条记录，${scoreHint}。删除后无法恢复。`
      : `将删除 ${count} 条记录，合计${scoreHint}。删除后无法恢复。`;
  }
  document.getElementById('deleteModal').classList.add('show');
}

function hideDeleteConfirmModal() {
  document.getElementById('deleteModal').classList.remove('show');
}

function confirmDeleteSelected() {
  if (!selectedEids.size) return;
  const eids = [...selectedEids];
  hideDeleteConfirmModal();
  deleteHistoryRecords(eids);
  selectedEids.clear();
  if (!state.history.length) exitHistoryEdit();
  else render();
}

function renderHistory() {
  const h = document.getElementById('history');
  if (!h) return;
  renderDateHeader();

  const page = visibleHistoryPage();
  const list = page.items;

  if (!list.length) {
    let emptyMsg;
    if (isFirestoreActive() && !historyInitialLoadedInFirestore() && !historyEditMode) {
      emptyMsg = `${ipIcon('rocket')}正在加载记录…`;
    } else if (historyEditMode) {
      emptyMsg = `${ipIcon('inbox')}当前没有可删除的记录`;
    } else {
      emptyMsg = `${ipIcon('rocket')}还没有记录，快去做任务赚积分吧！`;
    }
    h.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    if (historyEditMode) renderEditBar();
    return;
  }

  h.innerHTML = '';
  let lastKey = null;
  list.forEach(({ log, eid }) => {
    const key = entryDateKey(log);
    if (key !== lastKey) {
      lastKey = key;
      const head = document.createElement('div');
      head.className = 'date-head';
      head.dataset.date = key;
      head.textContent = dateHeadLabel(key);
      h.appendChild(head);
    }
    const row = document.createElement('div');
    const plus = log.delta > 0;
    const selected = selectedEids.has(eid);
    row.className = 'catalog-row history-row'
      + (historyEditMode ? ' catalog-row-edit' : '')
      + (selected ? ' sel' : '');
    row.dataset.eid = eid;
    if (historyEditMode) row.setAttribute('aria-selected', selected ? 'true' : 'false');
    const deltaLabel = `${plus ? '+' : ''}${log.delta}`;
    const deltaClass = plus ? 'plus' : 'minus';

    if (historyEditMode) {
      const label = document.createElement('label');
      label.className = 'catalog-check';
      label.onclick = (e) => e.stopPropagation();

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected;
      input.onchange = () => toggleHistorySelection(eid);
      label.appendChild(input);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'catalog-main';

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'catalog-emoji';
      emojiSpan.textContent = log.emoji;
      btn.appendChild(emojiSpan);

      appendHistoryInfo(btn, log);

      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'catalog-pts ' + deltaClass;
      ptsSpan.textContent = deltaLabel;
      btn.appendChild(ptsSpan);

      btn.onclick = () => toggleHistorySelection(eid);
      row.append(label, btn);
    } else {
      const main = document.createElement('div');
      main.className = 'catalog-main catalog-main-static';

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'catalog-emoji';
      emojiSpan.textContent = log.emoji;
      main.appendChild(emojiSpan);

      appendHistoryInfo(main, log);

      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'catalog-pts ' + deltaClass;
      ptsSpan.textContent = deltaLabel;
      main.appendChild(ptsSpan);

      row.appendChild(main);
    }
    h.appendChild(row);
  });

  if (page.hasMore) {
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'filter-pill history-load-more';
    if (isFirestoreActive() && historyIsLoadingFromFirestore()) {
      moreBtn.textContent = '加载中…';
      moreBtn.disabled = true;
    } else {
      moreBtn.textContent = isFirestoreActive()
        ? '加载更多'
        : `加载更多（还剩 ${page.total - list.length} 条）`;
      moreBtn.onclick = () => loadMoreHistory();
    }
    h.appendChild(moreBtn);
  }

  if (historyEditMode) renderEditBar();
}

function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

