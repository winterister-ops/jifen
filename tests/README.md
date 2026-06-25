# 自动化测试

本项目使用 [Playwright Test](https://playwright.dev/) 做端到端测试，覆盖登录、新用户引导、积分、任务/奖励管理、记录页与云同步合并逻辑。

## 安装

```bash
npm install
npx playwright install chromium
```

若下载浏览器较慢，可配置本地代理后再安装：

```bash
export HTTP_PROXY=http://127.0.0.1:7897
export HTTPS_PROXY=http://127.0.0.1:7897
npx playwright install chromium
```

## 运行

```bash
npm test
```

Playwright 会自动启动 `python3 -m http.server 8080`（若 8080 端口已有服务则复用）。也可手动启动静态服务后再跑测试。

带 UI 调试：

```bash
npm run test:ui
```

运行单个文件：

```bash
npx playwright test tests/catalog.spec.js
```

## 测试文件

| 文件 | 说明 |
|------|------|
| `smoke.spec.js` | 登录页基础展示 |
| `onboarding.spec.js` | 新用户引导三步流程、已完成用户跳过引导、习惯计划重配 |
| `points.spec.js` | 完成任务加分、积分不足提示、兑换扣减 |
| `catalog.spec.js` | 任务/奖励管理：增删改、启停、预设保护、分值排序、localStorage |
| `sync.spec.js` | `mergeStates` / `normalizeState` 等云同步合并逻辑 |
| `history.spec.js` | 记录删除与积分重算；`jumpToHistoryDate` 连续跳转、周历切换；云端历史分页与异步渲染 |
| `helpers.js` | 注入 Firebase / Firestore 桩、自动登录、引导流程辅助、`openTaskManage` 等公共函数 |

## 测试环境说明

- 测试通过 `helpers.js` 拦截 Firebase SDK 请求，并用桩账号自动进入主界面，无需真实网络与数据库。
- `helpers.js` 内含轻量 Firestore 桩（含 `count()` 聚合），用于记录分页等用例。
- 每个测试用例使用独立的浏览器上下文，localStorage 互不干扰。
- 默认无头模式（`headless: true`），超时 30 秒。

## 编写新用例

```javascript
const { test, expect } = require('@playwright/test');
const { gotoLoggedInApp, openTaskManage, addCatalogItem, goHome } = require('./helpers');

test('示例', async ({ page }) => {
  await gotoLoggedInApp(page);
  // ...
});
```

管理页「添加」按钮选择器：`.catalog-add-pill`。启用/停用开关需点击 `.catalog-toggle`（checkbox 被 CSS 隐藏）。
