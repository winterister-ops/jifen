const { test, expect } = require('@playwright/test');
const {
  gotoLoggedInApp,
  openSettings,
  waitForCloudSync,
  earnTask,
  setAppOffline,
  performClearRecords,
} = require('./helpers');

test.describe('离线重连', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
    await waitForCloudSync(page);
  });

  test('离线时我的页显示离线状态，恢复在线后消失', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('#appMeta')).not.toContainText('离线');

    await setAppOffline(page, true);
    await expect(page.locator('#appMeta')).toContainText('离线', { timeout: 5000 });

    await setAppOffline(page, false);
    await expect(page.locator('#appMeta')).not.toContainText('离线', { timeout: 5000 });
  });

  test('离线赚分后恢复在线会补写历史并同步积分', async ({ page }) => {
    await setAppOffline(page, true);
    await page.evaluate(() => window.__testFirestore.setWriteBlocked(true));

    await earnTask(page, '自己洗手');
    await earnTask(page, '自己吃饭');
    await expect(page.locator('#scoreNum')).toHaveText('7', { timeout: 5000 });

    const cloudWhileOffline = await page.evaluate(() => {
      const uid = 'test-playwright-user';
      return {
        score: window.__testFirestore.getUserDoc(uid)?.score ?? null,
        historyCount: Object.keys(window.__testFirestore.getHistory(uid) || {}).length,
      };
    });
    expect(cloudWhileOffline.score).not.toBe(7);
    expect(cloudWhileOffline.historyCount).toBe(0);

    await page.evaluate(() => window.__testFirestore.setWriteBlocked(false));
    await setAppOffline(page, false);

    await page.waitForFunction(() => {
      const uid = 'test-playwright-user';
      const doc = window.__testFirestore.getUserDoc(uid);
      const history = window.__testFirestore.getHistory(uid) || {};
      return doc?.score === 7 && Object.keys(history).length === 2 && !cloudPushDirty;
    }, null, { timeout: 10000 });
  });
});

test.describe('清空记录', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
    await waitForCloudSync(page);
  });

  test('lastClearAt 之后旧记录不再计入积分与列表', async ({ page }) => {
    await earnTask(page, '自己洗手');
    await earnTask(page, '自己吃饭');
    await expect(page.locator('#scoreNum')).toHaveText('7', { timeout: 5000 });
    await waitForCloudSync(page);

    const beforeClear = await page.evaluate(() => ({
      historyCount: Object.keys(window.__testFirestore.getHistory('test-playwright-user') || {}).length,
      score: window.__testFirestore.getUserDoc('test-playwright-user')?.score,
    }));
    expect(beforeClear.historyCount).toBe(2);
    expect(beforeClear.score).toBe(7);

    await performClearRecords(page);
    await page.waitForFunction(() => {
      const doc = window.__testFirestore.getUserDoc('test-playwright-user');
      return doc?.score === 0 && doc?.meta?.lastClearAt > 0;
    }, null, { timeout: 10000 });
    await page.evaluate(async () => {
      await reloadHistoryFromFirestore(true);
      if (typeof scheduleRender === 'function') scheduleRender();
    });

    await expect(page.locator('#scoreNum')).toHaveText('0', { timeout: 5000 });

    const afterClear = await page.evaluate(async () => {
      const uid = 'test-playwright-user';
      await ensureHistoryTotalCountFromFirestore();
      return {
        score: state.score,
        historyLen: state.history.length,
        totalCount: getHistoryTotalCountFromFirestore(),
        cloudScore: window.__testFirestore.getUserDoc(uid)?.score,
        lastClearAt: state.meta.lastClearAt,
      };
    });
    expect(afterClear.score).toBe(0);
    expect(afterClear.historyLen).toBe(0);
    expect(afterClear.totalCount).toBe(0);
    expect(afterClear.cloudScore).toBe(0);
    expect(afterClear.lastClearAt).toBeGreaterThan(0);

    await page.locator('.bottom-nav-item[data-nav="history"]').click();
    await expect(page.locator('#historyView')).toBeVisible();
    await expect(page.locator('.history-row')).toHaveCount(0);
    await expect(page.locator('#hpDateStats')).toContainText('暂无记录');
  });
});

test.describe('设置', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
    await waitForCloudSync(page);
  });

  test('修改宝贝昵称和头像会更新首页与我的页并写入云端', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-action="open-profile-modal"]').first().click();
    await expect(page.locator('#profileModal')).toHaveClass(/show/);

    await page.locator('#profileNameInput').fill('果果');
    await page.locator('.emoji-opt').filter({ hasText: '🐶' }).click();
    await page.locator('#profileModal .modal-btn.confirm').click();
    await expect(page.locator('#profileModal')).not.toHaveClass(/show/);

    await expect(page.locator('#setName')).toHaveText('果果');
    await expect(page.locator('#setAvatar')).toHaveText('🐶');

    await page.locator('.bottom-nav-item[data-nav="tasks"]').click();
    await expect(page.locator('#welcomeName')).toHaveText('果果');
    await expect(page.locator('#avatar')).toHaveText('🐶');

    await page.waitForFunction(() => {
      const doc = window.__testFirestore.getUserDoc('test-playwright-user');
      return doc?.profile?.name === '果果' && doc?.profile?.avatar === '🐶';
    }, null, { timeout: 10000 });

    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw).profile : null;
    });
    expect(stored).toEqual({ name: '果果', avatar: '🐶' });
  });

  test('修改密码成功后关闭弹窗并提示', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-action="open-password-modal"]').click();
    await expect(page.locator('#passwordModal')).toHaveClass(/show/);

    await page.locator('#currentPasswordInput').fill('old-pass');
    await page.locator('#newPasswordInput').fill('new-pass-6');
    await page.locator('#confirmPasswordInput').fill('new-pass-6');
    await page.locator('#passwordModalOk').click();

    await expect(page.locator('#passwordModal')).not.toHaveClass(/show/, { timeout: 5000 });
    await expect(page.locator('#toastEl')).toHaveText('密码已修改');
  });

  test('退出登录返回登录页', async ({ page }) => {
    await openSettings(page);
    await page.locator('[data-action="logout"]').click();

    await expect(page.locator('#authView')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#appRoot')).toBeHidden();
    await expect(page.locator('.auth-title')).toHaveText('星星银行');
  });
});
