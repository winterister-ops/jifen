const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp, earnTask } = require('./helpers');

async function seedHistoryWeek(page) {
  return page.evaluate(() => {
    const ymd = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const mk = (d, h, min, name) => {
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).getTime();
      const p = (n) => String(n).padStart(2, '0');
      return {
        id: 'x',
        emoji: '⭐',
        name,
        delta: 1,
        time: `${d.getMonth() + 1}月${d.getDate()}日 ${p(h)}:${p(min)}`,
        ts,
        eid: 'e' + ts,
      };
    };
    const hist = [];
    const keys = [];
    const now = new Date();
    for (let off = 6; off >= 0; off--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off);
      const key = ymd(d);
      keys.push(key);
      for (let i = 0; i < 5; i++) hist.push(mk(d, 10 + i, 0, `任务${key}-${i}`));
    }
    state.history = hist;
    save();
    if (typeof invalidateHistoryDateKeysCache === 'function') invalidateHistoryDateKeysCache();
    return keys;
  });
}

async function readHistoryDateState(page, key) {
  return page.evaluate((k) => {
    const h = document.getElementById('history');
    const el = document.querySelector('#history .date-head[data-date="' + k + '"]');
    return {
      scrollTop: h.scrollTop,
      focusedDateKey,
      visualTop: el ? Math.round(el.getBoundingClientRect().top - h.getBoundingClientRect().top) : null,
    };
  }, key);
}

test.describe('记录页日期跳转与周历', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
    await seedHistoryWeek(page);
    await page.locator('.bottom-nav-item[data-nav="history"]').click();
    await expect(page.locator('#historyView')).toBeVisible();
  });

  test('jumpToHistoryDate 连续跳转应定位到对应日期标题', async ({ page }) => {
    const keys = await page.evaluate(() => weekCalKeys());
    const sequence = [keys[2], keys[3], keys[2], keys[4], keys[3], keys[1]];

    for (const key of sequence) {
      await page.evaluate((k) => jumpToHistoryDate(k), key);
      await expect.poll(() => readHistoryDateState(page, key)).toMatchObject({
        focusedDateKey: key,
        visualTop: expect.any(Number),
      });
      const after = await readHistoryDateState(page, key);
      expect(Math.abs(after.visualTop)).toBeLessThanOrEqual(2);
    }
  });

  test('周历可切换上一周下一周', async ({ page }) => {
    await page.evaluate(() => {
      const ymd = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const mk = (d, h, min, name) => {
        const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).getTime();
        const p = (n) => String(n).padStart(2, '0');
        return {
          id: 'x',
          emoji: '⭐',
          name,
          delta: 1,
          time: `${d.getMonth() + 1}月${d.getDate()}日 ${p(h)}:${p(min)}`,
          ts,
          eid: 'e' + ts,
        };
      };
      const hist = [...state.history];
      const now = new Date();
      for (let off = 13; off >= 7; off--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - off);
        hist.push(mk(d, 10, 0, `上周${ymd(d)}`));
      }
      state.history = hist;
      save();
      if (typeof invalidateHistoryDateKeysCache === 'function') invalidateHistoryDateKeysCache();
    });

    const currentKeys = await page.evaluate(() => weekCalKeys());
    await page.locator('#hpWeekCalPrev').click();
    const prevKeys = await page.evaluate(() => weekCalKeys());
    expect(prevKeys[0]).not.toBe(currentKeys[0]);
    expect(prevKeys[6]).toBe(currentKeys[0]);

    await page.locator('#hpWeekCalNext').click();
    const backKeys = await page.evaluate(() => weekCalKeys());
    expect(backKeys).toEqual(currentKeys);
    await expect(page.locator('#hpWeekCalNext')).toBeDisabled();
  });

  test('周历点击应跳转到较新日期', async ({ page }) => {
    const keys = await page.evaluate(() => weekCalKeys());
    const olderKey = keys[1];
    const newerKey = keys[2];

    await page.evaluate((k) => jumpToHistoryDate(k), olderKey);
    await expect.poll(() => readHistoryDateState(page, olderKey)).toMatchObject({
      focusedDateKey: olderKey,
    });
    const before = await page.evaluate(() => document.getElementById('history').scrollTop);

    const idx = await page.evaluate((k) => weekCalKeys().indexOf(k), newerKey);
    expect(idx).toBeGreaterThanOrEqual(0);
    await page.locator('.hp-weekcal-day').nth(idx).click();

    await expect.poll(() => readHistoryDateState(page, newerKey)).toMatchObject({
      focusedDateKey: newerKey,
    });
    const after = await readHistoryDateState(page, newerKey);
    expect(after.scrollTop).toBeLessThan(before);
    expect(Math.abs(after.visualTop)).toBeLessThanOrEqual(2);
  });
});

test.describe('记录页编辑与删除', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
  });

  test('删除记录后积分会重算', async ({ page }) => {
    await earnTask(page, '自己洗手');
    await expect(page.locator('#scoreNum')).toHaveText('2', { timeout: 5000 });
    await earnTask(page, '自己吃饭');
    await expect(page.locator('#scoreNum')).toHaveText('7', { timeout: 5000 });

    await page.locator('.bottom-nav-item[data-nav="history"]').click();
    await expect(page.locator('#historyView')).toBeVisible();
    await page.locator('#historyEditBtn').click();

    const washRow = page.locator('.history-row').filter({ hasText: '自己洗手' });
    await expect(washRow).toBeVisible();
    await washRow.locator('.catalog-check input').check();

    await page.locator('#hpDeleteBtn').click();
    await expect(page.locator('#deleteModal')).toHaveClass(/show/);
    await page.locator('#deleteModal .modal-btn.danger').click();
    await expect(page.locator('#deleteModal')).not.toHaveClass(/show/);

    const score = await page.evaluate(() => state.score);
    expect(score).toBe(5);

    await page.locator('.bottom-nav-item[data-nav="tasks"]').click();
    await expect(page.locator('#scoreNum')).toHaveText('5', { timeout: 5000 });

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored.score).toBe(5);
    expect(stored.history).toHaveLength(1);
    expect(stored.history[0].name).toBe('自己吃饭');
  });
});

test.describe('Firestore 历史分页', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
  });

  test('首屏加载一页，加载更多追加下一页', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const uid = 'test-playwright-user';
      const entries = [];
      for (let i = 0; i < 60; i++) {
        entries.push({
          eid: 'e' + String(i).padStart(3, '0'),
          id: 'wash',
          emoji: '🧼',
          name: '记录' + i,
          delta: 1,
          time: '',
          ts: 1000 + i * 1000,
        });
      }
      window.__testFirestore.seedHistory(uid, entries);

      await reloadHistoryFromFirestore(true);
      const firstPage = {
        loaded: state.history.length,
        hasMore: historyHasMoreInFirestore(),
      };

      await loadMoreHistoryFromFirestore();
      const secondPage = {
        loaded: state.history.length,
        hasMore: historyHasMoreInFirestore(),
      };

      return { firstPage, secondPage };
    });

    expect(result.firstPage.loaded).toBe(50);
    expect(result.firstPage.hasMore).toBe(true);
    expect(result.secondPage.loaded).toBe(60);
    expect(result.secondPage.hasMore).toBe(false);
  });

  test('加载到记录页后异步数据会渲染出来', async ({ page }) => {
    await page.evaluate(async () => {
      const uid = 'test-playwright-user';
      window.__testFirestore.seedHistory(uid, [{
        eid: 'seed1', id: 'wash', emoji: '🧼', name: '异步记录', delta: 2, time: '', ts: Date.now(),
      }]);
      await reloadHistoryFromFirestore(true);
      scheduleRender();
    });

    await page.locator('.bottom-nav-item[data-nav="history"]').click();
    await expect(page.locator('.history-row').filter({ hasText: '异步记录' })).toBeVisible({ timeout: 5000 });
  });

  test('周历统计查询失败时仍显示日期格子', async ({ page }) => {
    await page.evaluate(async () => {
      await ensureHistoryReady();
      const uid = 'test-playwright-user';
      window.__testFirestore.seedHistory(uid, [{
        eid: 'seed1', id: 'wash', emoji: '🧼', name: '离线记录', delta: 2, time: '', ts: Date.now(),
      }]);
      await reloadHistoryFromFirestore(true);
      historyDayStatsIndex = null;
      historyDayStatsPromise = null;
      window.__testFirestore.setReadBlocked(true);
    });

    await page.locator('.bottom-nav-item[data-nav="history"]').click();
    await expect(page.locator('#hpWeekCalDays .hp-weekcal-day')).toHaveCount(7, { timeout: 5000 });
    await expect(page.locator('.history-row').filter({ hasText: '离线记录' })).toBeVisible();
  });

  test('历史缓存过期后进入记录页会重新渲染', async ({ page }) => {
    await page.evaluate(async () => {
      await ensureHistoryReady();
      const entry = {
        eid: 'late1', id: 'wash', emoji: '🧼', name: '迟到记录', delta: 3, time: '', ts: Date.now(),
      };
      state.history = [entry];
      historyReversedCache = { items: [], dateFirstIndex: new Map() };
    });

    await page.locator('.bottom-nav-item[data-nav="history"]').click();
    await expect(page.locator('.history-row').filter({ hasText: '迟到记录' })).toBeVisible({ timeout: 5000 });
  });
});
