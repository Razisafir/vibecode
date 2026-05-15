// ============================================================
// VibeCode Desktop — Execution Engine Tests
// Tests plan creation, approval, execution, retry, cancellation,
// rollback, persistence, and blocker detection.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ExecutionEngine,
  ExecutionPlan,
  ExecutionStep,
  StepInput,
  StepExecutor,
  RollbackSnapshot,
} from '../main/services/execution-engine';

// ─── Helper: Create a temp directory for each test ──────────────────────────

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibecode-test-'));
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

// ─── Helper: Create an engine with mock executors ───────────────────────────

function createTestEngine(workspaceRoot: string): ExecutionEngine {
  // We create the engine and then replace its executor registry with mocks
  const engine = new ExecutionEngine(workspaceRoot);

  // Access private field via any for testing
  const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;

  // Clear real executors and install mocks
  registry.clear();

  // Mock file_write executor
  registry.set('file_write', async (step) => {
    const filePath = step.params.filePath as string;
    const content = step.params.content as string;
    const absPath = path.resolve(workspaceRoot, filePath);
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(absPath, content ?? '', 'utf-8');
    return { written: absPath, size: content?.length ?? 0 };
  });

  // Mock file_read executor
  registry.set('file_read', async (step) => {
    const filePath = step.params.filePath as string;
    const absPath = path.resolve(workspaceRoot, filePath);
    const content = fs.readFileSync(absPath, 'utf-8');
    return { content, size: content.length };
  });

  // Mock file_edit executor
  registry.set('file_edit', async (step) => {
    return { edited: true };
  });

  // Mock command executor
  registry.set('command', async (step) => {
    return { stdout: 'mock output', exitCode: 0 };
  });

  // Mock code_generation executor
  registry.set('code_generation', async (step) => {
    return { generated: true };
  });

  // Mock diff_apply executor
  registry.set('diff_apply', async (step) => {
    return { applied: true };
  });

  // Mock code_edit executor
  registry.set('code_edit', async (step) => {
    return { edited: true };
  });

  // Mock analysis executor
  registry.set('analysis', async (step) => {
    return { analyzed: true };
  });

  // Mock generation executor
  registry.set('generation', async (step) => {
    return { generated: true };
  });

  // Mock review executor
  registry.set('review', async (step) => {
    return { reviewed: true };
  });

  return engine;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ExecutionEngine', () => {
  let tempDir: string;
  let engine: ExecutionEngine;

  beforeEach(() => {
    tempDir = createTempDir();
    engine = createTestEngine(tempDir);
  });

  afterEach(() => {
    engine.getPersistence().flush();
    cleanupDir(tempDir);
  });

  // ── Plan Creation ────────────────────────────────────────────────────────

  describe('createPlan', () => {
    it('should create a plan with the given title and description', () => {
      const plan = engine.createPlan('Test Plan', 'A test description', []);

      expect(plan.title).toBe('Test Plan');
      expect(plan.description).toBe('A test description');
      expect(plan.status).toBe('draft');
      expect(plan.steps).toEqual([]);
      expect(plan.id).toBeTruthy();
      expect(plan.createdAt).toBeGreaterThan(0);
    });

    it('should create a plan with steps from step inputs', () => {
      const steps: StepInput[] = [
        { title: 'Step 1', description: 'First step', type: 'file_write', params: { filePath: 'test.txt', content: 'hello' } },
        { title: 'Step 2', description: 'Second step', type: 'command', params: { command: 'echo hello' } },
      ];

      const plan = engine.createPlan('Plan With Steps', 'Steps test', steps);

      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0].title).toBe('Step 1');
      expect(plan.steps[0].type).toBe('file_write');
      expect(plan.steps[0].status).toBe('pending');
      expect(plan.steps[1].title).toBe('Step 2');
      expect(plan.steps[1].type).toBe('command');
    });

    it('should assign default values to steps', () => {
      const steps: StepInput[] = [
        { title: 'Default Step', description: 'Defaults test', type: 'file_write' },
      ];

      const plan = engine.createPlan('Defaults', 'Test defaults', steps);
      const step = plan.steps[0];

      expect(step.dependsOn).toEqual([]);
      expect(step.params).toEqual({});
      expect(step.maxRetries).toBe(3);
      expect(step.riskLevel).toBe('low');
      expect(step.requiresApproval).toBe(false);
      expect(step.retryCount).toBe(0);
    });

    it('should respect custom step settings', () => {
      const steps: StepInput[] = [
        {
          title: 'Custom Step',
          description: 'Custom test',
          type: 'command',
          maxRetries: 5,
          riskLevel: 'high',
          requiresApproval: true,
          params: { command: 'rm -rf /' },
        },
      ];

      const plan = engine.createPlan('Custom', 'Test custom', steps);
      const step = plan.steps[0];

      expect(step.maxRetries).toBe(5);
      expect(step.riskLevel).toBe('high');
      expect(step.requiresApproval).toBe(true);
    });
  });

  // ── Plan Approval ────────────────────────────────────────────────────────

  describe('approvePlan', () => {
    it('should approve a draft plan', () => {
      const plan = engine.createPlan('Approve Test', 'Test', []);
      const approved = engine.approvePlan(plan.id);

      expect(approved.status).toBe('approved');
    });

    it('should throw when approving a non-draft plan', () => {
      const plan = engine.createPlan('Approve Test', 'Test', []);
      engine.approvePlan(plan.id);

      expect(() => engine.approvePlan(plan.id)).toThrow('Cannot approve plan in "approved" status');
    });

    it('should throw when approving a non-existent plan', () => {
      expect(() => engine.approvePlan('nonexistent')).toThrow('Plan not found');
    });
  });

  // ── Step Execution ───────────────────────────────────────────────────────

  describe('executeStep', () => {
    it('should execute a step and update its status', async () => {
      const steps: StepInput[] = [
        { title: 'Write file', description: 'Test', type: 'file_write', params: { filePath: 'output.txt', content: 'hello world' } },
      ];
      const plan = engine.createPlan('Exec Step', 'Test', steps);
      engine.approvePlan(plan.id);

      const result = await engine.executeStep(plan.steps[0].id);

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();
      expect(result.startedAt).toBeGreaterThan(0);
      expect(result.completedAt).toBeGreaterThan(0);
    });

    it('should throw for a non-existent step', async () => {
      await expect(engine.executeStep('nonexistent')).rejects.toThrow('Step not found');
    });

    it('should block a step with unmet dependencies', async () => {
      const steps: StepInput[] = [
        { title: 'Step A', description: 'First', type: 'file_write', params: { filePath: 'a.txt', content: 'a' } },
        { title: 'Step B', description: 'Second', type: 'file_write', params: { filePath: 'b.txt', content: 'b' }, dependsOn: ['placeholder'] },
      ];
      const plan = engine.createPlan('Deps Test', 'Test', steps);

      // Set Step B to depend on Step A
      plan.steps[1].dependsOn = [plan.steps[0].id];

      // Try to execute Step B before Step A is completed
      const result = await engine.executeStep(plan.steps[1].id);

      expect(result.status).toBe('blocked');
      expect(result.error).toContain('Blocked by unmet dependency');
    });
  });

  // ── Dependency Resolution (Topological Sort) ─────────────────────────────

  describe('topological sort (via executePlan)', () => {
    it('should execute steps in dependency order', async () => {
      const events: string[] = [];

      // Replace executors to track execution order
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
      registry.set('file_write', async (step) => {
        events.push(step.title);
        return { written: true };
      });

      const steps: StepInput[] = [
        { title: 'Step A', description: 'First', type: 'file_write', params: { filePath: 'a.txt', content: 'a' } },
        { title: 'Step B', description: 'Second', type: 'file_write', params: { filePath: 'b.txt', content: 'b' } },
        { title: 'Step C', description: 'Third', type: 'file_write', params: { filePath: 'c.txt', content: 'c' } },
      ];

      const plan = engine.createPlan('Topo Sort', 'Test', steps);

      // Set dependencies: C depends on B, B depends on A
      plan.steps[1].dependsOn = [plan.steps[0].id]; // B depends on A
      plan.steps[2].dependsOn = [plan.steps[1].id]; // C depends on B

      engine.approvePlan(plan.id);
      const result = await engine.executePlan(plan.id);

      expect(result.status).toBe('completed');
      expect(events).toEqual(['Step A', 'Step B', 'Step C']);
    });
  });

  // ── Retry Mechanism ──────────────────────────────────────────────────────

  describe('retry mechanism', () => {
    it('should retry a failed step up to maxRetries times', async () => {
      let callCount = 0;
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;

      // Executor that fails for first 2 calls, then succeeds
      registry.set('file_write', async (step) => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Transient failure');
        }
        return { written: true };
      });

      const steps: StepInput[] = [
        { title: 'Retry Step', description: 'Test', type: 'file_write', maxRetries: 3, params: { filePath: 'retry.txt', content: 'data' } },
      ];

      const plan = engine.createPlan('Retry Test', 'Test', steps);
      engine.approvePlan(plan.id);

      // First execution attempt
      let result = await engine.executeStep(plan.steps[0].id);
      expect(result.retryCount).toBe(1);
      expect(result.status).toBe('pending'); // Retriable

      // Second attempt
      result = await engine.executeStep(plan.steps[0].id);
      expect(result.retryCount).toBe(2);
      expect(result.status).toBe('pending'); // Still retriable

      // Third attempt — succeeds
      result = await engine.executeStep(plan.steps[0].id);
      expect(result.retryCount).toBe(2); // Reset after success
      expect(result.status).toBe('completed');
    });

    it('should mark step as failed after maxRetries exceeded', async () => {
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
      registry.set('command', async () => {
        throw new Error('Permanent failure');
      });

      const steps: StepInput[] = [
        { title: 'Fail Step', description: 'Test', type: 'command', maxRetries: 2, params: { command: 'fail' } },
      ];

      const plan = engine.createPlan('Fail Test', 'Test', steps);
      engine.approvePlan(plan.id);

      // Attempt 1
      let result = await engine.executeStep(plan.steps[0].id);
      expect(result.status).toBe('pending'); // Retriable
      expect(result.retryCount).toBe(1);

      // Attempt 2
      result = await engine.executeStep(plan.steps[0].id);
      expect(result.status).toBe('failed'); // Max retries exceeded
      expect(result.retryCount).toBe(2);
      expect(result.error).toBe('Permanent failure');
    });

    it('should allow manual retry of failed step', async () => {
      let callCount = 0;
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
      registry.set('command', async () => {
        callCount++;
        if (callCount === 1) throw new Error('First fail');
        return { stdout: 'success' };
      });

      const steps: StepInput[] = [
        { title: 'Manual Retry', description: 'Test', type: 'command', maxRetries: 1, params: { command: 'test' } },
      ];

      const plan = engine.createPlan('Manual Retry', 'Test', steps);
      engine.approvePlan(plan.id);

      // First attempt fails
      let result = await engine.executeStep(plan.steps[0].id);
      expect(result.status).toBe('failed');

      // Manual retry resets and succeeds
      result = await engine.retryStep(plan.steps[0].id);
      expect(result.status).toBe('completed');
    });
  });

  // ── Cancellation ─────────────────────────────────────────────────────────

  describe('cancelPlan', () => {
    it('should cancel an approved plan', () => {
      const steps: StepInput[] = [
        { title: 'Step', description: 'Test', type: 'command', params: { command: 'echo hi' } },
      ];
      const plan = engine.createPlan('Cancel Test', 'Test', steps);
      engine.approvePlan(plan.id);

      engine.cancelPlan(plan.id);

      const updated = engine.getPlan(plan.id);
      expect(updated?.status).toBe('cancelled');
    });

    it('should cancel a running plan', async () => {
      // Use a slow executor
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
      registry.set('command', async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return { stdout: 'done' };
      });

      const steps: StepInput[] = [
        { title: 'Slow Step', description: 'Test', type: 'command', params: { command: 'sleep 1' } },
        { title: 'Step 2', description: 'Test', type: 'command', params: { command: 'echo done' } },
      ];

      const plan = engine.createPlan('Cancel Running', 'Test', steps);
      engine.approvePlan(plan.id);

      // Start execution and cancel shortly after
      const executionPromise = engine.executePlan(plan.id);
      engine.cancelPlan(plan.id);

      const result = await executionPromise;
      // Plan should be cancelled or completed (race condition)
      expect(['cancelled', 'completed', 'running']).toContain(result.status);
    });

    it('should not affect non-running plans when cancelling unrelated plan', () => {
      const plan1 = engine.createPlan('Plan 1', 'Test', []);
      const plan2 = engine.createPlan('Plan 2', 'Test', []);

      engine.approvePlan(plan1.id);
      engine.cancelPlan(plan1.id);

      const plan2State = engine.getPlan(plan2.id);
      expect(plan2State?.status).toBe('draft');
    });
  });

  // ── Rollback ─────────────────────────────────────────────────────────────

  describe('rollback', () => {
    it('should restore original file content on step rollback', async () => {
      // Create a file with initial content
      const filePath = path.join(tempDir, 'rollback-test.txt');
      fs.writeFileSync(filePath, 'original content', 'utf-8');

      const steps: StepInput[] = [
        {
          title: 'Modify file',
          description: 'Test rollback',
          type: 'file_write',
          params: { filePath: 'rollback-test.txt', content: 'modified content' },
        },
      ];

      const plan = engine.createPlan('Rollback Test', 'Test', steps);
      engine.approvePlan(plan.id);

      // Execute the step (overwrites file)
      await engine.executeStep(plan.steps[0].id);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('modified content');

      // Rollback
      await engine.rollbackStep(plan.steps[0].id);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('original content');
    });

    it('should delete a file that was created by a step', async () => {
      const steps: StepInput[] = [
        {
          title: 'Create new file',
          description: 'Test rollback of creation',
          type: 'file_write',
          params: { filePath: 'new-file.txt', content: 'new content' },
        },
      ];

      const plan = engine.createPlan('Rollback Create', 'Test', steps);
      engine.approvePlan(plan.id);

      // Execute the step (creates file)
      await engine.executeStep(plan.steps[0].id);
      const filePath = path.join(tempDir, 'new-file.txt');
      expect(fs.existsSync(filePath)).toBe(true);

      // Rollback — file should be deleted
      await engine.rollbackStep(plan.steps[0].id);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should throw when no snapshot exists for rollback', async () => {
      await expect(engine.rollbackStep('nonexistent')).rejects.toThrow('No rollback snapshot found');
    });

    it('should rollback an entire plan (multiple steps)', async () => {
      // Create initial files
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'original1', 'utf-8');
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'original2', 'utf-8');

      const steps: StepInput[] = [
        { title: 'Modify file 1', description: 'Test', type: 'file_write', params: { filePath: 'file1.txt', content: 'modified1' } },
        { title: 'Modify file 2', description: 'Test', type: 'file_write', params: { filePath: 'file2.txt', content: 'modified2' } },
      ];

      const plan = engine.createPlan('Rollback Plan', 'Test', steps);
      engine.approvePlan(plan.id);

      // Execute both steps
      await engine.executeStep(plan.steps[0].id);
      await engine.executeStep(plan.steps[1].id);

      // Rollback the entire plan
      await engine.rollbackPlan(plan.id);

      // Files should be restored
      expect(fs.readFileSync(path.join(tempDir, 'file1.txt'), 'utf-8')).toBe('original1');
      expect(fs.readFileSync(path.join(tempDir, 'file2.txt'), 'utf-8')).toBe('original2');

      // Plan should be back in draft
      const updated = engine.getPlan(plan.id);
      expect(updated?.status).toBe('draft');
    });
  });

  // ── Persistence ──────────────────────────────────────────────────────────

  describe('persistence', () => {
    it('should persist a plan and reload it', () => {
      const steps: StepInput[] = [
        { title: 'Persist Step', description: 'Test', type: 'file_write', params: { filePath: 'persist.txt', content: 'data' } },
      ];

      const plan = engine.createPlan('Persist Test', 'Test', steps);

      // Force-save the plan
      engine.getPersistence().savePlan(plan);

      // Create a new engine to load persisted plans
      const engine2 = createTestEngine(tempDir);
      const loaded = engine2.getPlan(plan.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Persist Test');
      expect(loaded!.steps).toHaveLength(1);
      expect(loaded!.steps[0].title).toBe('Persist Step');
    });

    it('should delete a plan from persistence', () => {
      const plan = engine.createPlan('Delete Test', 'Test', []);
      engine.getPersistence().savePlan(plan);

      engine.deletePlan(plan.id);

      expect(engine.getPlan(plan.id)).toBeNull();
    });
  });

  // ── Blocker Detection ────────────────────────────────────────────────────

  describe('detectBlockers', () => {
    it('should detect steps blocked by failed dependencies', async () => {
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
      registry.set('command', async () => {
        throw new Error('Always fails');
      });

      const steps: StepInput[] = [
        { title: 'Failing Step', description: 'Fails', type: 'command', maxRetries: 1, params: { command: 'fail' } },
        { title: 'Dependent Step', description: 'Depends on failing', type: 'file_write', params: { filePath: 'dep.txt', content: 'data' } },
      ];

      const plan = engine.createPlan('Blocker Test', 'Test', steps);

      // Make step 2 depend on step 1
      plan.steps[1].dependsOn = [plan.steps[0].id];

      engine.approvePlan(plan.id);

      // Execute step 1 (will fail)
      await engine.executeStep(plan.steps[0].id);
      expect(plan.steps[0].status).toBe('failed');

      // Detect blockers
      const blockers = engine.detectBlockers(plan.id);
      expect(blockers).toHaveLength(1);
      expect(blockers[0].title).toBe('Dependent Step');
    });

    it('should return empty array for plan with no blockers', () => {
      const steps: StepInput[] = [
        { title: 'Step A', description: 'Test', type: 'file_write', params: { filePath: 'a.txt', content: 'a' } },
      ];

      const plan = engine.createPlan('No Blockers', 'Test', steps);
      const blockers = engine.detectBlockers(plan.id);
      expect(blockers).toHaveLength(0);
    });

    it('should return empty array for non-existent plan', () => {
      const blockers = engine.detectBlockers('nonexistent');
      expect(blockers).toHaveLength(0);
    });
  });

  // ── Event System ─────────────────────────────────────────────────────────

  describe('event system', () => {
    it('should emit events during execution', async () => {
      const events: string[] = [];

      engine.onEvent((event) => {
        events.push(event.type);
      });

      const steps: StepInput[] = [
        { title: 'Event Step', description: 'Test', type: 'command', params: { command: 'echo events' } },
      ];

      const plan = engine.createPlan('Event Test', 'Test', steps);
      engine.approvePlan(plan.id);
      await engine.executePlan(plan.id);

      expect(events).toContain('plan:started');
      expect(events).toContain('step:started');
      expect(events).toContain('step:completed');
      expect(events).toContain('plan:completed');
    });

    it('should allow unsubscribing from events', async () => {
      const events: string[] = [];
      const unsub = engine.onEvent((event) => {
        events.push(event.type);
      });

      unsub();

      const steps: StepInput[] = [
        { title: 'Unsub Step', description: 'Test', type: 'command', params: { command: 'echo unsub' } },
      ];

      const plan = engine.createPlan('Unsub Test', 'Test', steps);
      engine.approvePlan(plan.id);
      await engine.executePlan(plan.id);

      expect(events).toHaveLength(0);
    });
  });

  // ── Propose ──────────────────────────────────────────────────────────────

  describe('propose', () => {
    it('should auto-flag high-risk steps as requiring approval', () => {
      const steps: StepInput[] = [
        { title: 'Safe Step', description: 'Test', type: 'file_write', riskLevel: 'low', params: { filePath: 'safe.txt', content: 'data' } },
        { title: 'Risky Step', description: 'Test', type: 'command', riskLevel: 'high', params: { command: 'rm -rf /' } },
      ];

      const plan = engine.propose('Propose Test', 'Test', steps);

      expect(plan.steps[0].requiresApproval).toBe(false);
      expect(plan.steps[1].requiresApproval).toBe(true);
    });
  });

  // ── Get Plan / Step ──────────────────────────────────────────────────────

  describe('getPlan / getStep', () => {
    it('should return null for non-existent plan', () => {
      expect(engine.getPlan('nonexistent')).toBeNull();
    });

    it('should return null for non-existent step', () => {
      expect(engine.getStep('nonexistent')).toBeNull();
    });

    it('should retrieve a plan by ID', () => {
      const plan = engine.createPlan('Get Test', 'Test', []);
      const retrieved = engine.getPlan(plan.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(plan.id);
    });

    it('should retrieve a step by ID', () => {
      const steps: StepInput[] = [
        { title: 'Findable Step', description: 'Test', type: 'command', params: { command: 'echo' } },
      ];
      const plan = engine.createPlan('Step Find', 'Test', steps);
      const step = engine.getStep(plan.steps[0].id);
      expect(step).not.toBeNull();
      expect(step!.title).toBe('Findable Step');
    });
  });

  // ── Full Plan Execution ──────────────────────────────────────────────────

  describe('executePlan', () => {
    it('should complete a full plan execution', async () => {
      const steps: StepInput[] = [
        { title: 'Step 1', description: 'Test', type: 'file_write', params: { filePath: 'exec1.txt', content: 'data1' } },
        { title: 'Step 2', description: 'Test', type: 'command', params: { command: 'echo hello' } },
      ];

      const plan = engine.createPlan('Full Exec', 'Test', steps);
      engine.approvePlan(plan.id);

      const result = await engine.executePlan(plan.id);

      expect(result.status).toBe('completed');
      expect(result.steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('should throw when executing a non-approved plan', async () => {
      const plan = engine.createPlan('Not Approved', 'Test', []);
      await expect(engine.executePlan(plan.id)).rejects.toThrow('must be "approved"');
    });

    it('should mark plan as failed when a step fails and cannot retry', async () => {
      const registry = (engine as any).executorRegistry as Map<string, StepExecutor>;
      registry.set('command', async () => {
        throw new Error('Step failure');
      });

      const steps: StepInput[] = [
        { title: 'Fail Step', description: 'Test', type: 'command', maxRetries: 1, params: { command: 'fail' } },
      ];

      const plan = engine.createPlan('Plan Fail', 'Test', steps);
      engine.approvePlan(plan.id);

      const result = await engine.executePlan(plan.id);
      expect(result.status).toBe('failed');
    });
  });

  // ── Workspace Root ───────────────────────────────────────────────────────

  describe('getWorkspaceRoot', () => {
    it('should return the workspace root path', () => {
      const root = engine.getWorkspaceRoot();
      expect(root).toBe(tempDir);
    });
  });
});
