import { test, expect } from '@playwright/test';

/**
 * E2E: Pool Detail page
 * Tests navigation and UI elements on the pool detail page.
 * Uses a synthetic address — the app should gracefully handle API errors.
 */

const SAMPLE_CHAIN = 'ethereum';
const SAMPLE_ADDRESS = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';

test.describe('Pool Detail Page', () => {
  test('pool detail page loads without crashing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`/pools/${SAMPLE_CHAIN}/${SAMPLE_ADDRESS}`);
    await page.waitForLoadState('domcontentloaded');

    // No React crash / ErrorBoundary triggered
    const errorBoundary = page.locator('[data-testid="error-boundary"], .error-boundary');
    await expect(errorBoundary).toHaveCount(0);
  });

  test('shows loading state initially', async ({ page }) => {
    await page.goto(`/pools/${SAMPLE_CHAIN}/${SAMPLE_ADDRESS}`);
    // Either loading indicator or content should appear
    const hasLoadingOrContent = await page
      .locator('[class*="animate-pulse"], [class*="skeleton"], h1, h2, [class*="spinner"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasLoadingOrContent).toBe(true);
  });

  test('direct URL navigation to pool detail does not 404', async ({ page }) => {
    const response = await page.goto(`/pools/${SAMPLE_CHAIN}/${SAMPLE_ADDRESS}`);
    // SPA routing: the HTML shell should always return 200
    expect(response?.status()).toBe(200);
  });

  test('pool analytics route is accessible', async ({ page }) => {
    await page.goto(`/analytics/${SAMPLE_CHAIN}/${SAMPLE_ADDRESS}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL('/error');
  });
});
