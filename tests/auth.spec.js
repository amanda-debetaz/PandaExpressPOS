const { test, expect } = require('@playwright/test');

test.describe('Login View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/logout');
    await page.goto('/login');
  });

  // 1. Valid Login
  test('should log in with valid credentials', async ({ page }) => {
    await page.fill('#employee_id', '1'); // Update with a real ID from your seed
    await page.fill('#password_hash', 'password'); // Update with real password
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*(\/|\/manager)/);
  });

  // 2. Invalid Credentials
  test('should show error on invalid credentials', async ({ page }) => {
    await page.fill('#employee_id', '9999');
    await page.fill('#password_hash', 'wrongpass');
    await page.click('button[type="submit"]');
    await expect(page.locator('.error-message')).toBeVisible();
  });

  // 3. Google OAuth Link
  test('should initiate Google OAuth flow', async ({ page }) => {
    await page.click('.google-login');
    // We expect a redirect to accounts.google.com
    await expect(page).toHaveURL(/.*accounts\.google\.com.*/);
  });

  // 4. Client-Side Validation (Empty Fields)
  test('should require fields before submission', async ({ page }) => {
    // Click submit without filling anything
    await page.click('button[type="submit"]');
    
    // Check validation message (browser native check)
    const input = page.locator('#employee_id');
    const validationMessage = await input.evaluate((element) => element.validationMessage);
    expect(validationMessage).not.toBe('');
  });

  // 5. Protected Route Access (Edge Case)
  test('should redirect to login if accessing manager page directly', async ({ page }) => {
    await page.goto('/manager');
    // Should be kicked back to login
    await expect(page).toHaveURL(/.*\/login.*/);
  });
});