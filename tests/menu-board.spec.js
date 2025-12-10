const { test, expect } = require('@playwright/test');

test.describe('Menu Board', () => {
  // 1. Landing on Featured Page
  test('should load featured page by default', async ({ page }) => {
    await page.goto('/menu-board?page=featured');
    await expect(page.getByRole('heading', { name: 'FEATURED ITEMS' })).toBeVisible();
  });

  // 2. Navigation to Entrees (Pick a Meal)
  test('should navigate to Pick a Meal using navigation links', async ({ page }) => {
    await page.goto('/menu-board');
    await page.getByRole('link', { name: 'PICK A MEAL' }).click();
    await expect(page.getByRole('heading', { name: 'PICK A MEAL' })).toBeVisible();
  });

  // 3. Navigation to Sides
  test('should navigate to Sides using navigation links', async ({ page }) => {
    await page.goto('/menu-board');
    await page.getByRole('link', { name: 'SIDE CHOICES' }).click();
    await expect(page.getByRole('heading', { name: 'SIDE CHOICES' })).toBeVisible();
  });

  // 4. Autoscroll Toggle & Exit Button
  test('should toggle autoscroll and show exit button on hover', async ({ page }) => {
    await page.goto('/menu-board?page=featured');
    
    // 1. Start Autoscroll
    const startBtn = page.getByRole('button', { name: 'Start Autoscroll' });
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    
    // 2. Verify Container is visible
    const container = page.locator('#autoscroll-container');
    await expect(container).toBeVisible();
    
    // 3. Trigger Mouse Move to show Exit Button
    // We hover over the container to ensure the event listener fires
    await container.hover();
    // Move the mouse slightly to ensure the 'mousemove' event is registered
    await page.mouse.move(200, 200);
    await page.mouse.move(250, 250);

    // 4. Verify Exit Button becomes visible
    const exitBtn = page.locator('#exit-autoscroll');
    await expect(exitBtn).toBeVisible();

    // 5. Test Exit Functionality
    await exitBtn.click();
    await expect(container).toBeHidden();
  });

  // 5. Price Visibility (Data Check)
  test('should display item prices', async ({ page }) => {
    await page.goto('/menu-board?page=a_la_carte');
    
    // Verify that at least one price is rendered (looking for $)
    await expect(page.locator('.meal-price').first()).toContainText('$');
    
    // Verify at least one item card is present
    await expect(page.locator('.meal-option').first()).toBeVisible();
  });
});