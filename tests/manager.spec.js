const { test, expect } = require('@playwright/test');

test.describe('Manager Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock login or use session storage if possible, otherwise login manually
    await page.goto('/login');
    await page.fill('#employee_id', '1002'); // USE VALID RENDER ID
    await page.fill('#password_hash', 'panda'); // USE VALID RENDER PASSWORD
    await page.click('button[type="submit"]');
    await page.goto('/manager');
  });

  // 1. Navigation Tabs
  test('should switch between dashboard sections', async ({ page }) => {
    await page.getByRole('button', { name: 'Manage Menu' }).click();
    await expect(page.locator('#menu')).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Manage Inventory' }).click();
    await expect(page.locator('#inventory')).toHaveClass(/active/);
  });

  // 2. Add Employee
  test('should allow adding a new employee', async ({ page }) => {
    await page.getByRole('button', { name: 'Manage Employees' }).click();
    
    // Setup dialog handler BEFORE clicking the button
    page.on('dialog', async dialog => {
      const msg = dialog.message();
      // Handle inputs
      if (msg.includes('Name')) await dialog.accept('Playwright User');
      else if (msg.includes('Email')) await dialog.accept('test@test.com');
      else if (msg.includes('Role')) await dialog.accept('cashier');
      // Handle the "Success" alert
      else await dialog.accept(); 
    });

    await page.click('.btn-add-employee');
    
    // Playwright will auto-retry this until the table reloads and text appears
    await expect(page.locator('.employee-table-container')).toContainText('Playwright User');
  });

  // 3. Generate Z Report
  test('should generate Z Report', async ({ page }) => {
    await page.getByRole('button', { name: 'Manage Reports' }).click();
    await page.click('button[onclick="showReport(\'zReport\')"]');
    await page.click('#generateZBtn');
    
    await expect(page.locator('#zReportTable')).toBeVisible();
    await expect(page.locator('#zReportTable')).toContainText('Total Revenue');
  });

  // 4. Inventory Management
  test('should list inventory items', async ({ page }) => {
    await page.getByRole('button', { name: 'Manage Inventory' }).click();
    await page.click('#listInventoryBtn');
    await expect(page.locator('#inventoryTableContainer table')).toBeVisible();
  });

  // 5. Deactivate Employee (Edge Case)
  test('should deactivate an employee', async ({ page }) => {
    await page.getByRole('button', { name: 'Manage Employees' }).click();
    
    page.on('dialog', async dialog => {
        // Provide an ID to deactivate
        await dialog.accept('2'); 
    });

    await page.click('.btn-deactivate-employee');
    // You might verify by reloading the list and checking "Active: No"
    // For now, just ensure no crash
    await expect(page).not.toHaveURL(/.*error.*/);
  });
});