const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  use: {
    // This tells Playwright to put "http://localhost:3000" in front of every path
    baseURL: 'https://team-31-project-3.onrender.com', 
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    // This command starts your app automatically before running tests
    command: 'npm start',
    url: 'https://team-31-project-3.onrender.com',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});