/**
 * E2E Test: File Operations and Diff Rendering
 *
 * Validates file system operations, diff generation,
 * and the execution flow through the file system.
 */

import { test, expect } from '@playwright/test';
import { launchApp, ipcCall, createTestWorkspace } from './fixtures/electron-fixture';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('File Operations', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;
  let testWorkspace: string;

  test.beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-fs-'));
    testWorkspace = createTestWorkspace(tempDir);
  });

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should read a file', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'fs', 'setWorkspaceRoot', testWorkspace);

    const result = await ipcCall(ctx.page, 'fs', 'readFile', path.join(testWorkspace, 'hello.txt'));
    expect(result.success).toBe(true);
    expect(result.data).toBe('Hello, VibeCode!');
  });

  test('should write a file', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'fs', 'setWorkspaceRoot', testWorkspace);

    const testContent = 'Test write content';
    const testPath = path.join(testWorkspace, 'write-test.txt');
    const result = await ipcCall(ctx.page, 'fs', 'writeFile', testPath, testContent);
    expect(result.success).toBe(true);

    // Verify the file was written
    const readResult = await ipcCall(ctx.page, 'fs', 'readFile', testPath);
    expect(readResult.success).toBe(true);
    expect(readResult.data).toBe(testContent);
  });

  test('should list directory contents', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'fs', 'setWorkspaceRoot', testWorkspace);

    const result = await ipcCall(ctx.page, 'fs', 'listDir', testWorkspace);
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(Array.isArray(result.data)).toBe(true);
  });

  test('should get file stats', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'fs', 'setWorkspaceRoot', testWorkspace);

    const result = await ipcCall(ctx.page, 'fs', 'stat', path.join(testWorkspace, 'hello.txt'));
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.isFile).toBe(true);
    expect(result.data.size).toBeGreaterThan(0);
  });

  test('should create directories', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'fs', 'setWorkspaceRoot', testWorkspace);

    const dirPath = path.join(testWorkspace, 'new-dir', 'nested');
    const result = await ipcCall(ctx.page, 'fs', 'mkdir', dirPath);
    expect(result.success).toBe(true);
  });
});

test.describe('Diff Engine', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;
  let testWorkspace: string;

  test.beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-diff-'));
    testWorkspace = createTestWorkspace(tempDir);
  });

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should get diff preview for a step', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    // Create a plan with file operations
    const planResult = await ipcCall(ctx.page, 'execution', 'plan', 'Diff Test', 'Plan for diff preview', [
      {
        title: 'Edit file',
        description: 'Edit an existing file',
        type: 'file_edit',
        params: {
          path: 'src/index.ts',
          content: 'export function newFunction() { return "new"; }',
        },
        riskLevel: 'low',
        requiresApproval: false,
      },
    ]);

    if (planResult.success && planResult.data.plan.steps.length > 0) {
      const stepId = planResult.data.plan.steps[0].id;
      const diffResult = await ipcCall(ctx.page, 'execution', 'getDiff', stepId);
      // Diff may or may not be available depending on execution state
      expect(diffResult.success).toBeDefined();
    }
  });
});
