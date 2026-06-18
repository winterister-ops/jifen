const { test, expect } = require('@playwright/test');

test('login screen shows app title and email field', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.auth-title')).toHaveText('星星银行', { timeout: 10000 });
  await expect(page.locator('#emailInput')).toBeVisible();
  await expect(page.locator('#passwordInput')).toBeVisible();
});
