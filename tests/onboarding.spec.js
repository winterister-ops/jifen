const { test, expect } = require('@playwright/test');
const {
  gotoLoggedInApp,
  gotoOnboardingApp,
  completeOnboardingFlow,
} = require('./helpers');

test.describe('新用户引导', () => {
  test('新用户登录后先进入引导页', async ({ page }) => {
    await gotoOnboardingApp(page);
    await expect(page.locator('#obStep-profile .ob-title')).toHaveText('先认识一下宝贝');
    await expect(page.locator('#mainView')).toBeHidden();
    await expect(page.locator('#bottomNav')).toHaveClass(/is-hidden/);
  });

  test('完成引导后进入任务页并保存配置', async ({ page }) => {
    await gotoOnboardingApp(page);
    await completeOnboardingFlow(page, { name: '豆豆', avatar: '🐯' });

    await expect(page.locator('.earn-item').filter({ hasText: '自己洗手' })).toBeVisible();
    await expect(page.locator('.earn-item').filter({ hasText: '吃蔬菜' })).toHaveCount(0);

    const stored = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem(KEY));
      return {
        onboardingDone: data.meta.onboardingDone === true,
        name: data.profile.name,
        avatar: data.profile.avatar,
        enabledTasks: data.catalog.tasks.filter(t => t.enabled).map(t => t.id).sort(),
        enabledRewards: data.catalog.rewards.filter(r => r.enabled).map(r => r.id).sort(),
      };
    });

    expect(stored.onboardingDone).toBe(true);
    expect(stored.name).toBe('豆豆');
    expect(stored.avatar).toBe('🐯');
    expect(stored.enabledTasks).toEqual(
      ['brush', 'eat', 'learn', 'polite', 'sleep', 'tidy', 'wash'].sort()
    );
    expect(stored.enabledRewards).toEqual(
      ['cartoon', 'icecream', 'park', 'snack', 'toy'].sort()
    );
  });

  test('引导中可切换习惯分类并增减选项', async ({ page }) => {
    await gotoOnboardingApp(page);
    await page.locator('[data-ob-action="ob-profile-next"]').click();

    await page.locator('.ob-cat-tab').filter({ hasText: '自理' }).click();
    await page.locator('#obStep-habits .ob-pick-card').filter({ hasText: '吃蔬菜' }).click();
    await expect(page.locator('#obHabitCount')).toHaveText('已选 8 项');

    await page.locator('.ob-cat-tab').filter({ hasText: '全部' }).click();
    await page.locator('#obStep-habits .ob-pick-card').filter({ hasText: '吃蔬菜' }).click();
    await expect(page.locator('#obHabitCount')).toHaveText('已选 7 项');
  });

  test('恢复推荐配置会重置习惯选择', async ({ page }) => {
    await gotoOnboardingApp(page);
    await page.locator('[data-ob-action="ob-profile-next"]').click();
    await page.locator('.ob-pick-card').filter({ hasText: '自己洗手' }).click();
    await expect(page.locator('#obHabitCount')).toHaveText('已选 6 项');

    await page.locator('[data-ob-action="ob-habits-restore"]').click();
    await expect(page.locator('#obHabitCount')).toHaveText('已选 7 项');
  });

  test('已完成引导的用户不再显示引导', async ({ page }) => {
    const uid = 'test-onboarding-done-user';
    await page.route('**/*gstatic.com/firebasejs/**', route => route.abort());
    await page.addInitScript(({ testUid }) => {
      window.__testFlags = { skipOnboarding: false };
      const key = 'kid_points_v1_dev_' + testUid;
      localStorage.setItem(key, JSON.stringify({
        score: 0,
        history: [],
        profile: { name: '小米', avatar: '👧' },
        revoked: {},
        catalog: {
          tasks: [{ id: 'wash', emoji: '🧼', name: '自己洗手', pts: 2, enabled: true, preset: true }],
          rewards: [{ id: 'snack', emoji: '🍪', name: '小零食一份', pts: 8, enabled: true, preset: true }],
        },
        meta: {
          lastClearAt: 0,
          profileUpdatedAt: 1,
          catalogUpdatedAt: 1,
          updatedAt: 1,
          onboardingDone: true,
        },
      }));
      const authInstance = {
        setPersistence: () => Promise.resolve(),
        onAuthStateChanged: (cb) => {
          cb({ uid: testUid, email: 'test@example.com' });
          return () => {};
        },
        signOut: () => Promise.resolve(),
      };
      window.firebase = {
        initializeApp: () => {},
        auth: Object.assign(() => authInstance, { Auth: { Persistence: { LOCAL: 'local', SESSION: 'session' } } }),
        database: () => ({
          ref: () => ({
            on: (event, cb) => { if (event === 'value') setTimeout(() => cb({ val: () => null }), 0); },
            off: () => {},
            set: () => Promise.resolve(),
            update: () => Promise.resolve(),
            transaction: (fn, done) => { if (done) done(null, true, { val: () => null }); return Promise.resolve(); },
          }),
        }),
      };
    }, { testUid: uid });

    await page.goto('/');
    await expect(page.locator('#mainView')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#onboardingView')).toBeHidden();
    await expect(page.locator('#welcomeName')).toHaveText('小米');
  });

  test('新浏览器登录已有数据账号不会停留在引导页', async ({ page }) => {
    const uid = 'test-existing-cloud-user';
    await gotoLoggedInApp(page, uid, {
      skipOnboarding: false,
      skipReadyAssert: true,
      cloudDoc: {
        score: 12,
        profile: { name: '小云', avatar: '👦' },
        revoked: {},
        catalog: {
          tasks: [{ id: 'wash', emoji: '🧼', name: '自己洗手', pts: 2, enabled: true, preset: true }],
          rewards: [{ id: 'snack', emoji: '🍪', name: '小零食一份', pts: 8, enabled: true, preset: true }],
        },
        meta: {
          lastClearAt: 0,
          profileUpdatedAt: 100,
          catalogUpdatedAt: 100,
          scoreUpdatedAt: 100,
          updatedAt: 100,
          onboardingDone: true,
          firestoreMigratedAt: 100,
        },
      },
    });

    await expect(page.locator('#mainView')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#onboardingView')).toBeHidden();
    await expect(page.locator('#welcomeName')).toHaveText('小云');
  });

  test('有历史记录的老用户跳过引导', async ({ page }) => {
    await page.route('**/*gstatic.com/firebasejs/**', route => route.abort());
    await page.addInitScript(() => {
      window.__testFlags = { skipOnboarding: false };
      const key = 'kid_points_v1_dev_legacy-user';
      localStorage.setItem(key, JSON.stringify({
        score: 2,
        history: [{
          eid: 'e1', id: 'wash', emoji: '🧼', name: '自己洗手',
          delta: 2, time: '1月1日 08:00', ts: Date.now(),
        }],
        profile: { name: '宝贝', avatar: '👧' },
        revoked: {},
        catalog: {
          tasks: [
            { id: 'wash', emoji: '🧼', name: '自己洗手', pts: 2, enabled: true, preset: true },
          ],
          rewards: [
            { id: 'snack', emoji: '🍪', name: '小零食一份', pts: 8, enabled: true, preset: true },
          ],
        },
        meta: { lastClearAt: 0, profileUpdatedAt: 0, catalogUpdatedAt: 0, updatedAt: 0, onboardingDone: false },
      }));
      const authInstance = {
        setPersistence: () => Promise.resolve(),
        onAuthStateChanged: (cb) => {
          setTimeout(() => cb({ uid: 'legacy-user', email: 'legacy@example.com' }), 0);
        },
        signOut: () => Promise.resolve(),
      };
      window.firebase = {
        initializeApp: () => {},
        auth: Object.assign(() => authInstance, { Auth: { Persistence: { SESSION: 'session' } } }),
        database: () => ({
          ref: () => ({
            on: (event, cb) => { if (event === 'value') setTimeout(() => cb({ val: () => null }), 0); },
            off: () => {},
            set: () => Promise.resolve(),
            update: () => Promise.resolve(),
            transaction: (fn, done) => { if (done) done(null, true, { val: () => null }); return Promise.resolve(); },
          }),
        }),
      };
    });

    await page.goto('/');
    await expect(page.locator('#mainView')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#onboardingView')).toBeHidden();
  });

  test('已完成用户可从我的页打开习惯计划重配', async ({ page }) => {
    await gotoLoggedInApp(page);
    await page.locator('.bottom-nav-item[data-nav="settings"]').click();
    await page.locator('[data-action="open-plan-reconfigure"]').click();
    await expect(page.locator('#onboardingView')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#onboardingView')).toHaveClass(/is-reconfigure/);
    await expect(page.locator('#obStep-habits')).toHaveClass(/active/);
    await expect(page.locator('#obStep-habits .ob-title')).toHaveText('调整今天的习惯');
  });

  test('重配模式可取消且不保存改动', async ({ page }) => {
    await gotoLoggedInApp(page);
    await page.locator('.bottom-nav-item[data-nav="settings"]').click();
    await page.locator('[data-action="open-plan-reconfigure"]').click();
    await expect(page.locator('#obStep-habits')).toHaveClass(/active/, { timeout: 5000 });

    await page.locator('#obStep-habits .ob-pick-card').filter({ hasText: '自己洗手' }).click();
    await expect(page.locator('#obHabitCount')).toHaveText('已选 6 项');

    await page.locator('#obStep-habits [data-ob-action="ob-reconfigure-cancel"]').click();
    await expect(page.locator('#settingsView')).toBeVisible();
    await expect(page.locator('#onboardingView')).toBeHidden();

    await page.locator('.bottom-nav-item[data-nav="tasks"]').click();
    await expect(page.locator('.earn-item').filter({ hasText: '自己洗手' })).toBeVisible();
  });
});
