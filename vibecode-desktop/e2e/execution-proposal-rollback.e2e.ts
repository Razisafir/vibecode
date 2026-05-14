/**
 * E2E Test: Execution, Proposals, and Rollback
 *
 * Validates the execution engine, proposal generation,
 * plan approval, diff previews, and rollback functionality.
 */

import { test, expect } from '@playwright/test';
import { launchApp, ipcCall, createTestWorkspace, getMockProviderConfig } from './fixtures/electron-fixture';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Execution Engine', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;
  let testWorkspace: string;

  test.beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-exec-'));
    testWorkspace = createTestWorkspace(tempDir);
  });

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should create an execution plan', async () => {
    ctx = await launchApp();

    // Open workspace first
    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    const result = await ipcCall(ctx.page, 'execution', 'plan', 'Test Plan', 'A test execution plan', [
      {
        title: 'Create file',
        description: 'Create a test file',
        type: 'file_create',
        params: { path: 'test-output.txt', content: 'Hello from VibeCode!' },
        riskLevel: 'low',
        requiresApproval: true,
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(result.data.plan).toBeTruthy();
    expect(result.data.plan.title).toBe('Test Plan');
    expect(result.data.plan.status).toBe('pending');
  });

  test('should list execution plans', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    // Create a plan first
    await ipcCall(ctx.page, 'execution', 'plan', 'List Test', 'Plan for listing', [
      {
        title: 'Step 1',
        description: 'First step',
        type: 'file_create',
        params: { path: 'list-test.txt', content: 'test' },
        riskLevel: 'low',
        requiresApproval: false,
      },
    ]);

    const result = await ipcCall(ctx.page, 'execution', 'listPlans');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
    expect(Array.isArray(result.data.plans)).toBe(true);
    expect(result.data.plans.length).toBeGreaterThan(0);
  });

  test('should approve and execute a plan', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    // Create a plan
    const planResult = await ipcCall(ctx.page, 'execution', 'plan', 'Execute Test', 'Plan for execution', [
      {
        title: 'Write file',
        description: 'Write a test file',
        type: 'file_create',
        params: { path: 'exec-test.txt', content: 'Executed!' },
        riskLevel: 'low',
        requiresApproval: true,
      },
    ]);

    const planId = planResult.data.plan.id;

    // Approve the plan
    const approveResult = await ipcCall(ctx.page, 'execution', 'approve', planId);
    expect(approveResult.success).toBe(true);

    // Execute the plan
    const executeResult = await ipcCall(ctx.page, 'execution', 'execute', planId);
    expect(executeResult.success).toBe(true);
  });

  test('should get plan status', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    const planResult = await ipcCall(ctx.page, 'execution', 'plan', 'Status Test', 'Plan for status check', [
      {
        title: 'Check step',
        description: 'Step for status check',
        type: 'file_create',
        params: { path: 'status-test.txt', content: 'status' },
        riskLevel: 'low',
        requiresApproval: false,
      },
    ]);

    const planId = planResult.data.plan.id;

    const statusResult = await ipcCall(ctx.page, 'execution', 'status', planId);
    expect(statusResult.success).toBe(true);
    expect(statusResult.data).toBeTruthy();
    expect(statusResult.data.plan).toBeTruthy();
  });
});

test.describe('Proposal System', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;
  let testWorkspace: string;

  test.beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-prop-'));
    testWorkspace = createTestWorkspace(tempDir);
  });

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should generate proposals from AI response', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    const aiResponse = `I'll create a new file for you:

\`\`\`typescript:src/hello.ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

And update the existing file:

\`\`\`typescript:src/index.ts
import { greet } from './hello';
console.log(greet('World'));
\`\`\``;

    const result = await ipcCall(ctx.page, 'proposal', 'generateFromResponse', aiResponse, {
      workspaceRoot: testWorkspace,
      projectId: 'test-project',
    });

    expect(result.success).toBe(true);
  });

  test('should list proposals', async () => {
    ctx = await launchApp();

    const result = await ipcCall(ctx.page, 'proposal', 'list');
    expect(result.success).toBe(true);
    expect(result.data).toBeTruthy();
  });
});

test.describe('Rollback System', () => {
  let ctx: Awaited<ReturnType<typeof launchApp>>;
  let testWorkspace: string;

  test.beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-rb-'));
    testWorkspace = createTestWorkspace(tempDir);
  });

  test.afterEach(async () => {
    if (ctx) {
      await ctx.cleanup();
    }
  });

  test('should rollback a plan', async () => {
    ctx = await launchApp();

    await ipcCall(ctx.page, 'workspace', 'open', testWorkspace);

    // Create and execute a plan
    const planResult = await ipcCall(ctx.page, 'execution', 'plan', 'Rollback Test', 'Plan for rollback', [
      {
        title: 'Create file for rollback',
        description: 'Create a file that will be rolled back',
        type: 'file_create',
        params: { path: 'rollback-test.txt', content: 'Will be rolled back' },
        riskLevel: 'low',
        requiresApproval: false,
      },
    ]);

    const planId = planResult.data.plan.id;

    // Execute first
    await ipcCall(ctx.page, 'execution', 'approve', planId);
    await ipcCall(ctx.page, 'execution', 'execute', planId);

    // Rollback
    const rollbackResult = await ipcCall(ctx.page, 'execution', 'rollbackPlan', planId);
    expect(rollbackResult.success).toBe(true);
  });
});
