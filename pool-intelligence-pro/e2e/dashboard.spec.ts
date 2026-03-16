import { test, expect } from '@playwright/test';

/**
 * E2E: Dashboard page
 * Requires frontend dev server at http://localhost:5173
 */
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('loads without errors', async ({ page }) => {
    // No uncaught JS errors
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('shows the page title or main heading', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    // Should have either a heading or a sidebar with nav links
    const hasContent = await page.locator('h1, h2, nav, aside').first().isVisible();
    expect(hasContent).toBe(true);
  });

  test('sidebar navigation links are visible', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    // Sidebar should contain at least 3 navigation links
    const navLinks = page.locator('nav a, aside a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('navigating to /recommended works', async ({ page }) => {
    await page.goto('/recommended');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL('/error');
    // Page should render some content
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('navigating to /pools works', async ({ page }) => {
    await page.goto('/pools');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL('/error');
  });
});
