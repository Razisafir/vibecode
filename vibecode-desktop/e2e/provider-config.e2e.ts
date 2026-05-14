/**
 * E2E Test: Provider Configuration
 *
 * Validates provider management through the UI and IPC.
 */

import { test, expect } from '@playwright/test';
import { launchApp, waitForAppReady, dismissOnboarding, ipcCall, getMockProviderConfig } from './fixtures/electron-fixture';

test.describe('Provider Configuration', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should list default providers', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'provider', 'list');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.providers).toBeDefined();
    expect(Array.isArray(result.data.providers)).toBe(true);
  });

  test('should configure a new provider', async () => {
    ctx = await launchApp();

    const config = getMockProviderConfig();
    const result = await ipcCall(ctx.page, 'provider', 'configure', config);

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.provider).toBeTruthy();
    expect(result.data.provider.name).toBe(config.name);
    expect(result.data.provider.type).toBe(config.type);
  });

  test('should set active provider', async () => {
    ctx = await launchApp();

    // Configure a provider first
    const config = getMockProviderConfig();
    const configureResult = await ipcCall(ctx.page, 'provider', 'configure', config);
    expect(configureResult.success).toBe(true);

    const providerId = configureResult.data.provider.id;

    // Set it as active
    const setActiveResult = await ipcCall(ctx.page, 'provider', 'setActive', providerId);
    expect(setActiveResult.success).toBe(true);

    // Verify it's active
    const getActiveResult = await ipcCall(ctx.page, 'provider', 'getActive');
    expect(getActiveResult.success).toBe(true);
    expect(getActiveResult.data.provider).toBeTruthy();
    expect(getActiveResult.data.provider.id).toBe(providerId);
  });

  test('should remove a provider', async () => {
    ctx = await launchApp();

    // Configure a provider
    const config = getMockProviderConfig();
    const configureResult = await ipcCall(ctx.page, 'provider', 'configure', config);
    const providerId = configureResult.data.provider.id;

    // Remove it
    const removeResult = await ipcCall(ctx.page, 'provider', 'remove', providerId);
    expect(removeResult.success).toBe(true);
    expect(removeResult.data.removed).toBe(true);
  });

  test('should test provider connection', async () => {
    ctx = await launchApp();

    const config = getMockProviderConfig();
    const configureResult = await ipcCall(ctx.page, 'provider', 'configure', config);
    const providerId = configureResult.data.provider.id;

    // Test the connection (will fail with mock key, but the flow should work)
    const testResult = await ipcCall(ctx.page, 'provider', 'test', providerId);
    // The test itself may fail (mock key), but the IPC should succeed
    expect(testResult.success).toBe(true);
  });
});
