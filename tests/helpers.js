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

module.exports = { gotoLoggedInApp };
