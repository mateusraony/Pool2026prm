import { test, expect } from '@playwright/test';

/**
 * E2E: Core navigation flows
 * Tests that all main routes of the SPA are accessible without crashing.
 */

const MAIN_ROUTES = [
  '/dashboard',
  '/recommended',
  '/pools',
  '/radar',
  '/alerts',
  '/scout-settings',
  '/status',
];

test.describe('Navigation', () => {
  for (const route of MAIN_ROUTES) {
    test(`${route} renders without JS crash`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      // Filter out network errors (API not available in test env)
      const criticalErrors = errors.filter(
        (e) => !e.includes('fetch') && !e.includes('network') && !e.includes('ERR_')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }

  test('root / redirects to dashboard or known route', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Should not be a blank page
    const body = await page.locator('body').innerHTML();
    expect(body.trim().length).toBeGreaterThan(100);
  });

  test('favorites page is accessible', async ({ page }) => {
    await page.goto('/favorites');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL('/error');
  });

  test('compare page is accessible', async ({ page }) => {
    await page.goto('/compare');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL('/error');
  });
});
