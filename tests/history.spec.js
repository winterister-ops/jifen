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
    invalidateHistoryDateKeysCache();
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
