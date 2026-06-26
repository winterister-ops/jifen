const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp } = require('./helpers');

async function seedAndReload(page, n) {
  await page.evaluate(async (count) => {
    const uid = 'test-playwright-user';
    const entries = [];
    for (let i = 0; i < count; i++) {
      entries.push({ eid: 'e' + String(i).padStart(3, '0'), id: 'wash', emoji: '🧼', name: '记录' + i, delta: 1, time: '', ts: 1000 + i * 1000 });
    }
    window.__testFirestore.seedHistory(uid, entries);
    await reloadHistoryFromFirestore(true);
    scheduleRender();
  }, n);
}

const cb = (page) => page.locator('.catalog-check input').count();

test('点击取消退出编辑后左侧单选框隐藏', async ({ page }) => {
  await gotoLoggedInApp(page);
  await seedAndReload(page, 8);
  await page.locator('.bottom-nav-item[data-nav="history"]').click();
  await expect(page.locator('.history-row').first()).toBeVisible();

  await page.locator('#historyEditBtn').click();
  await page.waitForTimeout(100);
  expect(await cb(page)).toBeGreaterThan(0);

  await page.locator('#historyCancelEditBtn').click();
  await page.waitForTimeout(150);
  expect(await cb(page)).toBe(0);
  await expect(page.locator('#historyEditBtn')).toBeVisible();
});

test('exit hides checkboxes even when date-header render throws', async ({ page }) => {
  await gotoLoggedInApp(page);
  await seedAndReload(page, 8);
  await page.locator('.bottom-nav-item[data-nav="history"]').click();
  await expect(page.locator('.history-row').first()).toBeVisible();

  await page.locator('#historyEditBtn').click();
  await page.waitForTimeout(100);
  expect(await cb(page)).toBeGreaterThan(0);

  // Force the sticky date-header render to throw, mimicking a real Firestore
  // stats/week-calendar query failure. The list (and its checkboxes) must
  // still be rebuilt/removed on exit.
  await page.evaluate(() => {
    window.__orig = renderDateHeader;
    // reassign the global binding used inside renderHistory
    renderDateHeader = function () { throw new Error('boom header'); };
  });

  await page.locator('#historyCancelEditBtn').click();
  await page.waitForTimeout(200);
  const after = await cb(page);
  await page.evaluate(() => { renderDateHeader = window.__orig; });
  console.log('AFTER CANCEL (header throws)', after);
  expect(after).toBe(0);
});
