/**
 * E2E Test: Workspace Operations
 *
 * Validates workspace opening, closing, recent workspaces,
 * and file operations.
 */

import { test, expect } from '@playwright/test';
import { launchApp, waitForAppReady, ipcCall, createTestWorkspace } from './fixtures/electron-fixture';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Workspace Operations', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;
  let testWorkspace: string;

  test.beforeAll(async () => {
    // Create a persistent test workspace
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-ws-'));
    testWorkspace = createTestWorkspace(tempDir);
  });

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should open a workspace', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);
    expect(result.success).toBe(true);
  });

  test('should get workspace info after opening', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);
    const result = await ipcCall(ctx.page, 'workspace', 'getInfo');

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.workspace).toBeTruthy();
    expect(result.data.workspace.rootPath).toBe(testWorkspace);
  });

  test('should list recent workspaces', async () => {
    ctx = await launchApp();

    // Open a workspace first
    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    const result = await ipcCall(ctx.page, 'workspace', 'recent');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(Array.isArray(result.data.workspaces)).toBe(true);
  });

  test('should search files in workspace', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    const result = await ipcCall(ctx.page, 'workspace', 'searchFiles', '*.ts');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(Array.isArray(result.data.files)).toBe(true);
  });

  test('should close workspace', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);
    const result = await ipcCall(ctx.page, 'workspace', 'close');
    expect(result.success).toBe(true);
  });
});
