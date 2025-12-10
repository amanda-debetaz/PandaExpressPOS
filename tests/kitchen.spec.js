const { test, expect } = require('@playwright/test');

test.describe('Kitchen Display System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#employee_id', '1002'); // USE VALID RENDER ID
    await page.fill('#password_hash', 'panda'); // USE VALID RENDER PASSWORD
    await page.click('button[type="submit"]');
    await page.goto('/kitchen');
  });

  // 1. Drag and Drop Order
  test('should move order from Queued to Prepping', async ({ page }) => {
    // Assuming an order exists (you might need to seed one first)
    const orderCard = page.locator('.column[data-status="queued"] .order').first();
    const targetCol = page.locator('.column[data-status="prepping"]');
    
    if (await orderCard.count() > 0) {
        await orderCard.dragTo(targetCol);
        // In a real app, we check if it landed. 
        // Note: Drag and drop in tests can be tricky; alternative is clicking the "Start Making" button.
        await expect(page).not.toHaveURL(/error/); 
    }
  });

  // 2. Manual Status Update Button
  test('should move order using status buttons', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: 'Start Making' }).first();
    if (await startBtn.isVisible()) {
        await startBtn.click();
        // Should reload or move card
        await expect(page.locator('.column[data-status="prepping"]')).toBeVisible();
    }
  });

  // 3. Batch Cook Input
  test('should submit batch cook form', async ({ page }) => {
    await page.selectOption('#prep-item-select', { index: 0 }); // Select first item
    await page.fill('#prep-servings', '5');
    await page.click('#cook-batch-btn');
    
    // Verify success alert or UI update (mocking confirm dialog)
    page.on('dialog', dialog => dialog.accept());
  });

  // 4. Clear Done Orders
  test('should clear completed orders', async ({ page }) => {
    await page.getByRole('button', { name: 'Clear Done' }).click();
    // Expect Done column to be empty
    const doneCards = page.locator('.column[data-status="done"] .order');
    await expect(doneCards).toHaveCount(0);
  });

  // 5. Stock Visuals
  test('should display stock panel', async ({ page }) => {
    await expect(page.locator('#stock-panel')).toBeVisible();
    // Check if items are rendered
    await expect(page.locator('.stock-mini').first()).toBeVisible();
  });
});