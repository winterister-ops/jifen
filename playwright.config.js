const { defineConfig } = require('@playwright/test');

// 默认使用 Playwright 自带的 Chromium（已缓存，无需联网下载）。
// 如需改用系统已安装的浏览器，可设置 PLAYWRIGHT_BROWSER_CHANNEL=chrome 等。
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
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
