const { expect } = require('@playwright/test');

/** 在页面加载前注入 Firebase 桩，自动以测试用户登录并进入主界面 */
async function gotoLoggedInApp(page, uid = 'test-playwright-user', options = {}) {
  const { skipOnboarding = true } = options;
  await page.route('**/*gstatic.com/firebasejs/**', route => route.abort());

  await page.addInitScript(({ testUid, skipOnboarding }) => {
    window.__testFlags = { skipOnboarding };
    const authInstance = {
      setPersistence: () => Promise.resolve(),
      onAuthStateChanged: (cb) => {
        cb({ uid: testUid, email: 'test@example.com' });
        return () => {};
      },
      signInWithEmailAndPassword: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
      EmailAuthProvider: { credential: () => ({}) },
      sendPasswordResetEmail: () => Promise.resolve(),
      confirmPasswordReset: () => Promise.resolve(),
    };
    const fakeRef = (() => {
      let cloudData = null;
      let writeBlocked = false;
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
      function rejectIfBlocked() {
        if (!writeBlocked) return null;
        return Promise.reject(new Error('cloud write blocked'));
      }
      const ref = {
        on: (_event, cb) => {
          setTimeout(() => cb({ val: () => cloudData }), 0);
        },
        off: () => {},
        set: (data) => {
          const blocked = rejectIfBlocked();
          if (blocked) return blocked;
          cloudData = data;
          return Promise.resolve();
        },
        update: (patch) => {
          const blocked = rejectIfBlocked();
          if (blocked) return blocked;
          cloudData = applyPatch(cloudData, patch);
          return Promise.resolve();
        },
        transaction: (updateFn, complete) => {
          const blocked = rejectIfBlocked();
          if (blocked) {
            if (complete) complete(new Error('cloud write blocked'), false, null);
            return blocked;
          }
          try {
            const result = updateFn(cloudData);
            cloudData = result;
            if (complete) complete(null, true, { val: () => cloudData });
          } catch (e) {
            if (complete) complete(e, false, null);
          }
          return Promise.resolve();
        },
      };
      window.__testCloud = {
        getData: () => cloudData,
        setWriteBlocked: (blocked) => { writeBlocked = !!blocked; },
        isWriteBlocked: () => writeBlocked,
      };
      return ref;
    })();
    window.firebase = {
      initializeApp: () => {},
      auth: Object.assign(() => authInstance, {
        Auth: { Persistence: { SESSION: 'session' } },
      }),
      database: () => ({ ref: () => fakeRef }),
    };
  }, { testUid: uid, skipOnboarding });

  await page.goto('/');
  if (skipOnboarding) {
    await expect(page.locator('#mainView')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#scoreNum')).toHaveText('0', { timeout: 5000 });
    return;
  }
  await expect(page.locator('#onboardingView')).toBeVisible({ timeout: 10000 });
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

async function exitManageViews(page) {
  if (await page.locator('#taskManageView').isVisible()) {
    await page.locator('#taskManageView .back-btn').click();
    await expect(page.locator('#settingsView')).toBeVisible();
  } else if (await page.locator('#rewardManageView').isVisible()) {
    await page.locator('#rewardManageView .back-btn').click();
    await expect(page.locator('#settingsView')).toBeVisible();
  }
}

async function goHome(page) {
  await exitManageViews(page);
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

async function waitForCloudSync(page) {
  await page.waitForFunction(() => {
    return window.__testCloud
      && window.__testCloud.getData()
      && typeof window.__testCloud.getData().score === 'number';
  }, null, { timeout: 10000 });
}

async function earnTask(page, name) {
  await page.locator('.earn-item').filter({ hasText: name }).click();
}

async function gotoOnboardingApp(page, uid = 'test-playwright-new-user') {
  await gotoLoggedInApp(page, uid, { skipOnboarding: false });
  await expect(page.locator('#obStep-profile')).toHaveClass(/active/);
}

async function completeOnboardingFlow(page, { name = '小星星', avatar = '👦' } = {}) {
  await page.locator('#obNameInput').fill(name);
  await page.locator('.ob-avatar-btn').filter({ hasText: avatar }).click();
  await page.locator('[data-ob-action="ob-profile-next"]').click();
  await expect(page.locator('#obStep-habits')).toHaveClass(/active/);

  await page.locator('[data-ob-action="ob-habits-next"]').click();
  await expect(page.locator('#obStep-rewards')).toHaveClass(/active/);

  await page.locator('[data-ob-action="ob-rewards-done"]').click();
  await expect(page.locator('#obStep-done')).toHaveClass(/active/);

  await page.locator('[data-ob-action="ob-enter-app"]').click();
  await expect(page.locator('#mainView')).toBeVisible();
  await expect(page.locator('#welcomeName')).toHaveText(name);
}

module.exports = {
  gotoLoggedInApp,
  gotoOnboardingApp,
  completeOnboardingFlow,
  openSettings,
  openTaskManage,
  openRewardManage,
  goHome,
  addCatalogItem,
  waitForCloudSync,
  earnTask,
};
