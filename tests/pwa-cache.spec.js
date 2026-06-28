const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp } = require('./helpers');

test('首页关键壳层在样式缓存错配时仍保持布局', async ({ page }) => {
  await page.route('**/styles.css**', route => route.abort());
  await gotoLoggedInApp(page);
  const layout = await page.evaluate(() => {
    const account = document.querySelector('.account-bar');
    const heroLine = document.querySelector('.main-hero-line');
    const star = document.querySelector('.star-balance .star-icon');
    return {
      accountDisplay: getComputedStyle(account).display,
      accountDirection: getComputedStyle(account).flexDirection,
      heroLineDisplay: getComputedStyle(heroLine).display,
      starRadius: getComputedStyle(star).borderRadius,
    };
  });
  expect(layout.accountDisplay).toBe('flex');
  expect(layout.accountDirection).toBe('row');
  expect(layout.heroLineDisplay).toBe('flex');
  expect(layout.starRadius).toBe('50%');
});
