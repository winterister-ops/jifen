const { test, expect } = require('@playwright/test');
const {
  gotoLoggedInApp,
  openTaskManage,
  openRewardManage,
  goHome,
  addCatalogItem,
} = require('./helpers');

const CUSTOM_TASK = '测试自定义任务';
const CUSTOM_REWARD = '测试自定义奖励';

test.describe('任务与奖励管理', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLoggedInApp(page);
  });

  test('首页展示预设任务', async ({ page }) => {
    await expect(page.locator('.earn-item').filter({ hasText: '自己洗手' })).toBeVisible();
    await expect(page.locator('.earn-item').filter({ hasText: '配合摄影' })).toBeVisible();
    await expect(page.locator('#sortBar')).toHaveCount(0);
  });

  test('首页按分值从低到高排列', async ({ page }) => {
    const pts = await page.locator('.earn-item .pts').allTextContents();
    const values = pts.map(t => parseInt(t.replace('+', ''), 10));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  test('添加自定义任务后首页可赚取对应积分', async ({ page }) => {
    await openTaskManage(page);
    await addCatalogItem(page, { type: 'tasks', name: CUSTOM_TASK, pts: 7 });
    await goHome(page);

    await page.locator('.earn-item').filter({ hasText: CUSTOM_TASK }).click();
    await expect(page.locator('#scoreNum')).toHaveText('7', { timeout: 5000 });
  });

  test('修改任务分值后按新分值赚取积分', async ({ page }) => {
    await openTaskManage(page);
    await page.locator('#taskManageList .catalog-row').filter({ hasText: '自己洗手' }).locator('.catalog-main').click();
    await page.locator('#catalogPtsInput').fill('9');
    await page.locator('#catalogEditModal .modal-btn.confirm').click();
    await goHome(page);

    await page.locator('.earn-item').filter({ hasText: '自己洗手' }).click();
    await expect(page.locator('#scoreNum')).toHaveText('9', { timeout: 5000 });
  });

  test('停用任务后首页不再显示', async ({ page }) => {
    await openTaskManage(page);
    await addCatalogItem(page, { type: 'tasks', name: CUSTOM_TASK, pts: 3 });
    const row = page.locator('#taskManageList .catalog-row').filter({ hasText: CUSTOM_TASK });
    await row.locator('.catalog-toggle').click();
    await goHome(page);

    await expect(page.locator('.earn-item').filter({ hasText: CUSTOM_TASK })).toHaveCount(0);
  });

  test('可删除自定义任务', async ({ page }) => {
    await openTaskManage(page);
    await addCatalogItem(page, { type: 'tasks', name: CUSTOM_TASK, pts: 3 });
    await page.locator('#taskManageList .catalog-row').filter({ hasText: CUSTOM_TASK }).locator('.catalog-main').click();
    await expect(page.locator('#catalogDeleteBtn')).toBeVisible();
    await page.locator('#catalogDeleteBtn').click();

    await expect(page.locator('#taskManageList .catalog-row').filter({ hasText: CUSTOM_TASK })).toHaveCount(0);
    await goHome(page);
    await expect(page.locator('.earn-item').filter({ hasText: CUSTOM_TASK })).toHaveCount(0);
  });

  test('系统预设任务不可删除', async ({ page }) => {
    await openTaskManage(page);
    await page.locator('#taskManageList .catalog-row').filter({ hasText: '自己洗手' }).locator('.catalog-main').click();
    await expect(page.locator('#catalogDeleteBtn')).toBeHidden();
  });

  test('添加自定义奖励后可兑换并扣减积分', async ({ page }) => {
    await openRewardManage(page);
    await addCatalogItem(page, { type: 'rewards', name: CUSTOM_REWARD, pts: 6 });
    await goHome(page);

    await page.locator('.earn-item').filter({ hasText: '配合摄影' }).click();
    await expect(page.locator('#scoreNum')).toHaveText('50', { timeout: 5000 });

    await page.locator('#tabSpend').click();
    await page.locator('.spend-item').filter({ hasText: CUSTOM_REWARD }).click();
    await expect(page.locator('#spendModal')).toHaveClass(/show/);
    await page.locator('#spendModal .modal-btn.confirm').click();

    await expect(page.locator('#scoreNum')).toHaveText('44', { timeout: 5000 });
  });

  test('旧版 catalog 迁移后仍能展示预设任务', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(KEY, JSON.stringify({
        score: 0,
        history: [],
        profile: { name: '宝贝', avatar: '👧' },
        revokedEids: [],
        catalog: {
          taskCategories: [{ id: 'daily', name: '生活自理' }],
          tasks: DEFAULT_TASKS.map(t => ({ ...t, categoryId: 'daily' })),
          rewards: DEFAULT_REWARDS.map(r => ({ ...r, categoryId: 'snack' })),
        },
        meta: { lastClearAt: 0, profileUpdatedAt: 0, catalogUpdatedAt: 0, updatedAt: 0 },
      }));
      state = loadLocal();
      render();
    });
    await expect(page.locator('.earn-item').filter({ hasText: '自己洗手' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.catalog-section-title')).toHaveCount(0);
  });

  test('自定义目录会写入 localStorage', async ({ page }) => {
    await openTaskManage(page);
    await addCatalogItem(page, { type: 'tasks', name: CUSTOM_TASK, pts: 4 });
    await page.locator('#taskManageView .back-btn').click();
    await page.locator('.menu-item').filter({ hasText: '奖励管理' }).click();
    await addCatalogItem(page, { type: 'rewards', name: CUSTOM_REWARD, pts: 12 });

    const stored = await page.evaluate(({ taskName, rewardName }) => {
      const raw = localStorage.getItem(KEY);
      const data = JSON.parse(raw);
      const task = data.catalog.tasks.find(t => t.name === taskName);
      const reward = data.catalog.rewards.find(r => r.name === rewardName);
      return {
        hasTask: !!task && !task.preset && task.pts === 4 && task.enabled,
        hasReward: !!reward && !reward.preset && reward.pts === 12 && reward.enabled,
        noCategories: !data.catalog.taskCategories && !data.catalog.rewardCategories,
        catalogUpdatedAt: data.meta.catalogUpdatedAt > 0,
      };
    }, { taskName: CUSTOM_TASK, rewardName: CUSTOM_REWARD });

    expect(stored.hasTask).toBe(true);
    expect(stored.hasReward).toBe(true);
    expect(stored.noCategories).toBe(true);
    expect(stored.catalogUpdatedAt).toBe(true);
  });
});
