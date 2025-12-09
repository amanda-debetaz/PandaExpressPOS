const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  use: {
    // This tells Playwright to put "http://localhost:3000" in front of every path
    baseURL: 'http://localhost:3000', 
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    // This command starts your app automatically before running tests
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});