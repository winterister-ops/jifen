// ====== 积分记录页面 + 日期筛选 ======

let selectedDateKey = ymd(new Date()); // 'YYYY-MM-DD' 或 'all'
let calYear, calMonth; // calMonth: 0-11

function ymd(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
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
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}
