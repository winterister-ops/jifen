const { expect } = require('@playwright/test');

/** 在页面加载前注入 Firebase 桩，自动以测试用户登录并进入主界面 */
async function gotoLoggedInApp(page, uid = 'test-playwright-user') {
  await page.route('**/*gstatic.com/firebasejs/**', route => route.abort());

  await page.addInitScript((testUid) => {
    const authInstance = {
      setPersistence: () => Promise.resolve(),
      onAuthStateChanged: (cb) => {
        setTimeout(() => cb({ uid: testUid, email: 'test@example.com' }), 0);
      },
      signInWithEmailAndPassword: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
      EmailAuthProvider: { credential: () => ({}) },
      sendPasswordResetEmail: () => Promise.resolve(),
      confirmPasswordReset: () => Promise.resolve(),
    };
    const fakeRef = {
      on: (_event, cb) => {
        setTimeout(() => cb({ val: () => null }), 0);
      },
      off: () => {},
      set: () => Promise.resolve(),
      transaction: (updateFn, complete) => {
        try {
          const result = updateFn(null);
          if (complete) complete(null, true, { val: () => result });
        } catch (e) {
          if (complete) complete(e, false, null);
        }
      },
    };
    window.firebase = {
      initializeApp: () => {},
      auth: Object.assign(() => authInstance, {
        Auth: { Persistence: { SESSION: 'session' } },
      }),
      database: () => ({ ref: () => fakeRef }),
    };
  }, uid);

  await page.goto('/');
  await expect(page.locator('#appRoot')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#mainView')).toBeVisible();
  await expect(page.locator('#scoreNum')).toHaveText('0', { timeout: 5000 });
}

async function openSettings(page) {
  await page.locator('.header-left').click();
  await expect(page.locator('#settingsView')).toBeVisible();
}

async function openTaskManage(page) {
  await openSettings(page);
  await page.locator('.menu-item').filter({ hasText: '任务管理' }).click();
  await expect(page.locator('#taskManageView')).toBeVisible();
}

async function openRewardManage(page) {
  await openSettings(page);
  await page.locator('.menu-item').filter({ hasText: '奖励管理' }).click();
  await expect(page.locator('#rewardManageView')).toBeVisible();
}

async function goHome(page) {
  for (const sel of ['#taskManageView .back-btn', '#rewardManageView .back-btn', '#settingsView .back-btn']) {
    const btn = page.locator(sel);
    if (await btn.isVisible()) await btn.click();
  }
  await expect(page.locator('#mainView')).toBeVisible();
}

async function addCatalogItem(page, { type, name, pts }) {
  const viewSel = type === 'rewards' ? '#rewardManageView' : '#taskManageView';
  await page.locator(`${viewSel} .catalog-add-btn`).click();
  await expect(page.locator('#catalogEditModal')).toHaveClass(/show/);
  await page.locator('#catalogNameInput').fill(name);
  await page.locator('#catalogPtsInput').fill(String(pts));
  await page.locator('#catalogEditModal .modal-btn.confirm').click();
  await expect(page.locator('#catalogEditModal')).not.toHaveClass(/show/);
}

module.exports = {
  gotoLoggedInApp,
  openSettings,
  openTaskManage,
  openRewardManage,
  goHome,
  addCatalogItem,
};
