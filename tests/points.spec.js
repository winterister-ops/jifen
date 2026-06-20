const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp } = require('./helpers');

test.describe('积分获取与消耗', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
  });

  test('完成任务可增加积分', async ({ page }) => {
    await page.locator('.earn-item').filter({ hasText: '自己洗手' }).click();
    await expect(page.locator('#scoreNum')).toHaveText('2', { timeout: 5000 });
  });

  test('积分不足时兑换奖励会提示', async ({ page }) => {
    await page.locator('.bottom-nav-item[data-nav="rewards"]').click();
    await page.locator('.spend-item').filter({ hasText: '小零食一份' }).click();
    await expect(page.locator('#toastEl')).toHaveText('积分不够哦', { timeout: 5000 });
    await expect(page.locator('#scoreNum')).toHaveText('0');
  });

  test('积分足够时可兑换并扣减', async ({ page }) => {
    await page.locator('.earn-item').filter({ hasText: '配合摄影' }).click();
    await expect(page.locator('#scoreNum')).toHaveText('50', { timeout: 5000 });

    await page.locator('.bottom-nav-item[data-nav="rewards"]').click();
    await page.locator('.spend-item').filter({ hasText: '小零食一份' }).click();
    await expect(page.locator('#spendModal')).toHaveClass(/show/);
    await page.locator('#spendModal .modal-btn.confirm').click();

    await expect(page.locator('#scoreNum')).toHaveText('42', { timeout: 5000 });
    await expect(page.locator('#spendModal')).not.toHaveClass(/show/);
  });

  test('冷却时间内重复点击同一任务不重复加分', async ({ page }) => {
    const wash = page.locator('.earn-item').filter({ hasText: '自己洗手' });
    await wash.click();
    await expect(page.locator('#scoreNum')).toHaveText('2', { timeout: 5000 });

    await wash.click();
    await expect(wash).toHaveClass(/cooldown/);
    await expect(page.locator('#scoreNum')).toHaveText('2');

    const historyLen = await page.evaluate(() => state.history.length);
    expect(historyLen).toBe(1);
  });
});
