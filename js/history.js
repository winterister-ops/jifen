// ====== 积分记录页面 + 日期筛选 + 多选编辑 ======

let selectedDateKey = ymd(new Date()); // 'YYYY-MM-DD' 或 'all'
let calYear, calMonth; // calMonth: 0-11
let historyEditMode = false;
let selectedEids = new Set();

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

function visibleHistoryWithEids() {
  return filteredHistory().map(log => {
    const index = state.history.indexOf(log);
    return { log, eid: logEid(log, index >= 0 ? index : 0) };
  });
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
  updateHistoryEditChrome();
  renderHistory();
}

function toggleHistorySelection(eid) {
  if (!historyEditMode) return;
  if (selectedEids.has(eid)) selectedEids.delete(eid);
  else selectedEids.add(eid);
  renderDateHeader();
  renderEditBar();
  document.querySelectorAll('.log[data-eid]').forEach(row => {
    row.classList.toggle('sel', selectedEids.has(row.dataset.eid));
    const cb = row.querySelector('.log-check input');
    if (cb) cb.checked = selectedEids.has(row.dataset.eid);
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
  const allBtn = document.getElementById('allToggle');
  const calBtn = document.getElementById('hpCalBtn');
  const todayBtn = document.getElementById('todayBtn');
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
  if (typeof updateBottomNav === 'function') updateBottomNav('history');

  const filterLocked = historyEditMode;
  [allBtn, calBtn, todayBtn].forEach(el => {
    if (!el) return;
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
  const allBtn = document.getElementById('allToggle');
  const todayBtn = document.getElementById('todayBtn');
  if (!titleEl) return;

  const list = filteredHistory();
  const showAll = selectedDateKey === 'all';
  titleEl.textContent = showAll ? '全部记录' : dateHeadLabel(selectedDateKey);

  if (statsEl) {
    if (historyEditMode) {
      const n = selectedEids.size;
      statsEl.textContent = n ? `已选 ${n} 条` : '点选要删除的记录';
    } else {
      statsEl.innerHTML = buildStats(list);
    }
  }

  if (allBtn) allBtn.classList.toggle('active', showAll);

  const todayKey = ymd(new Date());
  if (todayBtn) todayBtn.style.display = (selectedDateKey !== todayKey && selectedDateKey !== 'all') ? '' : 'none';

  updateHistoryEditChrome();
  if (historyEditMode) renderEditBar();
}

function selectDate(key) {
  selectedDateKey = key;
  if (historyEditMode) pruneSelection();
  renderDateHeader();
  renderHistory();
}

function toggleAllFilter() {
  if (historyEditMode) return;
  selectDate(selectedDateKey === 'all' ? ymd(new Date()) : 'all');
}

function goToToday() {
  if (historyEditMode) return;
  selectDate(ymd(new Date()));
}

function openCalendar() {
  if (historyEditMode) return;
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

function deleteHistoryRecords(eids) {
  const set = new Set(eids);
  if (!set.size) return;

  if (!Array.isArray(state.revokedEids)) state.revokedEids = [];
  let removedDelta = 0;

  state.history = state.history.filter((h, i) => {
    const eid = logEid(h, i);
    if (!set.has(eid)) return true;
    state.revokedEids.push(eid);
    removedDelta += h.delta;
    return false;
  });

  state.score -= removedDelta;
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

  let list = visibleHistoryWithEids();
  const showAll = selectedDateKey === 'all';

  if (!list.length) {
    const emptyMsg = historyEditMode
      ? `${ipIcon('inbox')}当前没有可删除的记录`
      : (showAll
        ? `${ipIcon('rocket')}还没有记录，快去做任务赚积分吧！`
        : `${ipIcon('inbox')}这一天还没有积分记录哦`);
    h.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    if (historyEditMode) renderEditBar();
    return;
  }

  h.innerHTML = '';
  let lastKey = null;
  list.slice().reverse().forEach(({ log, eid }) => {
    const key = entryDateKey(log);
    if (showAll && key !== lastKey) {
      lastKey = key;
      const head = document.createElement('div');
      head.className = 'date-head';
      head.textContent = dateHeadLabel(key);
      h.appendChild(head);
    }
    const row = document.createElement('div');
    const plus = log.delta > 0;
    const selected = selectedEids.has(eid);
    row.className = 'catalog-row' + (historyEditMode ? ' catalog-row-edit' : '') + (selected ? ' sel' : '');
    row.dataset.eid = eid;
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

      const nameSpan = document.createElement('span');
      nameSpan.className = 'catalog-name';
      nameSpan.textContent = log.name;

      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'catalog-pts ' + deltaClass;
      ptsSpan.textContent = deltaLabel;

      btn.append(emojiSpan, nameSpan, ptsSpan);
      btn.onclick = () => toggleHistorySelection(eid);
      row.append(label, btn);
    } else {
      const main = document.createElement('div');
      main.className = 'catalog-main catalog-main-static';

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'catalog-emoji';
      emojiSpan.textContent = log.emoji;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'catalog-name';
      nameSpan.textContent = log.name;

      const ptsSpan = document.createElement('span');
      ptsSpan.className = 'catalog-pts ' + deltaClass;
      ptsSpan.textContent = deltaLabel;

      main.append(emojiSpan, nameSpan, ptsSpan);
      row.appendChild(main);
    }
    h.appendChild(row);
  });

  if (historyEditMode) renderEditBar();
}

function nowStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
