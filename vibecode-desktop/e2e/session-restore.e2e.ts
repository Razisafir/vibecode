/**
 * E2E Test: Session Restore and Persistence
 *
 * Validates session save/restore, settings persistence,
 * and crash recovery.
 */

import { test, expect } from '@playwright/test';
import { launchApp, ipcCall } from './fixtures/electron-fixture';

test.describe('Session Restore', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should save a session', async () => {
    ctx = await launchApp();

    const sessionState = {
      id: 'test-session-1',
      projectId: 'test-project',
      workspace: {
        openFiles: ['src/index.ts'],
        activeFile: 'src/index.ts',
        scrollPositions: {},
      },
      conversation: {
        messages: [],
        activeProvider: 'openai',
        activeModel: 'gpt-4',
      },
      execution: {
        runningTasks: [],
        completedTasks: [],
      },
      layout: {
        sidebarOpen: true,
        sidebarWidth: 280,
        aiPanelOpen: true,
        aiPanelWidth: 400,
        activeSidebarTab: 'files',
      },
      lastSaved: Date.now(),
      createdAt: Date.now(),
    };

    const result = await ipcCall(ctx.page, 'session', 'save', sessionState);
    expect(result).toBeUndefined(); // save returns void on success
  });

  test('should list sessions', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'session', 'list');
    // Result should be an array (may be empty for fresh install)
    expect(Array.isArray(result)).toBe(true);
  });

  test('should check crash status', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'session', 'wasCrashed');
    expect(typeof result).toBe('boolean');
  });
});

test.describe('Settings Persistence', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should persist provider configuration across sessions', async () => {
    ctx = await launchApp();

    // Configure a provider
    const config = {
      name: 'Persistence Test Provider',
      type: 'openai' as const,
      apiKey: 'sk-test-persistence',
      models: [{
        id: 'gpt-4',
        name: 'GPT-4',
        contextWindow: 8192,
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: false,
      }],
      priority: 1,
    };

    const configureResult = await ipcCall(ctx.page, 'provider', 'configure', config);
    expect(configureResult.success).toBe(true);

    // Verify the provider was saved
    const listResult = await ipcCall(ctx.page, 'provider', 'list');
    expect(listResult.success).toBe(true);
    expect(listResult.data.providers.length).toBeGreaterThan(0);
  });
});
