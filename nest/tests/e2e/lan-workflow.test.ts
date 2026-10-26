/**
 * Playwright E2E tests for LAN Access Workflow
 * Uses mocked OsAdapter for firewall/network operations
 */
import { test, expect } from '@playwright/test';

test.describe('LAN Access Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    // Wait for app to be ready
    await page.waitForFunction(() => window.nest !== undefined);
  });

  test('should navigate to Projects page', async ({ page }) => {
    await page.click('a[href="/projects"]');
    await expect(page.locator('h1:has-text("Projects")')).toBeVisible();
  });

  test('should show Register Application wizard', async ({ page }) => {
    await page.click('a[href="/projects"]');
    await page.click('button:has-text("Register Application")');
    await expect(page.locator('text=Register Application')).toBeVisible();
  });

  test('should create a test application', async ({ page }) => {
    await page.click('a[href="/projects"]');
    await page.click('button:has-text("Register Application")');
    
    // Fill in the registration wizard
    await page.fill('input[name="name"]', 'Test App');
    await page.fill('input[name="projectPath"]', 'C:\\Projects\\TestApp');
    await page.fill('input[name="executable"]', 'node');
    await page.fill('input[name="args"]', 'server.js');
    await page.fill('input[name="workingDirectory"]', 'C:\\Projects\\TestApp');
    await page.fill('input[name="port"]', '3000');
    await page.selectOption('select[name="protocol"]', 'http');
    await page.selectOption('select[name="lifecycleMode"]', 'managed');
    
    // Submit
    await page.click('button:has-text("Register")');
    
    // Should return to projects list
    await expect(page.locator('text=Test App')).toBeVisible({ timeout: 5000 });
  });

  test('should show LAN access workflow dialog for eligible app', async ({ page }) => {
    // First create an app with LAN launch profile
    await page.evaluate(async () => {
      await window.nest.apps.create({
        name: 'LAN Test App',
        projectPath: 'C:\\Projects\\LANTest',
        executable: 'node',
        args: ['server.js'],
        workingDirectory: 'C:\\Projects\\LANTest',
        port: 3001,
        protocol: 'http',
        lifecycleMode: 'managed',
        lanLaunchProfile: { args: ['-a', '0.0.0.0'], env: [] },
        healthCheck: { type: 'http', path: '/health', intervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
        env: [],
        expectedListenAddress: 'all',
        startupTimeoutMs: 30000,
      });
    });
    
    await page.reload();
    await page.click('a[href="/projects"]');
    
    // Wait for app to appear
    await expect(page.locator('text=LAN Test App')).toBeVisible({ timeout: 5000 });
    
    // Click Enable LAN Access (if app is eligible)
    const enableButton = page.locator('button:has-text("Enable LAN Access")').first();
    if (await enableButton.isVisible({ timeout: 2000 })) {
      await enableButton.click();
      
      // Workflow dialog should open
      await expect(page.locator('text=Enable LAN Access')).toBeVisible();
      
      // Step 1: Preconditions
      await expect(page.locator('text=Preconditions')).toBeVisible();
    }
  });

  test('should run diagnostics on an application', async ({ page }) => {
    await page.click('a[href="/diagnostics"]');
    await expect(page.locator('h1:has-text("Diagnostics")')).toBeVisible();
    
    // Select an app
    const select = page.locator('select').first();
    const options = await select.locator('option').all();
    if (options.length > 1) {
      await select.selectOption({ index: 1 });
      
      // Run diagnostics
      await page.click('button:has-text("Run Diagnostics")');
      
      // Wait for results
      await expect(page.locator('text=Diagnostic Report')).toBeVisible({ timeout: 10000 });
      
      // Check for step indicators
      await expect(page.locator('text=Process Running')).toBeVisible();
      await expect(page.locator('text=Port Listening')).toBeVisible();
      await expect(page.locator('text=Listener Binding')).toBeVisible();
      await expect(page.locator('text=Local HTTP Response')).toBeVisible();
      await expect(page.locator('text=Selected LAN IP')).toBeVisible();
      await expect(page.locator('text=Firewall Rule')).toBeVisible();
      await expect(page.locator('text=Protocol & Path')).toBeVisible();
      await expect(page.locator('text=Remote Device Reachability')).toBeVisible();
      await expect(page.locator('text=Possible External Causes')).toBeVisible();
    }
  });

  test('should show QR code modal when LAN URL available', async ({ page }) => {
    await page.click('a[href="/diagnostics"]');
    await page.waitForLoadState('domcontentloaded');
    
    // The QR button should be visible if there's a LAN URL
    const qrButton = page.locator('button:has-text("QR Code")');
    if (await qrButton.isVisible({ timeout: 2000 })) {
      await qrButton.click();
      await expect(page.locator('text=QR Code')).toBeVisible();
    }
  });
});

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.nest !== undefined);
  });

  test('should navigate to Settings', async ({ page }) => {
    await page.click('a[href="/settings"]');
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  });

  test('should show default access policy locked to Local only', async ({ page }) => {
    await page.click('a[href="/settings"]');
    await expect(page.locator('text=Default Access Policy: Local Only')).toBeVisible();
    await expect(page.locator('text=This setting is locked for security')).toBeVisible();
  });

  test('should show confirmation preferences', async ({ page }) => {
    await page.click('a[href="/settings"]');
    await expect(page.locator('text=Confirmation Preferences')).toBeVisible();
    await expect(page.locator('text=LAN Access Confirmation')).toBeVisible();
    await expect(page.locator('text=Firewall Changes')).toBeVisible();
  });

  test('should show preferred interface selection', async ({ page }) => {
    await page.click('a[href="/settings"]');
    await expect(page.locator('text=Preferred Network Interface')).toBeVisible();
  });

  test('should show logging settings', async ({ page }) => {
    await page.click('a[href="/settings"]');
    await expect(page.locator('text=Retention (days)')).toBeVisible();
    await expect(page.locator('text=Max lines per app')).toBeVisible();
  });
});

test.describe('Network Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.nest !== undefined);
  });

  test('should navigate to Network', async ({ page }) => {
    await page.click('a[href="/network"]');
    await expect(page.locator('h1:has-text("Network")')).toBeVisible();
  });

  test('should show network interfaces', async ({ page }) => {
    await page.click('a[href="/network"]');
    await expect(page.locator('text=Network Interfaces')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.nest !== undefined);
  });

  test('should show dashboard with stats', async ({ page }) => {
    await expect(page.locator('text=Applications')).toBeVisible();
  });

  test('should show LAN IP and network profile', async ({ page }) => {
    await expect(page.locator('text=LAN IP')).toBeVisible({ timeout: 5000 });
  });
});