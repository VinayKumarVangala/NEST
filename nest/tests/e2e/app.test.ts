/**
 * Playwright E2E tests for Electron app
 */
import { test, expect } from '@playwright/test';

test.describe('NEST Electron App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should show NEST title', async ({ page }) => {
    await expect(page.locator('h1:has-text("NEST")')).toBeVisible();
  });

  test('should show Dashboard by default', async ({ page }) => {
    await expect(page.locator('text=Applications')).toBeVisible();
  });

  test('renderer cannot access require', async ({ page }) => {
    const result = await page.evaluate(() => {
      // @ts-ignore
      return typeof require;
    });
    expect(result).toBe('undefined');
  });

  test('renderer cannot access process', async ({ page }) => {
    const result = await page.evaluate(() => {
      // @ts-ignore
      return typeof process;
    });
    expect(result).toBe('undefined');
  });

  test('renderer cannot access nodeIntegration', async ({ page }) => {
    const result = await page.evaluate(() => {
      // @ts-ignore
      return typeof module;
    });
    expect(result).toBe('undefined');
  });

  test('navigation to Projects works', async ({ page }) => {
    await page.click('a[href="/projects"]');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible();
  });

  test('navigation to Network works', async ({ page }) => {
    await page.click('a[href="/network"]');
    await expect(page.locator('h1:has-text("Network")')).toBeVisible();
  });

  test('navigation to Logs works', async ({ page }) => {
    await page.click('a[href="/logs"]');
    await expect(page.locator('h1:has-text("Logs")')).toBeVisible();
  });

  test('navigation to Settings works', async ({ page }) => {
    await page.click('a[href="/settings"]');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  });

  test('navigation to Diagnostics works', async ({ page }) => {
    await page.click('a[href="/diagnostics"]');
    await expect(page.locator('h1:has-text("Diagnostics")')).toBeVisible();
  });

  test('CSP headers are present', async ({ page }) => {
    const response = await page.goto('http://localhost:5173');
    const headers = response?.headers();
    expect(headers?.['content-security-policy']).toBeDefined();
  });

  test('window.nest API is exposed', async ({ page }) => {
    const hasNest = await page.evaluate(() => {
      return typeof window.nest !== 'undefined';
    });
    expect(hasNest).toBe(true);
  });

  test('window.nest.apps.list is callable', async ({ page }) => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return await window.nest.apps.list();
    });
    expect(result).toHaveProperty('ok');
  });
});
