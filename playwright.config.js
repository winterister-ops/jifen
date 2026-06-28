const { defineConfig } = require('@playwright/test');

// 默认使用 Playwright 自带的 Chromium（已缓存，无需联网下载）。
// 如需改用系统已安装的浏览器，可设置 PLAYWRIGHT_BROWSER_CHANNEL=chrome 等。
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined;

// CI 上 python3 -m http.server 为单线程，多 worker 并发易触发 broken pipe 抖动；
// 故在 CI 收敛为单 worker 并允许重试，规避偶发失败。本地保持并行、零重试。
const isCI = !!process.env.CI;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:8080',
    channel: browserChannel,
    headless: true,
  },
  webServer: {
    command: 'python3 -m http.server 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
