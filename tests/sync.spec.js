const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp } = require('./helpers');

test.describe('云同步合并逻辑', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
  });

  test('mergeStates 合并本地与远端记录并重算积分', async ({ page }) => {
    const result = await page.evaluate(() => {
      const local = {
        score: 2,
        history: [{ eid: 'e1', id: 'wash', emoji: '🧼', name: '洗手', delta: 2, time: '', ts: 1000 }],
        profile: { name: '本地', avatar: '👧' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 100, updatedAt: 1000 },
      };
      const remote = {
        score: 5,
        history: [{ eid: 'e2', id: 'eat', emoji: '🍚', name: '吃饭', delta: 5, time: '', ts: 2000 }],
        profile: { name: '远端', avatar: '👦' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 200, updatedAt: 2000 },
      };
      return mergeStates(local, remote);
    });

    expect(result.score).toBe(7);
    expect(result.history).toHaveLength(2);
    expect(result.history.map(h => h.eid)).toEqual(['e1', 'e2']);
    expect(result.profile.name).toBe('远端');
  });

  test('mergeStates 相同 eid 以最后一次写入为准', async ({ page }) => {
    const result = await page.evaluate(() => {
      const local = {
        score: 2,
        history: [{ eid: 'same', id: 'wash', emoji: '🧼', name: '洗手', delta: 2, time: '', ts: 1000 }],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 0, updatedAt: 1000 },
      };
      const remote = {
        score: 5,
        history: [{ eid: 'same', id: 'eat', emoji: '🍚', name: '吃饭', delta: 5, time: '', ts: 2000 }],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 0, updatedAt: 2000 },
      };
      return mergeStates(local, remote);
    });

    expect(result.history).toHaveLength(1);
    expect(result.history[0].id).toBe('eat');
    expect(result.score).toBe(5);
  });

  test('normalizeState 会过滤撤销记录与清空时间点之前的记录', async ({ page }) => {
    const result = await page.evaluate(() => {
      const raw = {
        score: 99,
        history: [
          { eid: 'old', id: 'a', emoji: '', name: '旧', delta: 5, time: '', ts: 1000 },
          { eid: 'keep', id: 'b', emoji: '', name: '留', delta: 3, time: '', ts: 2000 },
          { eid: 'gone', id: 'c', emoji: '', name: '删', delta: 10, time: '', ts: 3000 },
        ],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: ['gone'],
        meta: { lastClearAt: 1500, profileUpdatedAt: 0, updatedAt: 3000 },
      };
      return normalizeState(raw);
    });

    expect(result.history.map(h => h.eid)).toEqual(['keep']);
    expect(result.score).toBe(3);
  });

  test('save 会从 history 重算积分', async ({ page }) => {
    await page.evaluate(() => {
      state.score = 999;
      state.history = [{ eid: 'e1', id: 'wash', emoji: '🧼', name: '洗手', delta: 2, time: '', ts: Date.now() }];
      state.revoked = {};
      state.meta = { ...defaultMeta(), updatedAt: Date.now() };
      save();
    });

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored.score).toBe(2);
  });

  test('save 会写入 localStorage', async ({ page }) => {
    await page.locator('.earn-item').filter({ hasText: '自己洗手' }).click();
    await expect(page.locator('#scoreNum')).toHaveText('2', { timeout: 5000 });

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.score).toBe(2);
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0].delta).toBe(2);
  });

  test('stateContentEqual 忽略 meta.updatedAt 差异', async ({ page }) => {
    const equal = await page.evaluate(() => {
      function entry(eid, id, delta, ts) {
        return { eid, id, emoji: '⭐', name: id, delta, time: '', ts };
      }
      const a = {
        score: 2,
        history: [entry('e1', 'wash', 2, 1000)],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 0, updatedAt: 100 },
      };
      const b = {
        score: 2,
        history: [entry('e1', 'wash', 2, 1000)],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 0, updatedAt: 999 },
      };
      return stateContentEqual(a, b);
    });

    expect(equal).toBe(true);
  });

  test('compactRevoked 会清理超过 90 天的撤销标记', async ({ page }) => {
    const result = await page.evaluate(() => {
      const oldTs = Date.now() - (91 * 24 * 60 * 60 * 1000);
      const raw = {
        score: 0,
        history: [],
        profile: { name: '宝贝', avatar: '👧' },
        revoked: {
          stale: oldTs,
          keep: Date.now(),
        },
        meta: { lastClearAt: 0, profileUpdatedAt: 0, catalogUpdatedAt: 0, updatedAt: 0 },
      };
      return normalizeState(raw).revoked;
    });

    expect(result.stale).toBeUndefined();
    expect(result.keep).toBeDefined();
  });

  test('buildCloudPatch 仅追加 history 时走增量路径', async ({ page }) => {
    const result = await page.evaluate(() => {
      const prev = {
        score: 2,
        profile: { name: '宝贝', avatar: '👧' },
        catalog: defaultCatalog(),
        meta: defaultMeta(),
        revoked: {},
        history: { e1: { eid: 'e1', id: 'wash', emoji: '🧼', name: '洗手', delta: 2, time: '', ts: 1000 } },
      };
      const next = {
        ...prev,
        score: 5,
        meta: { ...defaultMeta(), updatedAt: 2000 },
        history: {
          ...prev.history,
          e2: { eid: 'e2', id: 'eat', emoji: '🍚', name: '吃饭', delta: 3, time: '', ts: 2000 },
        },
      };
      return buildCloudPatch(prev, next);
    });

    expect(result.incremental).toBe(true);
    expect(result.patch['history/e2']).toBeDefined();
    expect(result.patch.score).toBe(5);
    expect(result.patch.meta).toBeDefined();
    expect(result.patch.profile).toBeUndefined();
    expect(result.patch.catalog).toBeUndefined();
  });

  test('mergeStates 保留 catalogUpdatedAt 较新的目录', async ({ page }) => {
    const result = await page.evaluate(() => {
      const base = {
        score: 0,
        history: [],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: [],
        meta: { lastClearAt: 0, profileUpdatedAt: 0, updatedAt: 0 },
      };
      const local = {
        ...base,
        catalog: {
          tasks: [{ id: 'c_local', emoji: '⭐', name: '本地任务', pts: 3, enabled: true, preset: false }],
          rewards: [],
        },
        meta: { ...base.meta, catalogUpdatedAt: 500, updatedAt: 500 },
      };
      const remote = {
        ...base,
        catalog: {
          tasks: [{ id: 'c_remote', emoji: '🎯', name: '远端任务', pts: 8, enabled: true, preset: false }],
          rewards: [],
        },
        meta: { ...base.meta, catalogUpdatedAt: 100, updatedAt: 100 },
      };
      return mergeStates(local, remote);
    });

    expect(result.catalog.tasks.some(t => t.name === '本地任务')).toBe(true);
    expect(result.catalog.tasks.some(t => t.name === '远端任务')).toBe(false);
    expect(result.meta.catalogUpdatedAt).toBe(500);
  });
});
