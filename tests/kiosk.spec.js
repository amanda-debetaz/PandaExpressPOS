const { test, expect } = require('@playwright/test');

test.describe('Self-Service Kiosk', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/kiosk');
    // Dismiss landing page if present
    if (await page.isVisible('#landing-page')) {
      await page.click('#landing-page');
    }
  });

  // 1. Navigate to Builder (Bowl, Plate, Bigger Plate)
  test('should navigate to builder page when clicking Plate', async ({ page }) => {
    // Ensure we are on Entrees/Meals category
    await page.click('button[data-category="entrees"]');
    
    // Click "Plate" card
    // Note: We expect this to trigger a navigation, not a modal
    await page.click('.item-card[data-name="Plate"]');
    
    // Verify URL changes to the builder
    await expect(page).toHaveURL(/.*\/builder\/plate/);
  });

  // 2. Add A La Carte Item (Modal Flow)
  test('should add single item to cart via modal', async ({ page }) => {
    // Switch to A La Carte to find individual items
    await page.click('button[data-category="a_la_carte"]');
    
    // Click an item that is NOT a meal bundle
    await page.click('.item-card[data-name="The Original Orange Chicken"]');
    
    // Expect Item Modal to appear
    await expect(page.locator('#item-modal')).toBeVisible();
    
    // Click Add
    await page.click('#item-add');
    
    // Verify Cart Count increased
    await expect(page.locator('#cart-count')).toHaveText('1');
  });

  // 3. Accessibility: Text Size
  test('should toggle text sizes', async ({ page }) => {
    await page.click('#accessibility-toggle');
    await page.click('button[data-size="large"]');
    
    // Check if HTML root has the class applied
    const html = page.locator('html');
    await expect(html).toHaveClass(/text-size-large/);
  });

  // 4. Accessibility: Call Staff
  test('should trigger staff help request', async ({ page }) => {
    await page.click('#call-staff-btn');
    
    // Button should change text to indicate request sent
    await expect(page.locator('#call-staff-btn')).toContainText('Help Requested');
    // Button should be disabled to prevent spam
    await expect(page.locator('#call-staff-btn')).toBeDisabled();
  });

  // 5. Category Navigation
  test('should navigate between categories', async ({ page }) => {
    // Start at Entrees
    await expect(page.locator('#entrees')).toBeVisible();
    
    // Click Sides
    await page.click('button[data-category="sides"]');
    
    // Verify Sides visible, Entrees hidden
    await expect(page.locator('#sides')).toBeVisible();
    await expect(page.locator('#entrees')).toBeHidden();
  });
});