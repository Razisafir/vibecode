/**
 * E2E Test: Auto-Update and Settings
 *
 * Validates the auto-update system and application settings.
 */

import { test, expect } from '@playwright/test';
import { launchApp, ipcCall } from './fixtures/electron-fixture';

test.describe('Auto-Update System', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should get update status', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'updater', 'status');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.status).toBeTruthy();
    expect(result.data.status.channel).toBeDefined();
  });

  test('should set update channel', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'updater', 'setChannel', 'beta');
    expect(result.success).toBe(true);
    expect(result.data.channel).toBe('beta');

    // Reset to stable
    await ipcCall(ctx.page, 'updater', 'setChannel', 'stable');
  });

  test('should handle update check gracefully in dev mode', async () => {
    ctx = await launchApp();

    // In development mode, update checks should fail gracefully
    const result = await ipcCall(ctx.page, 'updater', 'check', true);
    // Should return a status even if check fails
    expect(result).toBeTruthy();
  });
});

test.describe('App Information', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should get app version', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'app', 'getVersion');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  test('should get telemetry metrics', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'telemetry', 'getMetrics');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.memory).toBeTruthy();
    expect(result.data.ipc).toBeTruthy();
  });
});
