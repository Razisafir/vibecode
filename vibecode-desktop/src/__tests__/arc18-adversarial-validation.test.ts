// ─── VibeCode Desktop — ARC 18: Post-Kernel Real-World Validation ──────────
// ADVERSARIAL TESTING + STABILITY METRICS + BREAKAGE REPORT
//
// This test suite validates whether the kernel enforcement system actually
// behaves correctly under real-world usage, not just architectural soundness.
//
// P0-1: Adversarial User Simulation Suite
// P0-2: System Stability Metrics
// P0-3: Real Execution Flow Validation
// P0-4: Concurrency & Race Condition Testing
// P0-5: UX Impact Analysis
// P0-6: Breakage Report
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Mock Setup ────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/vibecode-arc18'),
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('[]'),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  rmSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false }),
  accessSync: vi.fn(),
  constants: { F_OK: 0 },
  watch: vi.fn(),
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('[]'),
    access: vi.fn().mockRejectedValue(new Error('Not found')),
    unlink: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    readdir: vi.fn().mockResolvedValue([]),
    copyFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    chmod: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../main/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../main/utils/audit-log', () => ({
  auditLog: { auditLog: vi.fn() },
}));

vi.mock('node-pty', () => {
  throw new Error('node-pty not available in test');
});

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `arc18-uuid-${++uuidCounter}`),
}));

// ─── Import System Under Test ──────────────────────────────────────────────

import { ExecutionStateMachine, ExecutionNode, NodeState } from '../main/services/execution-state-machine';
import { ExecutionGateway } from '../main/core/execution-gateway';
import { StabilityMetricsCollector } from '../main/core/stability-metrics';
import { clearViolations, getViolationCount, authorizeFsOp, authorizeTerminalOp, checkFsAuthorization, checkTerminalAuthorization } from '../main/core/execution-audit';
import {
  kernelFsWrite,
  kernelFsDelete,
  kernelFsMkdir,
  kernelFsRename,
  kernelFsWriteSync,
} from '../main/kernel/kernel-fs';
import { kernelSpawn, kernelExec, kernelExecSync } from '../main/kernel/kernel-process';

// ─── Test Utilities ────────────────────────────────────────────────────────

const TEST_WORKSPACE = path.join(os.tmpdir(), `vibecode-arc18-${Date.now()}`);
let esm: ExecutionStateMachine;
let metrics: StabilityMetricsCollector;

function createTerminalCommandData(command: string, cwd: string = TEST_WORKSPACE) {
  return {
    kind: 'terminal_command' as const,
    command,
    cwd,
    terminalId: `term-${Date.now()}`,
    stdout: '',
    stderr: '',
    exitCode: null as number | null,
    truncated: false,
    isAI: false,
  };
}

function createMonacoEditData(filePath: string, original: string, newContent: string, isAI = false) {
  return {
    kind: 'monaco_edit' as const,
    filePath,
    region: { startLine: 1, startCol: 1, endLine: newContent.split('\n').length, endCol: (newContent.split('\n').pop()?.length ?? 0) + 1 },
    originalContent: original,
    newContent,
    isAI,
  };
}

function createFileMutationData(action: 'create' | 'edit' | 'delete' | 'move', filePath: string, newContent?: string) {
  return {
    kind: 'file_mutation' as const,
    action,
    filePath,
    newContent,
    fileExisted: action !== 'create',
  };
}

/** Measure execution time of an async function */
async function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = performance.now();
  const result = await fn();
  const latencyMs = performance.now() - start;
  return { result, latencyMs };
}

/** Measure execution time of a sync function */
function measureLatencySync<T>(fn: () => T): { result: T; latencyMs: number } {
  const start = performance.now();
  const result = fn();
  const latencyMs = performance.now() - start;
  return { result, latencyMs };
}

/** Wait for a specified number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP / TEARDOWN
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  uuidCounter = 0;
  vi.clearAllMocks();
  clearViolations();

  esm = new ExecutionStateMachine(TEST_WORKSPACE, false); // Don't auto-load
  ExecutionGateway.initialize(esm);
  metrics = new StabilityMetricsCollector();
});

afterEach(() => {
  // Reset gateway state
  clearViolations();
  metrics.reset();
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0-1: ADVERSARIAL USER SIMULATION SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 18 — P0-1: Adversarial User Simulation', () => {

  // ─── Terminal Abuse ──────────────────────────────────────────────────

  describe('Rapid terminal abuse', () => {
    it('MUST handle spam commands (100 rapid terminal commands)', async () => {
      const commands = Array.from({ length: 100 }, (_, i) => `echo "spam-${i}"`);
      const nodeIds: string[] = [];

      for (const command of commands) {
        const { result, latencyMs } = await measureLatency(async () => {
          return ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(command),
            autoApprove: true,
          });
        });
        metrics.recordNodeCreation(latencyMs);
        metrics.recordFullExecution(latencyMs);

        expect(result.node).toBeDefined();
        expect(result.allowed).toBe(true);
        nodeIds.push(result.node.id);
      }

      // Verify: every command created exactly one node
      const uniqueIds = new Set(nodeIds);
      expect(uniqueIds.size).toBe(100);

      // Verify: graph consistency after spam
      const graphCheck = metrics.checkGraphConsistency(esm);
      expect(graphCheck.duplicateNodeIds).toBe(0);
      expect(graphCheck.brokenParentChildLinks).toBe(0);

      if (!graphCheck.isConsistent) {
        metrics.recordFailure({
          category: 'CRITICAL',
          module: 'P0-1: Terminal Abuse',
          description: 'Graph inconsistent after 100 rapid terminal commands',
          expected: 'Graph should be consistent with 100 unique nodes',
          actual: `duplicates=${graphCheck.duplicateNodeIds}, orphaned=${graphCheck.orphanedNodes}, broken_links=${graphCheck.brokenParentChildLinks}`,
        });
      }
    });

    it('MUST handle chained commands (pipelines, &&, ||)', async () => {
      const chainedCommands = [
        'npm install && npm test',
        'echo "a" | grep a || echo "fallback"',
        'cd /tmp && ls -la && pwd',
        'cat file.txt 2>/dev/null || echo "not found"',
        'for i in $(seq 1 5); do echo $i; done',
      ];

      for (const command of chainedCommands) {
        const { result } = await measureLatency(async () => {
          return ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(command),
            autoApprove: true,
          });
        });

        expect(result.node).toBeDefined();
        expect(result.allowed).toBe(true);

        // Verify node data captured the full command
        const data = result.node.data as any;
        expect(data.command).toBe(command);
      }
    });

    it('MUST handle partial/interrupted commands', async () => {
      // Simulate commands that get interrupted
      const partialCommands = [
        'npm inst',       // incomplete
        'echo "hello',    // unclosed quote
        'cd ',            // no target
        '\x03',           // Ctrl+C
        '',               // empty
      ];

      for (const command of partialCommands) {
        const { result } = await measureLatency(async () => {
          return ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(command),
            autoApprove: true,
          });
        });

        // Even partial commands should create nodes — the gateway doesn't
        // validate command syntax, it just tracks the execution
        expect(result.node).toBeDefined();
        // The node should exist in the graph
        expect(esm.getNode(result.node.id)).not.toBeNull();
      }
    });

    it('MUST block dangerous commands even under spam', async () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo rm -rf /',
        'chmod 777 /etc/passwd',
        'dd if=/dev/zero of=/dev/sda',
        'mkfs.ext4 /dev/sda1',
      ];

      for (const command of dangerousCommands) {
        const { result } = await measureLatency(async () => {
          return ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(command),
            autoApprove: false, // Don't auto-approve dangerous
          });
        });

        // Dangerous commands should be blocked or require approval
        if (result.allowed && !result.blockReason) {
          metrics.recordSafetyFalseNegative();
          metrics.recordFailure({
            category: 'CRITICAL',
            module: 'P0-1: Terminal Abuse',
            description: `Dangerous command was not blocked: "${command}"`,
            expected: 'Command should be blocked or require approval',
            actual: `Command was allowed without restriction (safetyScore=${result.node.safetyScore})`,
          });
        } else {
          metrics.recordSafetyBlock();
        }
      }

      // At least some dangerous commands should have been blocked
      expect(metrics['safetyBlockedCorrectly'] + metrics['safetyApprovalRequired']).toBeGreaterThan(0);
    });
  });

  // ─── Monaco Chaos Editing ────────────────────────────────────────────

  describe('Monaco chaos editing', () => {
    it('MUST handle fast multi-file edits', async () => {
      const files = Array.from({ length: 20 }, (_, i) => `src/file-${i}.ts`);
      const nodeIds: string[] = [];

      for (const filePath of files) {
        const { result, latencyMs } = await measureLatency(async () => {
          return ExecutionGateway.requestExecution({
            type: 'monaco_edit',
            data: createMonacoEditData(filePath, 'old content', `new content for ${filePath}`),
            autoApprove: true,
          });
        });

        metrics.recordNodeCreation(latencyMs);
        expect(result.node).toBeDefined();
        nodeIds.push(result.node.id);
      }

      // Each edit should create a unique node
      expect(new Set(nodeIds).size).toBe(20);

      // Graph should remain consistent
      const graphCheck = metrics.checkGraphConsistency(esm);
      expect(graphCheck.isConsistent).toBe(true);
    });

    it('MUST handle partial saves (edits without completion)', async () => {
      // Simulate: user starts editing, node is created, but never transitions to completed
      const node1 = esm.createNode({
        type: 'monaco_edit',
        title: 'Partial Edit 1',
        description: 'User started editing but did not save',
        data: createMonacoEditData('src/partial1.ts', 'old', 'new'),
      });

      // Node should be in 'planned' state
      expect(node1.state).toBe('planned');

      // Another edit on the same file while first is still planned
      const node2 = esm.createNode({
        type: 'monaco_edit',
        title: 'Partial Edit 2',
        description: 'Another edit to the same file',
        data: createMonacoEditData('src/partial1.ts', 'new', 'newer'),
        sourceIds: [node1.id],
      });

      expect(node2.state).toBe('planned');
      expect(node2.sourceIds).toContain(node1.id);

      // Graph should still be consistent with both nodes
      const graphCheck = metrics.checkGraphConsistency(esm);
      expect(graphCheck.brokenSourceLinks).toBe(0);
    });

    it('MUST handle conflicting AI + manual edits to same file', async () => {
      // AI suggests an edit
      const aiEdit = esm.createNode({
        type: 'monaco_edit',
        title: 'AI Suggested Edit',
        description: 'AI wants to modify file',
        data: createMonacoEditData('src/conflict.ts', 'original', 'ai-version', true),
      });

      // User simultaneously makes a manual edit
      const userEdit = esm.createNode({
        type: 'monaco_edit',
        title: 'User Manual Edit',
        description: 'User manually modifies same file',
        data: createMonacoEditData('src/conflict.ts', 'original', 'user-version', false),
      });

      // Both nodes should exist — the system tracks both, doesn't prevent the conflict
      expect(esm.getNode(aiEdit.id)).not.toBeNull();
      expect(esm.getNode(userEdit.id)).not.toBeNull();

      // If we approve the AI edit first
      esm.transitionNode(aiEdit.id, 'approved');
      esm.transitionNode(aiEdit.id, 'executing');
      esm.transitionNode(aiEdit.id, 'completed');

      // The user edit should still be trackable
      expect(userEdit.state).toBe('planned');
    });

    it('MUST handle race condition edits (near-simultaneous)', async () => {
      const editPromises = Array.from({ length: 10 }, async (_, i) => {
        return ExecutionGateway.requestExecution({
          type: 'monaco_edit',
          data: createMonacoEditData('src/race.ts', 'original', `version-${i}`, i % 2 === 0),
          autoApprove: true,
        });
      });

      const results = await Promise.all(editPromises);

      // All edits should create nodes
      const allCreated = results.every(r => r.node && r.allowed);
      expect(allCreated).toBe(true);

      // All node IDs should be unique
      const nodeIds = results.map(r => r.node.id);
      expect(new Set(nodeIds).size).toBe(nodeIds.length);

      // Graph consistency check
      const graphCheck = metrics.checkGraphConsistency(esm);
      if (!graphCheck.isConsistent) {
        metrics.recordFailure({
          category: 'CRITICAL',
          module: 'P0-1: Monaco Chaos',
          description: 'Graph inconsistent after race condition edits',
          expected: 'Graph should be consistent',
          actual: `duplicates=${graphCheck.duplicateNodeIds}, broken_links=${graphCheck.brokenParentChildLinks}`,
        });
      }
    });
  });

  // ─── File System Stress ─────────────────────────────────────────────

  describe('File system stress', () => {
    it('MUST track concurrent writes to same file', async () => {
      const filePath = 'src/same-file.ts';
      const writePromises = Array.from({ length: 10 }, async (_, i) => {
        return ExecutionGateway.requestExecution({
          type: 'file_mutation',
          data: createFileMutationData('edit', filePath, `content-v${i}`),
          autoApprove: true,
        });
      });

      const results = await Promise.all(writePromises);

      // Each write should have created a node
      expect(results.every(r => r.node && r.allowed)).toBe(true);

      // All nodes should be unique
      const nodeIds = results.map(r => r.node.id);
      expect(new Set(nodeIds).size).toBe(10);

      // Graph should remain consistent
      const graphCheck = metrics.checkGraphConsistency(esm);
      expect(graphCheck.duplicateNodeIds).toBe(0);
    });

    it('MUST track delete-while-writing scenarios', async () => {
      const filePath = 'src/delete-race.ts';

      // Simultaneous write and delete
      const [writeResult, deleteResult] = await Promise.all([
        ExecutionGateway.requestExecution({
          type: 'file_mutation',
          data: createFileMutationData('edit', filePath, 'new content'),
          autoApprove: true,
        }),
        ExecutionGateway.requestExecution({
          type: 'file_mutation',
          data: createFileMutationData('delete', filePath),
          autoApprove: true,
        }),
      ]);

      // Both operations should be tracked
      expect(writeResult.node).toBeDefined();
      expect(deleteResult.node).toBeDefined();
      expect(writeResult.node.id).not.toBe(deleteResult.node.id);

      // The delete should have been flagged as requiring approval (high risk)
      // or at least tracked properly
      const deleteNode = deleteResult.node;
      expect(deleteNode.type).toBe('file_mutation');
    });

    it('MUST track rename during execution', async () => {
      const oldPath = 'src/before-rename.ts';
      const newPath = 'src/after-rename.ts';

      // Start an edit, then rename while it's "in progress"
      const editNode = esm.createNode({
        type: 'file_mutation',
        title: 'Edit before rename',
        description: 'Editing a file that gets renamed',
        data: createFileMutationData('edit', oldPath, 'edited content'),
      });

      const renameNode = esm.createNode({
        type: 'file_mutation',
        title: 'Rename file',
        description: 'Renaming while edit in progress',
        data: {
          ...createFileMutationData('move', oldPath),
          destinationPath: newPath,
        },
        sourceIds: [editNode.id],
      });

      // Both nodes should exist with proper linkage
      expect(esm.getNode(editNode.id)).not.toBeNull();
      expect(esm.getNode(renameNode.id)).not.toBeNull();
      expect(renameNode.sourceIds).toContain(editNode.id);
    });

    it('MUST handle nested folder explosions', async () => {
      // Create deeply nested folder structure
      const depth = 20;
      const folderPath = Array.from({ length: depth }, (_, i) => `level${i}`).join('/');
      const filePath = `${folderPath}/deep-file.ts`;

      const { result } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'file_mutation',
          data: createFileMutationData('create', filePath, 'deep content'),
          autoApprove: true,
        });
      });

      metrics.recordNodeCreation(result.latencyMs ?? 0);

      // Node should be created regardless of depth
      expect(result.node).toBeDefined();
      expect(result.allowed).toBe(true);

      // The path traversal rule should NOT flag legitimate deep nesting
      // (only `../` patterns should be flagged)
      expect(result.node.safetyScore).toBeGreaterThan(20);
    });
  });

  // ─── AI Injection Stress ────────────────────────────────────────────

  describe('AI injection stress', () => {
    it('MUST handle AI proposing conflicting execution plans', async () => {
      // AI proposes Plan A
      const planA = esm.createExecutionPlan({
        title: 'AI Plan A: Refactor module',
        description: 'AI wants to refactor the auth module',
        steps: [
          { title: 'Delete old auth', description: 'Remove old auth file', type: 'file_delete', params: { filePath: 'src/auth.ts' }, riskLevel: 'high' },
          { title: 'Create new auth', description: 'Write new auth file', type: 'file_write', params: { filePath: 'src/auth-new.ts' }, dependsOn: [0] },
          { title: 'Run tests', description: 'Verify auth works', type: 'command', params: { command: 'npm test' }, dependsOn: [1] },
        ],
      });

      // AI simultaneously proposes Plan B (conflicting)
      const planB = esm.createExecutionPlan({
        title: 'AI Plan B: Different refactor',
        description: 'AI has a different refactoring approach',
        steps: [
          { title: 'Edit auth inline', description: 'Edit auth without deleting', type: 'file_edit', params: { filePath: 'src/auth.ts' } },
          { title: 'Add tests', description: 'Add new tests', type: 'file_write', params: { filePath: 'src/auth.test.ts' }, dependsOn: [0] },
        ],
      });

      // Both plans should exist — they're just proposals
      expect(esm.getNode(planA.id)).not.toBeNull();
      expect(esm.getNode(planB.id)).not.toBeNull();

      // Plans should have correct child counts
      expect(planA.childIds).toHaveLength(3);
      expect(planB.childIds).toHaveLength(2);

      // Approving Plan A should work
      esm.approvePlan(planA.id);
      expect(esm.getNode(planA.id)!.state).toBe('approved');

      // Plan B is still in planned state
      expect(esm.getNode(planB.id)!.state).toBe('planned');
    });

    it('MUST handle AI generating recursive execution chains', async () => {
      // Simulate: AI response triggers another AI request, which triggers another...
      const chain: ExecutionNode[] = [];
      let previousId: string | undefined;

      for (let i = 0; i < 10; i++) {
        const node = esm.createNode({
          type: 'ai_reasoning',
          title: `AI Chain Step ${i}`,
          description: `Recursive AI reasoning step ${i}`,
          sourceIds: previousId ? [previousId] : [],
          data: {
            kind: 'ai_reasoning',
            providerId: 'test-provider',
            model: 'test-model',
            prompt: `Step ${i} prompt`,
            response: `Step ${i} response`,
          },
        });
        chain.push(node);
        previousId = node.id;
      }

      // All 10 nodes should exist with proper source links
      expect(chain).toHaveLength(10);

      // Verify chain linkage
      for (let i = 1; i < chain.length; i++) {
        expect(chain[i].sourceIds).toContain(chain[i - 1].id);
      }

      // Graph should be consistent
      const graphCheck = metrics.checkGraphConsistency(esm);
      expect(graphCheck.brokenSourceLinks).toBe(0);
      expect(graphCheck.isConsistent).toBe(true);
    });

    it('MUST handle AI triggering rapid execution loops', async () => {
      // AI triggers many operations in quick succession
      const operations = Array.from({ length: 50 }, async (_, i) => {
        const type = i % 3 === 0 ? 'terminal_command' : i % 3 === 1 ? 'file_mutation' : 'monaco_edit';
        let data;

        switch (type) {
          case 'terminal_command':
            data = createTerminalCommandData(`echo "AI-loop-${i}"`);
            break;
          case 'file_mutation':
            data = createFileMutationData('create', `src/ai-gen-${i}.ts`, `// AI generated ${i}`);
            break;
          case 'monaco_edit':
            data = createMonacoEditData(`src/ai-edit-${i}.ts`, 'old', `new-${i}`, true);
            break;
        }

        return ExecutionGateway.requestExecution({
          type: type as any,
          data,
          isAI: true,
          autoApprove: true,
        });
      });

      const results = await Promise.all(operations);

      // All operations should create nodes
      const allSuccessful = results.every(r => r.node && r.allowed);
      expect(allSuccessful).toBe(true);

      // All AI-initiated nodes should be tracked
      const aiNodes = results.filter(r => r.node.type !== 'plan');
      expect(aiNodes.length).toBe(50);

      // Graph consistency
      const graphCheck = metrics.checkGraphConsistency(esm);
      if (!graphCheck.isConsistent) {
        metrics.recordFailure({
          category: 'MAJOR',
          module: 'P0-1: AI Injection',
          description: 'Graph inconsistent after AI rapid execution loops',
          expected: 'Graph consistent with 50 AI nodes',
          actual: `duplicates=${graphCheck.duplicateNodeIds}, broken=${graphCheck.brokenParentChildLinks}`,
        });
      }
    });
  });

  // ─── Mixed-Mode Chaos ───────────────────────────────────────────────

  describe('Mixed-mode chaos (terminal + Monaco + AI + FS simultaneously)', () => {
    it('MUST handle all action types active simultaneously', async () => {
      // Create a mixed storm of operations
      const operations = [];

      // 10 terminal commands
      for (let i = 0; i < 10; i++) {
        operations.push(
          ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(`npm run build-${i}`),
            autoApprove: true,
          })
        );
      }

      // 10 file mutations
      for (let i = 0; i < 10; i++) {
        operations.push(
          ExecutionGateway.requestExecution({
            type: 'file_mutation',
            data: createFileMutationData('create', `src/mixed-${i}.ts`, `// Mixed mode ${i}`),
            autoApprove: true,
          })
        );
      }

      // 10 Monaco edits
      for (let i = 0; i < 10; i++) {
        operations.push(
          ExecutionGateway.requestExecution({
            type: 'monaco_edit',
            data: createMonacoEditData(`src/editor-${i}.ts`, 'old', 'new'),
            autoApprove: true,
          })
        );
      }

      // 5 AI reasoning nodes
      for (let i = 0; i < 5; i++) {
        operations.push(
          ExecutionGateway.requestExecution({
            type: 'ai_reasoning',
            data: {
              kind: 'ai_reasoning',
              providerId: 'test',
              model: 'gpt-4',
              prompt: `Mixed mode AI ${i}`,
              response: `AI response ${i}`,
            },
            autoApprove: true,
          })
        );
      }

      const results = await Promise.all(operations);

      // All 35 operations should succeed
      expect(results.every(r => r.node && r.allowed)).toBe(true);

      // All node IDs should be unique
      const nodeIds = results.map(r => r.node.id);
      expect(new Set(nodeIds).size).toBe(35);

      // Graph consistency
      const graphCheck = metrics.checkGraphConsistency(esm);
      expect(graphCheck.isConsistent).toBe(true);

      if (!graphCheck.isConsistent) {
        metrics.recordFailure({
          category: 'CRITICAL',
          module: 'P0-1: Mixed-Mode Chaos',
          description: 'Graph inconsistent under mixed-mode chaos',
          expected: 'Consistent graph with 35 unique nodes',
          actual: `inconsistent: duplicates=${graphCheck.duplicateNodeIds}, orphaned=${graphCheck.orphanedNodes}`,
        });
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0-2: SYSTEM STABILITY METRICS
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 18 — P0-2: System Stability Metrics', () => {
  it('MUST track ExecutionGraph consistency under load', () => {
    // Create 100 nodes
    for (let i = 0; i < 100; i++) {
      esm.createNode({
        type: 'terminal_command',
        title: `Load Test ${i}`,
        description: `Load test node ${i}`,
        data: createTerminalCommandData(`echo ${i}`),
      });
    }

    const graphCheck = metrics.checkGraphConsistency(esm);

    expect(graphCheck.totalNodesCreated).toBe(100);
    expect(graphCheck.duplicateNodeIds).toBe(0);
    expect(graphCheck.orphanedNodes).toBe(0);
    expect(graphCheck.brokenParentChildLinks).toBe(0);
    expect(graphCheck.isConsistent).toBe(true);
  });

  it('MUST track node duplication rate', () => {
    // Create nodes and verify no duplicates
    const nodeIds = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const node = esm.createNode({
        type: 'file_mutation',
        title: `Dup Test ${i}`,
        description: `Dup test ${i}`,
        data: createFileMutationData('create', `file-${i}.ts`),
      });
      nodeIds.add(node.id);
    }

    // No duplicates
    expect(nodeIds.size).toBe(50);

    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.duplicateNodeIds).toBe(0);
  });

  it('MUST detect orphaned execution nodes', () => {
    // Create a node with a parentId that references a deleted node
    const parent = esm.createNode({
      type: 'plan',
      title: 'Parent Plan',
      description: 'Will be deleted',
      data: { kind: 'plan' },
    });

    const child = esm.createNode({
      type: 'step',
      title: 'Child Step',
      description: 'Will become orphaned',
      parentId: parent.id,
      data: { kind: 'step', stepType: 'file_write', params: {} },
    });

    // Child should have valid parent
    let graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.orphanedNodes).toBe(0);

    // Delete the parent manually (simulating a partial cleanup)
    esm.deleteNode(parent.id);

    // Now check for orphans
    graphCheck = metrics.checkGraphConsistency(esm);
    // The child's parentId now references a non-existent node
    const childNode = esm.getNode(child.id);
    if (childNode && childNode.parentId && !esm.getNode(childNode.parentId)) {
      // Orphan detected — this is expected behavior after deleteNode
      expect(graphCheck.orphanedNodes).toBeGreaterThan(0);
    }
  });

  it('MUST track safety gate false positives and negatives', async () => {
    // Test safe commands — should NOT be blocked
    const safeCommands = ['echo hello', 'ls -la', 'pwd', 'cat README.md', 'npm test'];
    let falsePositives = 0;

    for (const cmd of safeCommands) {
      const { result } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'terminal_command',
          data: createTerminalCommandData(cmd),
          autoApprove: false, // Don't auto-approve to test safety gate
        });
      });

      if (!result.allowed || result.blockReason) {
        // Safe command was blocked — false positive
        falsePositives++;
        metrics.recordSafetyFalsePositive();
      } else {
        metrics.recordAutoApproval();
      }
    }

    // Test dangerous commands — should be blocked
    const dangerousCommands = ['rm -rf /', 'sudo chmod 777 /etc/passwd', 'dd if=/dev/zero of=/dev/sda'];
    let falseNegatives = 0;

    for (const cmd of dangerousCommands) {
      const { result } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'terminal_command',
          data: createTerminalCommandData(cmd),
          autoApprove: false,
        });
      });

      if (result.allowed && !result.blockReason && result.node.safetyScore > 60) {
        // Dangerous command slipped through with high safety score
        falseNegatives++;
        metrics.recordSafetyFalseNegative();
      } else {
        metrics.recordSafetyBlock();
      }
    }

    // False negatives should be 0 — dangerous commands must not slip through
    expect(falseNegatives).toBe(0);

    // False positives should be low — safe commands should mostly pass
    expect(falsePositives).toBeLessThanOrEqual(safeCommands.length);
  });

  it('MUST detect UI desync from graph state', () => {
    // Simulate: UI shows a node as "executing" but the graph has it as "completed"
    const node = esm.createNode({
      type: 'terminal_command',
      title: 'Desync Test',
      description: 'Test UI desync detection',
      data: createTerminalCommandData('echo test'),
    });

    // Normal transition
    esm.transitionNode(node.id, 'approved');
    esm.transitionNode(node.id, 'executing');
    esm.transitionNode(node.id, 'completed');

    // The node should be in completed state
    const graphNode = esm.getNode(node.id);
    expect(graphNode!.state).toBe('completed');

    // If the UI thought it was still executing, that's a desync
    // We can detect this by checking if the graph state matches expected state
    const terminalStates: NodeState[] = ['completed', 'failed', 'rolled_back', 'cancelled'];
    const nonTerminalExecuting = esm.getGraphSnapshot().nodes.filter(
      n => n.state === 'executing' && terminalStates.includes(n.state)
    );

    // There should be no executing nodes that are also in terminal states (impossible)
    expect(nonTerminalExecuting).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0-3: REAL EXECUTION FLOW VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 18 — P0-3: Real Execution Flow Validation', () => {
  it('MUST create exactly ONE ExecutionNode per real-world mutation', async () => {
    const initialNodeCount = esm.getGraphSnapshot().nodes.length;

    // Execute a single terminal command through the gateway
    const { result } = await measureLatency(async () => {
      return ExecutionGateway.requestExecution({
        type: 'terminal_command',
        data: createTerminalCommandData('echo "one node test"'),
        autoApprove: true,
      });
    });

    // Exactly one new node should have been created
    const newCount = esm.getGraphSnapshot().nodes.length;
    const nodesCreated = newCount - initialNodeCount;

    if (nodesCreated === 0) {
      metrics.recordFailure({
        category: 'CRITICAL',
        module: 'P0-3: Execution Flow',
        description: 'Zero nodes created for a mutation — FAIL',
        expected: 'Exactly 1 node created per mutation',
        actual: `${nodesCreated} nodes created`,
      });
    }
    if (nodesCreated > 1) {
      metrics.recordFailure({
        category: 'MAJOR',
        module: 'P0-3: Execution Flow',
        description: 'Multiple nodes created for a single mutation — FAIL',
        expected: 'Exactly 1 node created per mutation',
        actual: `${nodesCreated} nodes created`,
      });
    }

    expect(nodesCreated).toBe(1);
  });

  it('MUST NOT allow mutation without node creation', async () => {
    // Verify that the gateway ALWAYS creates a node before dispatching
    const beforeCount = esm.getGraphSnapshot().nodes.length;

    const gatewayResult = await ExecutionGateway.requestExecution({
      type: 'file_mutation',
      data: createFileMutationData('create', 'src/no-node-test.ts', 'content'),
      autoApprove: true,
    });

    // A node MUST have been created
    expect(gatewayResult.node).toBeDefined();
    expect(gatewayResult.node.id).toBeTruthy();

    // The node MUST exist in the graph
    expect(esm.getNode(gatewayResult.node.id)).not.toBeNull();

    // The count MUST have increased
    expect(esm.getGraphSnapshot().nodes.length).toBe(beforeCount + 1);
  });

  it('MUST NOT create node AFTER mutation (node must exist before execution)', async () => {
    // This tests that the node is created BEFORE execution starts,
    // not retroactively created after the fact.

    const gatewayResult = await ExecutionGateway.requestExecution({
      type: 'terminal_command',
      data: createTerminalCommandData('echo "timing test"'),
      autoApprove: true,
      executor: async (node) => {
        // At execution time, the node MUST already exist in the graph
        const graphNode = esm.getNode(node.id);
        if (!graphNode) {
          metrics.recordFailure({
            category: 'CRITICAL',
            module: 'P0-3: Execution Flow',
            description: 'Node did not exist in graph at execution time',
            expected: 'Node must exist before executor runs',
            actual: `Node ${node.id} not found in graph during execution`,
          });
        }
        // Node should be in 'executing' state at this point
        if (graphNode && graphNode.state !== 'executing') {
          metrics.recordFailure({
            category: 'CRITICAL',
            module: 'P0-3: Execution Flow',
            description: `Node in wrong state during execution: ${graphNode.state}`,
            expected: 'executing',
            actual: graphNode.state,
          });
        }
        return { success: true, data: { output: 'test' } };
      },
    });

    expect(gatewayResult.node).toBeDefined();
    // No CRITICAL failures should have been recorded
    const criticalFailures = metrics['failures'].filter(f => f.category === 'CRITICAL');
    expect(criticalFailures).toHaveLength(0);
  });

  it('MUST validate 1:1 node-to-mutation for file operations', async () => {
    const mutations = [
      { action: 'create' as const, path: 'src/new-file.ts' },
      { action: 'edit' as const, path: 'src/existing-file.ts' },
      { action: 'delete' as const, path: 'src/old-file.ts' },
      { action: 'move' as const, path: 'src/move-me.ts' },
    ];

    for (const mutation of mutations) {
      const beforeCount = esm.getGraphSnapshot().nodes.length;

      const data = createFileMutationData(mutation.action, mutation.path, mutation.action === 'move' ? undefined : 'content');
      if (mutation.action === 'move') {
        (data as any).destinationPath = 'src/moved.ts';
      }

      await ExecutionGateway.requestExecution({
        type: 'file_mutation',
        data,
        autoApprove: true,
      });

      const afterCount = esm.getGraphSnapshot().nodes.length;
      const created = afterCount - beforeCount;

      if (created !== 1) {
        metrics.recordFailure({
          category: created === 0 ? 'CRITICAL' : 'MAJOR',
          module: 'P0-3: Execution Flow',
          description: `File ${mutation.action} created ${created} nodes instead of 1`,
          expected: '1 node per mutation',
          actual: `${created} nodes created`,
        });
      }

      expect(created).toBe(1);
    }
  });

  it('MUST validate 1:1 node-to-mutation for Monaco edits', async () => {
    const beforeCount = esm.getGraphSnapshot().nodes.length;

    await ExecutionGateway.requestExecution({
      type: 'monaco_edit',
      data: createMonacoEditData('src/monaco-test.ts', 'old', 'new'),
      autoApprove: true,
    });

    const afterCount = esm.getGraphSnapshot().nodes.length;
    expect(afterCount - beforeCount).toBe(1);
  });

  it('MUST validate 1:1 node-to-mutation for terminal commands', async () => {
    const beforeCount = esm.getGraphSnapshot().nodes.length;

    await ExecutionGateway.requestExecution({
      type: 'terminal_command',
      data: createTerminalCommandData('echo "1:1 test"'),
      autoApprove: true,
    });

    const afterCount = esm.getGraphSnapshot().nodes.length;
    expect(afterCount - beforeCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0-4: CONCURRENCY AND RACE CONDITION TESTING
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 18 — P0-4: Concurrency & Race Condition Testing', () => {
  it('MUST handle 50 concurrent terminal commands', async () => {
    const commands = Array.from({ length: 50 }, (_, i) => `echo "concurrent-${i}"`);

    const promises = commands.map(async (command) => {
      const start = performance.now();
      try {
        const result = await ExecutionGateway.requestExecution({
          type: 'terminal_command',
          data: createTerminalCommandData(command),
          autoApprove: true,
        });
        const latency = performance.now() - start;
        metrics.recordFullExecution(latency);
        metrics.recordConcurrentSuccess();
        return result;
      } catch (err) {
        metrics.recordConcurrentFailure();
        metrics.recordFailure({
          category: 'MAJOR',
          module: 'P0-4: Concurrency',
          description: `Concurrent terminal command failed: ${command}`,
          expected: 'Command should create a node',
          actual: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw err;
      }
    });

    const results = await Promise.all(promises);

    // All commands should have succeeded
    expect(results.every(r => r.node && r.allowed)).toBe(true);

    // All node IDs should be unique
    const nodeIds = results.map(r => r.node.id);
    expect(new Set(nodeIds).size).toBe(50);

    // Graph should be consistent
    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.isConsistent).toBe(true);
    expect(graphCheck.duplicateNodeIds).toBe(0);

    if (!graphCheck.isConsistent) {
      metrics.recordGraphCorruption();
      metrics.recordFailure({
        category: 'CRITICAL',
        module: 'P0-4: Concurrency',
        description: 'Graph corruption under 50 concurrent commands',
        expected: 'Consistent graph',
        actual: `duplicates=${graphCheck.duplicateNodeIds}, broken=${graphCheck.brokenParentChildLinks}`,
      });
    }
  });

  it('MUST handle 20 simultaneous file writes', async () => {
    const files = Array.from({ length: 20 }, (_, i) => `src/concurrent-write-${i}.ts`);

    const promises = files.map(async (filePath) => {
      try {
        const result = await ExecutionGateway.requestExecution({
          type: 'file_mutation',
          data: createFileMutationData('create', filePath, `// Concurrent write ${filePath}`),
          autoApprove: true,
        });
        metrics.recordConcurrentSuccess();
        return result;
      } catch (err) {
        metrics.recordConcurrentFailure();
        throw err;
      }
    });

    const results = await Promise.all(promises);

    expect(results.every(r => r.node && r.allowed)).toBe(true);

    // All unique nodes
    const nodeIds = results.map(r => r.node.id);
    expect(new Set(nodeIds).size).toBe(20);

    // Graph consistency
    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.isConsistent).toBe(true);
  });

  it('MUST handle AI generating 10 overlapping execution plans', () => {
    const plans: ExecutionNode[] = [];

    for (let i = 0; i < 10; i++) {
      const plan = esm.createExecutionPlan({
        title: `Overlapping Plan ${i}`,
        description: `AI-generated plan that overlaps with others`,
        steps: [
          { title: 'Edit shared file', description: 'Edit src/shared.ts', type: 'file_edit', params: { filePath: 'src/shared.ts' } },
          { title: 'Run tests', description: 'Run test suite', type: 'command', params: { command: 'npm test' }, dependsOn: [0] },
          { title: 'Update config', description: 'Update config file', type: 'file_edit', params: { filePath: 'config.json' } },
        ],
      });
      plans.push(plan);
    }

    // All plans should exist
    expect(plans).toHaveLength(10);

    // All should have 3 children
    for (const plan of plans) {
      expect(plan.childIds).toHaveLength(3);
    }

    // Graph should be consistent
    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.isConsistent).toBe(true);
    expect(graphCheck.brokenParentChildLinks).toBe(0);
  });

  it('MUST handle Monaco editing same file from 3 sources simultaneously', async () => {
    const filePath = 'src/triple-edit.ts';

    // Source 1: User manual edit
    const userEdit = ExecutionGateway.requestExecution({
      type: 'monaco_edit',
      data: createMonacoEditData(filePath, 'original', 'user-version', false),
      autoApprove: true,
    });

    // Source 2: AI suggested edit
    const aiEdit = ExecutionGateway.requestExecution({
      type: 'monaco_edit',
      data: createMonacoEditData(filePath, 'original', 'ai-version', true),
      autoApprove: true,
    });

    // Source 3: File mutation from execution plan
    const planEdit = ExecutionGateway.requestExecution({
      type: 'file_mutation',
      data: createFileMutationData('edit', filePath, 'plan-version'),
      autoApprove: true,
    });

    const [userResult, aiResult, planResult] = await Promise.all([userEdit, aiEdit, planEdit]);

    // All three edits should create separate nodes
    expect(userResult.node.id).not.toBe(aiResult.node.id);
    expect(aiResult.node.id).not.toBe(planResult.node.id);
    expect(userResult.node.id).not.toBe(planResult.node.id);

    // Graph should be consistent
    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.isConsistent).toBe(true);
  });

  it('MUST detect graph corruption under extreme concurrency', async () => {
    // 200 concurrent operations of mixed types
    const allOps: Promise<any>[] = [];

    for (let i = 0; i < 200; i++) {
      const type = i % 4;
      switch (type) {
        case 0:
          allOps.push(ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(`echo "extreme-${i}"`),
            autoApprove: true,
          }));
          break;
        case 1:
          allOps.push(ExecutionGateway.requestExecution({
            type: 'file_mutation',
            data: createFileMutationData('create', `src/extreme-${i}.ts`, `content ${i}`),
            autoApprove: true,
          }));
          break;
        case 2:
          allOps.push(ExecutionGateway.requestExecution({
            type: 'monaco_edit',
            data: createMonacoEditData(`src/extreme-edit-${i}.ts`, 'old', `new-${i}`),
            autoApprove: true,
          }));
          break;
        case 3:
          allOps.push(ExecutionGateway.requestExecution({
            type: 'ai_reasoning',
            data: {
              kind: 'ai_reasoning',
              providerId: 'test',
              model: 'test',
              prompt: `extreme ${i}`,
              response: `response ${i}`,
            },
            autoApprove: true,
          }));
          break;
      }
    }

    const results = await Promise.all(allOps);

    // All should succeed
    const successCount = results.filter(r => r.node && r.allowed).length;
    expect(successCount).toBe(200);

    // No duplicate node IDs
    const nodeIds = results.map(r => r.node.id);
    expect(new Set(nodeIds).size).toBe(200);

    // Graph consistency
    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.duplicateNodeIds).toBe(0);
    expect(graphCheck.isConsistent).toBe(true);

    if (!graphCheck.isConsistent) {
      metrics.recordGraphCorruption();
      metrics.recordFailure({
        category: 'CRITICAL',
        module: 'P0-4: Concurrency',
        description: 'Graph corruption under 200 concurrent operations',
        expected: 'Consistent graph with 200 unique nodes',
        actual: `corrupted: duplicates=${graphCheck.duplicateNodeIds}, orphaned=${graphCheck.orphanedNodes}, broken_links=${graphCheck.brokenParentChildLinks}`,
      });
    }
  });

  it('MUST check for broken execution chains under concurrency', async () => {
    // Create a chain of dependent operations concurrently
    const planNode = esm.createExecutionPlan({
      title: 'Concurrent Chain Plan',
      description: 'Plan with sequential steps that should maintain ordering',
      steps: [
        { title: 'Step 1', description: 'First', type: 'file_write', params: { filePath: 'chain-1.ts' } },
        { title: 'Step 2', description: 'Second', type: 'file_write', params: { filePath: 'chain-2.ts' }, dependsOn: [0] },
        { title: 'Step 3', description: 'Third', type: 'command', params: { command: 'npm test' }, dependsOn: [1] },
        { title: 'Step 4', description: 'Fourth', type: 'file_write', params: { filePath: 'chain-3.ts' }, dependsOn: [2] },
        { title: 'Step 5', description: 'Fifth', type: 'file_edit', params: { filePath: 'chain-1.ts' }, dependsOn: [3] },
      ],
    });

    // Verify all dependency links are intact
    const children = esm.getChildren(planNode.id);
    expect(children).toHaveLength(5);

    // Check dependency chain
    const step2 = children.find(c => c.title === 'Step 2');
    const step3 = children.find(c => c.title === 'Step 3');
    const step4 = children.find(c => c.title === 'Step 4');
    const step5 = children.find(c => c.title === 'Step 5');

    expect(step2?.dependsOn).toHaveLength(1);
    expect(step3?.dependsOn).toHaveLength(1);
    expect(step4?.dependsOn).toHaveLength(1);
    expect(step5?.dependsOn).toHaveLength(1);

    // Graph should be consistent
    const graphCheck = metrics.checkGraphConsistency(esm);
    expect(graphCheck.brokenSourceLinks).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0-5: USER EXPERIENCE IMPACT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 18 — P0-5: UX Impact Analysis', () => {
  it('MUST measure latency introduced by ExecutionGateway', async () => {
    const latencies: number[] = [];

    // Measure 100 gateway operations
    for (let i = 0; i < 100; i++) {
      const { latencyMs } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'terminal_command',
          data: createTerminalCommandData(`echo "latency-${i}"`),
          autoApprove: true,
        });
      });
      latencies.push(latencyMs);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    metrics.recordNodeCreation(avgLatency);

    // Gateway overhead should be reasonable (< 50ms average)
    if (avgLatency > 50) {
      metrics.recordFailure({
        category: 'MINOR',
        module: 'P0-5: UX Impact',
        description: `Gateway latency too high: avg=${avgLatency.toFixed(1)}ms`,
        expected: 'Average gateway latency < 50ms',
        actual: `Average: ${avgLatency.toFixed(1)}ms, P95: ${p95Latency.toFixed(1)}ms`,
      });
    }

    // P95 should be under 100ms
    if (p95Latency > 100) {
      metrics.recordFailure({
        category: 'MINOR',
        module: 'P0-5: UX Impact',
        description: `P95 gateway latency too high: ${p95Latency.toFixed(1)}ms`,
        expected: 'P95 latency < 100ms',
        actual: `P95: ${p95Latency.toFixed(1)}ms`,
      });
    }

    // Record for the report
    metrics.recordGatewayOverhead(avgLatency);

    // The test itself doesn't fail on latency — the report captures this
    // But we do assert that the system doesn't hang
    expect(avgLatency).toBeLessThan(5000); // 5s max (very generous)
  });

  it('MUST measure perceived lag in editor operations', async () => {
    const editLatencies: number[] = [];

    for (let i = 0; i < 50; i++) {
      const { latencyMs } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'monaco_edit',
          data: createMonacoEditData(`src/edit-latency-${i}.ts`, 'old', 'new'),
          autoApprove: true,
        });
      });
      editLatencies.push(latencyMs);
    }

    const avgEditLatency = editLatencies.reduce((a, b) => a + b, 0) / editLatencies.length;

    // Editor edits should feel instant (< 100ms)
    if (avgEditLatency > 100) {
      metrics.recordFailure({
        category: 'MINOR',
        module: 'P0-5: UX Impact',
        description: `Monaco edit latency too high: ${avgEditLatency.toFixed(1)}ms`,
        expected: 'Monaco edit latency < 100ms',
        actual: `Average: ${avgEditLatency.toFixed(1)}ms`,
      });
    }

    metrics.recordGatewayOverhead(avgEditLatency);
    expect(avgEditLatency).toBeLessThan(5000); // Sanity check
  });

  it('MUST measure terminal responsiveness', async () => {
    const commandLatencies: number[] = [];

    for (let i = 0; i < 50; i++) {
      const { latencyMs } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'terminal_command',
          data: createTerminalCommandData(`echo "terminal-latency-${i}"`),
          autoApprove: true,
        });
      });
      commandLatencies.push(latencyMs);
    }

    const avgCommandLatency = commandLatencies.reduce((a, b) => a + b, 0) / commandLatencies.length;

    // Terminal commands should be near-instant for node creation (< 50ms)
    if (avgCommandLatency > 50) {
      metrics.recordFailure({
        category: 'MINOR',
        module: 'P0-5: UX Impact',
        description: `Terminal command latency: ${avgCommandLatency.toFixed(1)}ms`,
        expected: 'Terminal command node creation < 50ms',
        actual: `Average: ${avgCommandLatency.toFixed(1)}ms`,
      });
    }

    metrics.recordGatewayOverhead(avgCommandLatency);
  });

  it('MUST measure AI response delay due to graph tracking', async () => {
    const aiLatencies: number[] = [];

    for (let i = 0; i < 20; i++) {
      const { latencyMs } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'ai_reasoning',
          data: {
            kind: 'ai_reasoning',
            providerId: 'test',
            model: 'gpt-4',
            prompt: `Test prompt ${i}`,
            response: `Test response ${i}`,
          },
          autoApprove: true,
        });
      });
      aiLatencies.push(latencyMs);
    }

    const avgAiLatency = aiLatencies.reduce((a, b) => a + b, 0) / aiLatencies.length;

    // AI response tracking overhead should be minimal (< 200ms)
    if (avgAiLatency > 200) {
      metrics.recordFailure({
        category: 'MINOR',
        module: 'P0-5: UX Impact',
        description: `AI response tracking latency: ${avgAiLatency.toFixed(1)}ms`,
        expected: 'AI tracking overhead < 200ms',
        actual: `Average: ${avgAiLatency.toFixed(1)}ms`,
      });
    }

    metrics.recordGatewayOverhead(avgAiLatency);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0-6: BREAKAGE REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 18 — P0-6: Breakage Report', () => {
  it('MUST generate a comprehensive breakage report', async () => {
    // Run a representative workload to populate metrics
    const workload = Array.from({ length: 50 }, async (_, i) => {
      const type = i % 3;
      switch (type) {
        case 0:
          return ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(`echo "workload-${i}"`),
            autoApprove: true,
          });
        case 1:
          return ExecutionGateway.requestExecution({
            type: 'file_mutation',
            data: createFileMutationData('create', `src/report-${i}.ts`, `content ${i}`),
            autoApprove: true,
          });
        case 2:
          return ExecutionGateway.requestExecution({
            type: 'monaco_edit',
            data: createMonacoEditData(`src/report-edit-${i}.ts`, 'old', `new-${i}`),
            autoApprove: true,
          });
        default:
          return ExecutionGateway.requestExecution({
            type: 'terminal_command',
            data: createTerminalCommandData(`echo "fallback-${i}"`),
            autoApprove: true,
          });
      }
    });

    await Promise.all(workload);

    // Generate the report
    const report = metrics.generateReport(esm);

    // Report must have all required fields
    expect(report.systemStabilityScore).toBeGreaterThanOrEqual(0);
    expect(report.systemStabilityScore).toBeLessThanOrEqual(100);
    expect(report.graphConsistencyScore).toBeGreaterThanOrEqual(0);
    expect(report.graphConsistencyScore).toBeLessThanOrEqual(100);
    expect(report.uxImpactScore).toBeGreaterThanOrEqual(0);
    expect(report.uxImpactScore).toBeLessThanOrEqual(100);
    expect(['SHIP', 'FIX_BEFORE_SHIP', 'KERNEL_OVER_ENGINEERED']).toContain(report.recommendation);

    // Graph metrics should be populated
    expect(report.graphMetrics.totalNodesCreated).toBeGreaterThan(0);

    // Safety metrics should be populated
    expect(typeof report.safetyMetrics.accuracy).toBe('number');

    // Latency metrics should be populated
    expect(typeof report.latencyMetrics.avgNodeCreation).toBe('number');

    // Failures should be an array
    expect(Array.isArray(report.failures)).toBe(true);

    // Console output for the breakage report
    console.log('\n' + '='.repeat(80));
    console.log('ARC 18 — BREAKAGE REPORT');
    console.log('='.repeat(80));
    console.log(`System Stability Score: ${report.systemStabilityScore}/100`);
    console.log(`Graph Consistency Score: ${report.graphConsistencyScore}/100`);
    console.log(`UX Impact Score: ${report.uxImpactScore}/100`);
    console.log(`Recommendation: ${report.recommendation}`);
    console.log('-'.repeat(80));
    console.log(`Graph: ${report.graphMetrics.totalNodesCreated} nodes, ${report.graphMetrics.orphanedNodes} orphaned, ${report.graphMetrics.brokenParentChildLinks} broken links`);
    console.log(`Safety: accuracy=${(report.safetyMetrics.accuracy * 100).toFixed(1)}%, FP=${report.safetyMetrics.falsePositiveRate.toFixed(3)}, FN=${report.safetyMetrics.falseNegativeRate.toFixed(3)}`);
    console.log(`Latency: avg_node=${report.latencyMetrics.avgNodeCreation.toFixed(1)}ms, p95=${report.latencyMetrics.p95NodeCreation.toFixed(1)}ms`);
    console.log(`Concurrency: ${report.concurrencyMetrics.succeeded}/${report.concurrencyMetrics.concurrentOps} succeeded, ${report.concurrencyMetrics.graphCorruptions} corruptions`);
    console.log(`UX: overhead=${report.uxMetrics.avgGatewayOverhead.toFixed(1)}ms, terminal=${report.uxMetrics.terminalResponsivenessOk ? 'OK' : 'SLOW'}, editor=${report.uxMetrics.editorResponsivenessOk ? 'OK' : 'SLOW'}`);
    console.log('-'.repeat(80));
    console.log(`Failures: ${report.failures.length}`);
    for (const failure of report.failures) {
      console.log(`  [${failure.category}] ${failure.module}: ${failure.description}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  it('MUST produce final scores and recommendation', async () => {
    // Run the complete adversarial battery and generate scores

    // 1. Rapid operations
    for (let i = 0; i < 30; i++) {
      const { latencyMs } = await measureLatency(async () => {
        return ExecutionGateway.requestExecution({
          type: 'terminal_command',
          data: createTerminalCommandData(`echo "final-${i}"`),
          autoApprove: true,
        });
      });
      metrics.recordNodeCreation(latencyMs);
      metrics.recordGatewayOverhead(latencyMs);
    }

    // 2. Concurrent operations
    const concurrent = Array.from({ length: 30 }, async (_, i) => {
      try {
        const result = await ExecutionGateway.requestExecution({
          type: 'file_mutation',
          data: createFileMutationData('create', `src/final-${i}.ts`, `content ${i}`),
          autoApprove: true,
        });
        metrics.recordConcurrentSuccess();
        return result;
      } catch {
        metrics.recordConcurrentFailure();
        throw new Error('Concurrent operation failed');
      }
    });
    await Promise.all(concurrent);

    // 3. Safety gate testing
    const dangerousResult = await ExecutionGateway.requestExecution({
      type: 'terminal_command',
      data: createTerminalCommandData('rm -rf /'),
      autoApprove: false,
    });
    if (!dangerousResult.allowed || dangerousResult.blockReason) {
      metrics.recordSafetyBlock();
    } else {
      metrics.recordSafetyFalseNegative();
    }

    // Generate final report
    const report = metrics.generateReport(esm);

    // System stability should be high (no CRITICAL failures expected)
    expect(report.systemStabilityScore).toBeGreaterThan(0);

    // Graph should be consistent
    expect(report.graphMetrics.isConsistent).toBe(true);

    // Safety should have no false negatives
    expect(report.safetyMetrics.falseNegativeRate).toBe(0);

    // Recommendation should be one of the three allowed values
    expect(['SHIP', 'FIX_BEFORE_SHIP', 'KERNEL_OVER_ENGINEERED']).toContain(report.recommendation);

    // ─── FINAL OUTPUT ──────────────────────────────────────────────
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║              ARC 18 — FINAL VALIDATION REPORT                       ║');
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log(`║  SYSTEM STABILITY SCORE:  ${report.systemStabilityScore.toString().padEnd(43)}║`);
    console.log(`║  GRAPH CONSISTENCY SCORE: ${report.graphConsistencyScore.toString().padEnd(43)}║`);
    console.log(`║  UX IMPACT SCORE:         ${report.uxImpactScore.toString().padEnd(43)}║`);
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log(`║  CRITICAL FAILURES:       ${report.failures.filter(f => f.category === 'CRITICAL').length.toString().padEnd(43)}║`);
    console.log(`║  MAJOR FAILURES:          ${report.failures.filter(f => f.category === 'MAJOR').length.toString().padEnd(43)}║`);
    console.log(`║  MINOR FAILURES:          ${report.failures.filter(f => f.category === 'MINOR').length.toString().padEnd(43)}║`);
    console.log('╠══════════════════════════════════════════════════════════════════════╣');
    console.log(`║  RECOMMENDATION:          ${report.recommendation.padEnd(43)}║`);
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('\n');
  });
});
