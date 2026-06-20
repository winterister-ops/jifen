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
    const fakeRef = (() => {
      let cloudData = null;
      function applyPatch(base, patch) {
        const next = base ? JSON.parse(JSON.stringify(base)) : {};
        Object.entries(patch || {}).forEach(([path, val]) => {
          const slash = path.indexOf('/');
          if (slash === -1) {
            if (val === null) delete next[path];
            else next[path] = val;
            return;
          }
          const top = path.slice(0, slash);
          const key = path.slice(slash + 1);
          if (!next[top] || typeof next[top] !== 'object') next[top] = {};
          if (val === null) delete next[top][key];
          else next[top][key] = val;
        });
        return next;
      }
      return {
        on: (_event, cb) => {
          setTimeout(() => cb({ val: () => cloudData }), 0);
        },
        off: () => {},
        set: (data) => {
          cloudData = data;
          return Promise.resolve();
        },
        update: (patch) => {
          cloudData = applyPatch(cloudData, patch);
          return Promise.resolve();
        },
        transaction: (updateFn, complete) => {
          try {
            const result = updateFn(cloudData);
            cloudData = result;
            if (complete) complete(null, true, { val: () => cloudData });
          } catch (e) {
            if (complete) complete(e, false, null);
          }
        },
      };
    })();
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
  await page.locator('.bottom-nav-item[data-nav="settings"]').click();
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
  for (const sel of ['#taskManageView .back-btn', '#rewardManageView .back-btn']) {
    const btn = page.locator(sel);
    if (await btn.isVisible()) await btn.click();
  }
  await page.locator('.bottom-nav-item[data-nav="tasks"]').click();
  await expect(page.locator('#mainView')).toBeVisible();
}

async function addCatalogItem(page, { type, name, pts }) {
  const viewSel = type === 'rewards' ? '#rewardManageView' : '#taskManageView';
  await page.locator(`${viewSel} .catalog-add-pill`).click();
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
