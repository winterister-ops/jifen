const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp, earnTask } = require('./helpers');

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
