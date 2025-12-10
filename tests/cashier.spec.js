const { test, expect } = require('@playwright/test');

test.describe('Cashier Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#employee_id', '1002'); // USE VALID RENDER ID
    await page.fill('#password_hash', 'panda'); // USE VALID RENDER PASSWORD
    await page.click('button[type="submit"]');
    // Login flow if cashier view is protected
    await page.goto('/cashier'); 
  });

  // 1. Build Plate Meal
  test('should correctly build a Plate meal', async ({ page }) => {
    await page.click('button[data-name="Plate"]');
    await page.click('button[data-name="Fried Rice"]');
    await page.click('button[data-name="Honey Walnut Shrimp"]');
    await page.click('button[data-name="Mushroom Chicken"]');
    
    await expect(page.locator('#order-body')).toContainText('Plate (Fried Rice; Honey Walnut Shrimp, Mushroom Chicken)');
  });

  // 2. Search Autocomplete
  test('should filter items via search bar', async ({ page }) => {
    await page.fill('.search-input', 'Rangoon');
    await expect(page.locator('#search-suggestions')).toBeVisible();
    await expect(page.locator('#search-suggestions')).toContainText('Rangoon');
    
    // Select it
    await page.click('.search-suggestion-item');
    await expect(page.locator('#order-body')).toContainText('Rangoon');
  });

  // 3. Clock In Modal
  test('should open clock in modal', async ({ page }) => {
    await page.click('#clock-toggle-btn');
    await expect(page.locator('#clock-modal')).toBeVisible();
    await expect(page.locator('#clock-in-btn')).toBeVisible();
  });

  // 4. Void Item
  test('should remove item from order list', async ({ page }) => {
    // Add item first
    await page.click('button[data-name="Chicken Egg Roll"]');
    await expect(page.locator('#order-body')).toContainText('Egg Roll');
    
    // Click Void button (assuming it's the specific void button for the row)
    await page.locator('.btn-void').first().click();
    await expect(page.locator('#order-body')).not.toContainText('Egg Roll');
  });

  // 5. Empty Cart Block (Edge Case)
  test('should alert when paying with empty cart', async ({ page }) => {
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Cart is empty');
      dialog.accept();
    });
    await page.click('.btn-pay');
  });
});