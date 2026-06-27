const { defineConfig } = require('@playwright/test');

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome';

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
