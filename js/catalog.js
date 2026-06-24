// ====== 任务 / 奖励目录管理 ======

let catalogManageType = 'tasks';
let catalogEditId = null;

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

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'catalog-main';
    btn.dataset.id = it.id;

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'catalog-emoji';
    emojiSpan.textContent = it.emoji;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'catalog-name';
    nameSpan.textContent = it.name;
    if (it.preset) {
      const badge = document.createElement('span');
      badge.className = 'catalog-badge';
      badge.textContent = '预设';
      nameSpan.appendChild(badge);
    }

    const ptsSpan = document.createElement('span');
    ptsSpan.className = 'catalog-pts ' + (type === 'rewards' ? 'minus' : 'plus');
    ptsSpan.textContent = (type === 'rewards' ? '-' : '+') + it.pts;

    const editIc = document.createElement('span');
    editIc.className = 'catalog-edit-ic';
    editIc.textContent = '›';

    btn.append(emojiSpan, nameSpan, ptsSpan, editIc);
    btn.onclick = () => openCatalogEditModal(type, it.id);

    const label = document.createElement('label');
    label.className = 'toggle-switch catalog-toggle';
    label.onclick = (e) => e.stopPropagation();

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = it.enabled;
    input.onchange = () => toggleCatalogItem(type, it.id, input.checked);

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.append(input, slider);
    row.append(btn, label);
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

  document.getElementById('catalogEditTitle').textContent =
    isNew ? (type === 'rewards' ? '添加奖励' : '添加任务') : (type === 'rewards' ? '编辑奖励' : '编辑任务');
  document.getElementById('catalogNameInput').value = item.name || '';
  document.getElementById('catalogPtsInput').value = item.pts || 5;
  document.getElementById('catalogEmojiInput').value = firstEmojiOrDefault(item.emoji);
  document.getElementById('catalogDeleteBtn').style.display =
    (!isNew && !item.preset) ? '' : 'none';
  document.getElementById('catalogEditModal').classList.add('show');
  setTimeout(() => document.getElementById('catalogNameInput').focus(), 200);
}

function hideCatalogEditModal() {
  document.getElementById('catalogEditModal').classList.remove('show');
  catalogEditId = null;
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
  const emoji = firstEmojiOrDefault(document.getElementById('catalogEmojiInput').value);
  const list = catalogList(type);

  if (catalogEditId) {
    const idx = list.findIndex(it => it.id === catalogEditId);
    if (idx < 0) return;
    list[idx] = { ...list[idx], name: name.slice(0, 20), pts, emoji };
  } else {
    list.push({
      id: newCatalogId(),
      emoji,
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

function bindCatalogEmojiInput() {
  const input = document.getElementById('catalogEmojiInput');
  if (!input || input.dataset.emojiBound) return;
  input.dataset.emojiBound = '1';
  const clamp = () => {
    const one = takeFirstEmoji(input.value);
    if (input.value !== one) input.value = one;
  };
  input.addEventListener('input', clamp);
  input.addEventListener('paste', () => setTimeout(clamp, 0));
}

bindCatalogEmojiInput();
