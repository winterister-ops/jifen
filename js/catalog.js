// ====== 任务 / 奖励目录管理 ======

let catalogManageType = 'tasks';
let catalogEditId = null;
let catalogEditEmoji = '⭐';

function getActiveTasks() {
  return (state.catalog?.tasks || []).filter(t => t.enabled);
}

function getActiveRewards() {
  return (state.catalog?.rewards || []).filter(r => r.enabled);
}

function catalogList(type) {
  return type === 'rewards' ? (state.catalog?.rewards || []) : (state.catalog?.tasks || []);
}

function findCatalogItem(type, id) {
  return catalogList(type).find(it => it.id === id) || null;
}

function sortItemsByPtsAsc(items) {
  return items.slice().sort((a, b) => a.pts - b.pts || a.name.localeCompare(b.name, 'zh-CN'));
}

function newCatalogId() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function openCatalogManage(type) {
  catalogManageType = type === 'rewards' ? 'rewards' : 'tasks';
  switchView(type === 'rewards' ? 'rewardManage' : 'taskManage');
}

function renderCatalogManage() {
  const type = catalogManageType;
  const listEl = document.getElementById(type === 'rewards' ? 'rewardManageList' : 'taskManageList');
  if (!listEl) return;
  const items = catalogList(type);
  const enabledCount = items.filter(it => it.enabled).length;
  const countEl = document.getElementById(type === 'rewards' ? 'rewardManageCount' : 'taskManageCount');
  if (countEl) countEl.textContent = `已启用 ${enabledCount} / 共 ${items.length} 项`;

  listEl.innerHTML = '';
  sortItemsByPtsAsc(items).forEach(it => {
    const row = document.createElement('div');
    row.className = 'catalog-row' + (it.enabled ? '' : ' disabled');
    row.innerHTML = `
      <button type="button" class="catalog-main" data-id="${it.id}">
        <span class="catalog-emoji">${it.emoji}</span>
        <span class="catalog-info">
          <span class="catalog-name">${it.name}${it.preset ? '<span class="catalog-badge">预设</span>' : ''}</span>
          <span class="catalog-pts">${type === 'rewards' ? '-' : '+'}${it.pts} 星星</span>
        </span>
        <span class="catalog-edit-ic">›</span>
      </button>
      <label class="toggle-switch catalog-toggle" onclick="event.stopPropagation()">
        <input type="checkbox" ${it.enabled ? 'checked' : ''} onchange="toggleCatalogItem('${type}', '${it.id}', this.checked)">
        <span class="toggle-slider"></span>
      </label>`;
    row.querySelector('.catalog-main').onclick = () => openCatalogEditModal(type, it.id);
    listEl.appendChild(row);
  });
}

function toggleCatalogItem(type, id, enabled) {
  const list = catalogList(type);
  const idx = list.findIndex(it => it.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], enabled: !!enabled };
  touchCatalogMeta();
  save();
  renderCatalogManage();
  render();
}

function openCatalogEditModal(type, id) {
  catalogManageType = type === 'rewards' ? 'rewards' : 'tasks';
  catalogEditId = id || null;
  const isNew = !id;
  const item = isNew
    ? { emoji: '⭐', name: '', pts: type === 'rewards' ? 10 : 5, preset: false }
    : findCatalogItem(type, id);
  if (!item && !isNew) return;

  catalogEditEmoji = item.emoji || '⭐';
  document.getElementById('catalogEditTitle').textContent =
    isNew ? (type === 'rewards' ? '添加奖励' : '添加任务') : (type === 'rewards' ? '编辑奖励' : '编辑任务');
  document.getElementById('catalogNameInput').value = item.name || '';
  document.getElementById('catalogPtsInput').value = item.pts || 5;
  document.getElementById('catalogDeleteBtn').style.display =
    (!isNew && !item.preset) ? '' : 'none';
  renderCatalogEmojiPicker();
  document.getElementById('catalogEditModal').classList.add('show');
  setTimeout(() => document.getElementById('catalogNameInput').focus(), 200);
}

function hideCatalogEditModal() {
  document.getElementById('catalogEditModal').classList.remove('show');
  catalogEditId = null;
}

function renderCatalogEmojiPicker() {
  const grid = document.getElementById('catalogEmojiPicker');
  if (!grid) return;
  grid.innerHTML = '';
  CATALOG_EMOJI_OPTIONS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-opt' + (em === catalogEditEmoji ? ' selected' : '');
    btn.textContent = em;
    btn.onclick = () => { catalogEditEmoji = em; renderCatalogEmojiPicker(); };
    grid.appendChild(btn);
  });
}

function saveCatalogEdit() {
  const type = catalogManageType;
  const name = document.getElementById('catalogNameInput').value.trim();
  if (!name) {
    toast('请输入名称', 'error');
    return;
  }
  const ptsRaw = parseInt(document.getElementById('catalogPtsInput').value, 10);
  const pts = Math.max(1, Math.min(999, isNaN(ptsRaw) ? 1 : ptsRaw));
  const list = catalogList(type);

  if (catalogEditId) {
    const idx = list.findIndex(it => it.id === catalogEditId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], name: name.slice(0, 20), pts, emoji: catalogEditEmoji };
  } else {
    list.push({
      id: newCatalogId(),
      emoji: catalogEditEmoji,
      name: name.slice(0, 20),
      pts,
      enabled: true,
      preset: false
    });
  }

  touchCatalogMeta();
  save();
  hideCatalogEditModal();
  renderCatalogManage();
  render();
  toast('已保存');
}

function deleteCatalogItem() {
  if (!catalogEditId) return;
  const type = catalogManageType;
  const item = findCatalogItem(type, catalogEditId);
  if (!item || item.preset) return;

  const list = catalogList(type);
  const idx = list.findIndex(it => it.id === catalogEditId);
  if (idx < 0) return;
  list.splice(idx, 1);

  touchCatalogMeta();
  save();
  hideCatalogEditModal();
  renderCatalogManage();
  render();
  toast('已删除');
}
