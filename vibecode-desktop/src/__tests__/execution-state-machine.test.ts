/**
 * VibeCode Desktop — Execution State Machine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules BEFORE imports
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-sm'),
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
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('[]'),
    access: vi.fn().mockRejectedValue(new Error('Not found')),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../main/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../main/utils/audit-log', () => ({
  auditLog: { auditLog: vi.fn() },
}));

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}));

import { ExecutionStateMachine } from '../main/services/execution-state-machine';

describe('ExecutionStateMachine', () => {
  let sm: ExecutionStateMachine;

  beforeEach(() => {
    vi.clearAllMocks();
    sm = new ExecutionStateMachine('/tmp/test-workspace');
  });

  // ─── Node Creation ────────────────────────────────────────────────

  describe('createNode', () => {
    it('should create a node with correct initial state', () => {
      const node = sm.createNode({
        type: 'ai_reasoning',
        title: 'Test AI Response',
        description: 'AI generated a response',
        data: {
          kind: 'ai_reasoning',
          providerId: 'openai-1',
          model: 'gpt-4',
          prompt: 'Hello',
          response: 'Hi there!',
        },
      });

      expect(node).toBeDefined();
      expect(node.state).toBe('planned');
      expect(node.type).toBe('ai_reasoning');
      expect(node.title).toBe('Test AI Response');
      expect(node.safetyScore).toBeGreaterThanOrEqual(0);
      expect(node.safetyScore).toBeLessThanOrEqual(100);
    });

    it('should add root nodes to rootIds', () => {
      const node = sm.createNode({
        type: 'plan',
        title: 'Test Plan',
        description: 'A test plan',
        data: { kind: 'plan' },
      });

      const graph = sm.getGraphSnapshot();
      expect(graph.rootIds).toContain(node.id);
    });

    it('should link children to parents', () => {
      const parent = sm.createNode({
        type: 'plan',
        title: 'Parent Plan',
        description: 'Parent',
        data: { kind: 'plan' },
      });

      const child = sm.createNode({
        type: 'step',
        title: 'Child Step',
        description: 'Child',
        parentId: parent.id,
        data: {
          kind: 'step',
          stepType: 'file_write',
          params: { filePath: 'test.ts' },
        },
      });

      expect(child.parentId).toBe(parent.id);
      expect(parent.childIds).toContain(child.id);
    });
  });

  // ─── State Transitions ────────────────────────────────────────────

  describe('transitionNode', () => {
    it('should allow planned → approved transition', () => {
      const node = sm.createNode({
        type: 'plan',
        title: 'Test',
        description: 'Test',
        data: { kind: 'plan' },
      });

      const transitioned = sm.transitionNode(node.id, 'approved');
      expect(transitioned.state).toBe('approved');
    });

    it('should reject invalid transitions', () => {
      const node = sm.createNode({
        type: 'plan',
        title: 'Test',
        description: 'Test',
        data: { kind: 'plan' },
      });

      // planned → completed is not valid
      expect(() => sm.transitionNode(node.id, 'completed')).toThrow(/Invalid state transition/);
    });

    it('should allow completed → rolled_back', () => {
      const node = sm.createNode({
        type: 'step',
        title: 'Test Step',
        description: 'Test',
        data: { kind: 'step', stepType: 'file_write', params: {} },
      });

      sm.transitionNode(node.id, 'approved');
      sm.transitionNode(node.id, 'executing');
      sm.transitionNode(node.id, 'completed');

      const rolled = sm.transitionNode(node.id, 'rolled_back');
      expect(rolled.state).toBe('rolled_back');
    });

    it('should allow failed → planned (retry path)', () => {
      const node = sm.createNode({
        type: 'step',
        title: 'Test Step',
        description: 'Test',
        data: { kind: 'step', stepType: 'file_write', params: {} },
      });

      sm.transitionNode(node.id, 'approved');
      sm.transitionNode(node.id, 'executing');
      sm.transitionNode(node.id, 'failed');

      const retried = sm.transitionNode(node.id, 'planned');
      expect(retried.state).toBe('planned');
    });
  });

  // ─── Plan Operations ──────────────────────────────────────────────

  describe('createExecutionPlan', () => {
    it('should create a plan with child steps', () => {
      const plan = sm.createExecutionPlan({
        title: 'Test Plan',
        description: 'A test plan with steps',
        steps: [
          { title: 'Step 1', description: 'First step', type: 'file_write', params: { filePath: 'a.ts' } },
          { title: 'Step 2', description: 'Second step', type: 'command', params: { command: 'npm test' }, dependsOn: [0] },
        ],
      });

      expect(plan.type).toBe('plan');
      expect(plan.childIds).toHaveLength(2);
      expect(plan.state).toBe('planned');

      const children = sm.getChildren(plan.id);
      expect(children).toHaveLength(2);
      expect(children[0].title).toBe('Step 1');
      expect(children[1].title).toBe('Step 2');
      expect(children[1].dependsOn).toContain(children[0].id);
    });
  });

  // ─── Graph Queries ────────────────────────────────────────────────

  describe('graph queries', () => {
    it('should get nodes by type', () => {
      sm.createNode({ type: 'plan', title: 'P1', description: '', data: { kind: 'plan' } });
      sm.createNode({ type: 'plan', title: 'P2', description: '', data: { kind: 'plan' } });
      sm.createNode({ type: 'ai_reasoning', title: 'AI', description: '', data: { kind: 'ai_reasoning', providerId: 'x', model: 'y', prompt: '', response: '' } });

      const plans = sm.getNodesByType('plan');
      expect(plans).toHaveLength(2);
    });

    it('should return timeline sorted by creation time', () => {
      const n1 = sm.createNode({ type: 'plan', title: 'First', description: '', data: { kind: 'plan' } });
      const n2 = sm.createNode({ type: 'plan', title: 'Second', description: '', data: { kind: 'plan' } });

      const timeline = sm.getTimeline();
      expect(timeline[0].id).toBe(n1.id);
      expect(timeline[1].id).toBe(n2.id);
    });
  });

  // ─── Safety Scoring ───────────────────────────────────────────────

  describe('safety scoring', () => {
    it('should compute safety score for nodes', () => {
      const node = sm.createNode({
        type: 'terminal_command',
        title: 'Safe Command',
        description: 'A safe command',
        data: {
          kind: 'terminal_command',
          command: 'echo hello',
          cwd: '/tmp',
          terminalId: 't1',
          stdout: '',
          stderr: '',
          exitCode: null,
          truncated: false,
          isAI: false,
        },
      });

      expect(node.safetyScore).toBeGreaterThan(0);
    });

    it('should detect dangerous commands', () => {
      const node = sm.createNode({
        type: 'terminal_command',
        title: 'Dangerous Command',
        description: 'A dangerous command',
        data: {
          kind: 'terminal_command',
          command: 'rm -rf /',
          cwd: '/tmp',
          terminalId: 't1',
          stdout: '',
          stderr: '',
          exitCode: null,
          truncated: false,
          isAI: true,
        },
      });

      expect(node.safetyScore).toBeLessThanOrEqual(60);
      // Risk level should be elevated for dangerous commands
      expect(['high', 'critical']).toContain(node.riskLevel);
    });

    it('should run safety check for a set of nodes', () => {
      const node1 = sm.createNode({
        type: 'step',
        title: 'Safe Step',
        description: 'Safe',
        data: { kind: 'step', stepType: 'file_write', params: { filePath: 'src/test.ts' } },
      });

      const checkNode = sm.runSafetyCheck([node1.id]);
      expect(checkNode.type).toBe('safety_check');
      expect(checkNode.data).toHaveProperty('computedScore');
    });
  });

  // ─── Event System ─────────────────────────────────────────────────

  describe('event system', () => {
    it('should emit node:created events', () => {
      const events: any[] = [];
      sm.onEvent(e => events.push(e));

      sm.createNode({ type: 'plan', title: 'Test', description: '', data: { kind: 'plan' } });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].type).toBe('node:created');
    });

    it('should emit node:transition events', () => {
      const events: any[] = [];
      sm.onEvent(e => events.push(e));

      const node = sm.createNode({ type: 'plan', title: 'Test', description: '', data: { kind: 'plan' } });
      events.length = 0; // Clear creation events

      sm.transitionNode(node.id, 'approved');

      const transitionEvent = events.find(e => e.type === 'node:transition');
      expect(transitionEvent).toBeDefined();
      expect(transitionEvent.previousState).toBe('planned');
      expect(transitionEvent.newState).toBe('approved');
    });

    it('should allow unsubscribing from events', () => {
      const events: any[] = [];
      const unsub = sm.onEvent(e => events.push(e));

      sm.createNode({ type: 'plan', title: 'First', description: '', data: { kind: 'plan' } });
      expect(events.length).toBeGreaterThan(0);

      unsub();
      events.length = 0;

      sm.createNode({ type: 'plan', title: 'Second', description: '', data: { kind: 'plan' } });
      expect(events.length).toBe(0);
    });
  });

  // ─── Node Deletion ────────────────────────────────────────────────

  describe('deleteNode', () => {
    it('should delete a node and its children', () => {
      const plan = sm.createExecutionPlan({
        title: 'Plan to Delete',
        description: 'Will be deleted',
        steps: [
          { title: 'Step 1', description: '', type: 'file_write', params: {} },
          { title: 'Step 2', description: '', type: 'command', params: {} },
        ],
      });

      expect(sm.getNode(plan.id)).not.toBeNull();
      expect(sm.getChildren(plan.id)).toHaveLength(2);

      sm.deleteNode(plan.id);

      expect(sm.getNode(plan.id)).toBeNull();
      // Children should also be deleted
      const snapshot = sm.getGraphSnapshot();
      expect(snapshot.nodes.filter(n => n.title === 'Step 1' || n.title === 'Step 2')).toHaveLength(0);
    });
  });

  // ─── Source Links ─────────────────────────────────────────────────

  describe('causality tracking', () => {
    it('should track source links between nodes', () => {
      const aiNode = sm.createNode({
        type: 'ai_reasoning',
        title: 'AI Suggested Change',
        description: 'AI wants to edit a file',
        data: { kind: 'ai_reasoning', providerId: 'openai', model: 'gpt-4', prompt: 'fix bug', response: 'edit file' },
      });

      const editNode = sm.createNode({
        type: 'monaco_edit',
        title: 'Apply AI Edit',
        description: 'Applying AI suggestion',
        sourceIds: [aiNode.id],
        data: {
          kind: 'monaco_edit',
          filePath: 'src/bug.ts',
          region: { startLine: 1, startCol: 1, endLine: 5, endCol: 10 },
          originalContent: 'old',
          newContent: 'new',
          isAI: true,
        },
      });

      expect(editNode.sourceIds).toContain(aiNode.id);
    });
  });
});
