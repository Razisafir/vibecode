// ─── VibeCode Desktop — Execution State Machine IPC Handlers ────────────────
// Bridges the ExecutionStateMachine to the renderer via IPC.
// ALL execution-related IPC should flow through here.
// ARC 12: Converged — legacy execution:* handlers are now routed through sm:*.
// ─────────────────────────────────────────────────────────────────────────────

import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import {
  ExecutionStateMachine,
  ExecutionNode,
  NodeState,
  UnifiedStepType,
  RiskLevel,
  StateMachineEvent,
  StepData,
} from '../services/execution-state-machine';
import { DiffEngine } from '../services/diff-engine';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';
import { ExecutionGateway, authorizeFsOp, generateAuditReport, isAuditClean } from '../core/execution-gateway';

// ─── Module State ──────────────────────────────────────────────────────────

let stateMachine: ExecutionStateMachine | null = null;
let diffEngine: DiffEngine | null = null;

export function getStateMachine(): ExecutionStateMachine | null {
  return stateMachine;
}

export function createStateMachine(workspaceRoot: string): ExecutionStateMachine {
  stateMachine = new ExecutionStateMachine(workspaceRoot);
  diffEngine = new DiffEngine(workspaceRoot);
  stateMachine.registerExecutorsFromWorkspace();
  return stateMachine;
}

export function getDiffEngine(): DiffEngine | null {
  return diffEngine;
}

// ─── Validation Schemas ────────────────────────────────────────────────────

const createPlanSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  steps: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(500),
    type: z.enum([
      'file_write', 'file_read', 'file_edit', 'file_delete',
      'command', 'code_generation', 'diff_apply', 'analysis', 'test', 'ai_suggestion',
    ]),
    params: z.record(z.unknown()),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    requiresApproval: z.boolean().optional(),
    dependsOn: z.array(z.number()).optional(),
  })),
  proposalId: z.string().optional(),
  chatMessageId: z.string().optional(),
  providerId: z.string().optional(),
  model: z.string().optional(),
});

const transitionSchema = z.object({
  nodeId: z.string().min(1),
  newState: z.enum(['planned', 'queued', 'approved', 'executing', 'completed', 'failed', 'rolled_back', 'cancelled']),
});

const safetyCheckSchema = z.object({
  targetNodeIds: z.array(z.string()),
  approvalRequired: z.boolean().optional(),
});

// ─── Node Serializer ─────────────────────────────────────────────────────

function serializeNode(node: ExecutionNode): Record<string, unknown> {
  return {
    id: node.id,
    type: node.type,
    state: node.state,
    title: node.title,
    description: node.description,
    parentId: node.parentId,
    childIds: node.childIds,
    dependsOn: node.dependsOn,
    sourceIds: node.sourceIds,
    createdAt: node.createdAt,
    startedAt: node.startedAt,
    completedAt: node.completedAt,
    updatedAt: node.updatedAt,
    data: node.data,
    riskLevel: node.riskLevel,
    safetyScore: node.safetyScore,
    requiresApproval: node.requiresApproval,
    result: node.result,
    error: node.error,
    retryCount: node.retryCount,
    maxRetries: node.maxRetries,
  };
}

// ─── Register IPC Handlers ──────────────────────────────────────────────

export function registerStateMachineHandlers(mainWindow: BrowserWindow | null): void {
  // ── Create state machine if needed ─────────────────────────────────────
  if (!stateMachine) {
    const workspaceRoot = process.cwd();
    stateMachine = new ExecutionStateMachine(workspaceRoot);
    diffEngine = new DiffEngine(workspaceRoot);
  }

  // ARC 15: Initialize the ExecutionGateway with the ESM instance
  ExecutionGateway.initialize(stateMachine);

  // Register real executors from workspace
  stateMachine.registerExecutorsFromWorkspace();

  // ── Graph Queries ─────────────────────────────────────────────────────

  ipcMain.handle('sm:getNode', async (_event, nodeId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const node = stateMachine.getNode(nodeId);
    return node ? { success: true, data: { node: serializeNode(node) } } : { success: false, error: 'Node not found' };
  });

  ipcMain.handle('sm:getTimeline', async () => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const timeline = stateMachine.getTimeline();
    return { success: true, data: { nodes: timeline.map(serializeNode), total: timeline.length } };
  });

  ipcMain.handle('sm:getGraph', async () => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const snapshot = stateMachine.getGraphSnapshot();
    return {
      success: true,
      data: {
        nodes: snapshot.nodes.map(serializeNode),
        rootIds: snapshot.rootIds,
        lastModified: snapshot.lastModified,
      },
    };
  });

  ipcMain.handle('sm:getPlans', async () => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const plans = stateMachine.getPlans();
    return {
      success: true,
      data: {
        plans: plans.map(p => ({
          ...serializeNode(p),
          progress: stateMachine!.getPlanProgress(p.id),
        })),
        total: plans.length,
      },
    };
  });

  ipcMain.handle('sm:getPlanProgress', async (_event, planId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    return { success: true, data: stateMachine.getPlanProgress(planId) };
  });

  ipcMain.handle('sm:getChildren', async (_event, parentId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const children = stateMachine.getChildren(parentId);
    return { success: true, data: { nodes: children.map(serializeNode) } };
  });

  ipcMain.handle('sm:getNodesByType', async (_event, type: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const nodes = stateMachine.getNodesByType(type as any);
    return { success: true, data: { nodes: nodes.map(serializeNode) } };
  });

  // ── Plan Operations ──────────────────────────────────────────────────

  ipcMain.handle('sm:createPlan', async (_event, params: unknown) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    const parsed = createPlanSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }

    try {
      const planNode = stateMachine.createExecutionPlan(parsed.data);
      auditLog.auditLog('execution:plan:created', {
        planId: planNode.id,
        title: planNode.title,
        stepCount: planNode.childIds.length,
        safetyScore: planNode.safetyScore,
      });
      return { success: true, data: { node: serializeNode(planNode) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('state-machine', `Failed to create plan: ${msg}`);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('sm:approvePlan', async (_event, planId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const plan = stateMachine.approvePlan(planId);
      auditLog.auditLog('execution:plan:approved', { planId, title: plan.title });
      return { success: true, data: { node: serializeNode(plan) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('sm:executePlan', async (_event, planId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const plan = await stateMachine.executePlan(planId);
      return { success: true, data: { node: serializeNode(plan) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('state-machine', `Plan execution failed: ${msg}`);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('sm:cancelPlan', async (_event, planId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    stateMachine.cancelPlan(planId);
    const plan = stateMachine.getNode(planId);
    return { success: true, data: { node: plan ? serializeNode(plan) : null } };
  });

  ipcMain.handle('sm:executeStep', async (_event, stepId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const step = await stateMachine.executeStep(stepId);
      return { success: true, data: { node: serializeNode(step) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('sm:retryStep', async (_event, stepId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const step = await stateMachine.retryStep(stepId);
      return { success: true, data: { node: serializeNode(step) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  // ── Propose ──────────────────────────────────────────────────────────

  ipcMain.handle('sm:propose', async (_event, title: string, description: string, steps: unknown) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    const parsed = createPlanSchema.safeParse({ title, description, steps });
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }

    try {
      const planNode = stateMachine.propose(
        parsed.data.title,
        parsed.data.description,
        parsed.data.steps as Array<{
          title: string;
          description: string;
          type: UnifiedStepType;
          params: Record<string, unknown>;
          riskLevel?: RiskLevel;
          requiresApproval?: boolean;
          dependsOn?: number[];
        }>,
      );
      auditLog.auditLog('execution:propose:created', {
        planId: planNode.id,
        title: planNode.title,
        stepCount: planNode.childIds.length,
        safetyScore: planNode.safetyScore,
      });
      return { success: true, data: { node: serializeNode(planNode) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('state-machine', `Failed to create proposal: ${msg}`);
      return { success: false, error: msg };
    }
  });

  // ── History ──────────────────────────────────────────────────────────

  ipcMain.handle('sm:getHistory', async () => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    const history = stateMachine.getHistory();
    return { success: true, data: { history: history.map(serializeNode), total: history.length } };
  });

  // ── Diff ─────────────────────────────────────────────────────────────

  ipcMain.handle('sm:getDiff', async (_event, stepId: string) => {
    if (!stateMachine || !diffEngine) return { success: false, error: 'State machine not initialized' };

    try {
      const node = stateMachine.getNode(stepId);
      if (!node) return { success: false, error: `Node not found: ${stepId}` };

      // Adapt ExecutionNode to the shape DiffEngine expects for step diffs
      const stepData = node.data as StepData;
      if (!stepData || stepData.kind !== 'step') {
        return { success: false, error: `Node is not a step: ${stepId}` };
      }

      // Build a legacy-compatible step object for DiffEngine
      const legacyStep = {
        id: node.id,
        title: node.title,
        type: stepData.stepType,
        params: stepData.params,
        planId: node.parentId ?? '',
        status: node.state,
        riskLevel: node.riskLevel,
        requiresApproval: node.requiresApproval,
        error: node.error,
        retryCount: node.retryCount,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
      };

      const diffResult = await diffEngine.generateFileDiffFromStep(legacyStep as any);
      if (!diffResult) {
        return { success: false, error: `Cannot generate diff for step type "${stepData.stepType}" or no file content available` };
      }
      return { success: true, data: diffResult };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('sm:getPlanDiffs', async (_event, planId: string) => {
    if (!stateMachine || !diffEngine) return { success: false, error: 'State machine not initialized' };

    try {
      const plan = stateMachine.getNode(planId);
      if (!plan) return { success: false, error: `Plan not found: ${planId}` };

      const children = stateMachine.getChildren(planId);
      const diffs: any[] = [];

      for (const child of children) {
        const stepData = child.data as StepData;
        if (!stepData || stepData.kind !== 'step') continue;

        const legacyStep = {
          id: child.id,
          title: child.title,
          type: stepData.stepType,
          params: stepData.params,
          planId: child.parentId ?? '',
          status: child.state,
          riskLevel: child.riskLevel,
          requiresApproval: child.requiresApproval,
          error: child.error,
          retryCount: child.retryCount,
          startedAt: child.startedAt,
          completedAt: child.completedAt,
        };

        const diffResult = await diffEngine.generateFileDiffFromStep(legacyStep as any);
        if (diffResult) {
          diffs.push(diffResult);
        }
      }

      return { success: true, data: { diffs } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  // ── State Transitions ────────────────────────────────────────────────

  ipcMain.handle('sm:transition', async (_event, params: unknown) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    const parsed = transitionSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }

    try {
      const node = stateMachine.transitionNode(parsed.data.nodeId, parsed.data.newState as NodeState);
      return { success: true, data: { node: serializeNode(node) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  // ── Rollback ──────────────────────────────────────────────────────────

  ipcMain.handle('sm:rollbackStep', async (_event, stepId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const step = await stateMachine.rollbackStep(stepId);
      auditLog.auditLog('execution:rollback:step', { stepId, status: step.state });
      return { success: true, data: { node: serializeNode(step) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('sm:rollbackPlan', async (_event, planId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const plan = await stateMachine.rollbackPlan(planId);
      auditLog.auditLog('execution:rollback:plan', { planId, status: plan.state });
      return { success: true, data: { node: serializeNode(plan) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  // ── Safety ────────────────────────────────────────────────────────────

  ipcMain.handle('sm:runSafetyCheck', async (_event, params: unknown) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    const parsed = safetyCheckSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: `Invalid params: ${parsed.error.message}` };
    }

    const node = stateMachine.runSafetyCheck(parsed.data.targetNodeIds, parsed.data.approvalRequired);
    return { success: true, data: { node: serializeNode(node) } };
  });

  ipcMain.handle('sm:getSafetyScore', async (_event, planId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    return { success: true, data: { score: stateMachine.getAggregateSafetyScore(planId) } };
  });

  // ── Workspace ─────────────────────────────────────────────────────────

  ipcMain.handle('sm:setWorkspace', async (_event, workspaceRoot: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    // Update workspace root on the state machine
    stateMachine.setWorkspaceRoot(workspaceRoot);

    // Re-register executors for the new workspace
    stateMachine.registerExecutorsFromWorkspace();

    // Update the DiffEngine for the new workspace
    diffEngine = new DiffEngine(workspaceRoot);

    logger.info('state-machine', `Workspace set to: ${workspaceRoot} (executors re-registered, diff engine updated)`);
    return { success: true, data: { workspaceRoot: stateMachine.getWorkspaceRoot() } };
  });

  // ── Node Deletion ─────────────────────────────────────────────────────

  ipcMain.handle('sm:deleteNode', async (_event, nodeId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    stateMachine.deleteNode(nodeId);
    return { success: true, data: { deleted: true, nodeId } };
  });

  // ── Persistence (ARC 14) ───────────────────────────────────────────────

  ipcMain.handle('sm:saveGraph', async () => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    stateMachine.saveGraph();
    return { success: true, data: { saved: true } };
  });

  ipcMain.handle('sm:flushPersistence', async () => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    stateMachine.flushPersistence();
    return { success: true, data: { flushed: true } };
  });

  // ── Audit Report (ARC 15) ──────────────────────────────────────────────

  ipcMain.handle('sm:getAuditReport', async () => {
    return { success: true, data: generateAuditReport() };
  });

  ipcMain.handle('sm:isAuditClean', async () => {
    return { success: true, data: { clean: isAuditClean() } };
  });

  // ── Monaco Edit Tracking (ARC 15: Gateway-enforced) ──────────────────────
  // "No Node → No Action" — Monaco saves MUST go through the Gateway.
  // The Gateway creates the node, runs safety checks, and authorizes the FS write.

  ipcMain.handle('sm:createMonacoEditNode', async (_event, params: {
    filePath: string;
    originalContent: string;
    newContent: string;
    isAI: boolean;
    region?: { startLine: number; startCol: number; endLine: number; endCol: number };
    linkedStepId?: string;
  }) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };

    try {
      const { filePath, originalContent, newContent, isAI, region, linkedStepId } = params;

      // ARC 15: Route through ExecutionGateway — the ONLY valid execution surface
      const result = await ExecutionGateway.executeMonacoEdit({
        filePath,
        originalContent,
        newContent,
        region,
        isAI,
        linkedStepId,
        autoApprove: true,
      });

      if (!result.allowed) {
        logger.warn('state-machine', `Monaco edit BLOCKED by gateway: ${filePath} — ${result.blockReason}`);
        return { success: false, error: result.blockReason || 'Blocked by safety gate' };
      }

      const node = result.node;

      // ARC 15: Authorize the FS write for this file path in the audit system
      // This tells the FS handler that this write was gateway-authorized
      authorizeFsOp(filePath, node.id, 'write');

      // If the gateway already executed (result has data), the node is already completed
      // If not, immediately transition to completed since the edit is about to happen
      if (node.state !== 'completed' && node.state !== 'failed') {
        try {
          stateMachine.transitionNode(node.id, 'completed');
        } catch {
          // May already be in terminal state
        }
      }

      logger.info('state-machine', `Monaco edit tracked via Gateway: ${filePath} (node ${node.id.substring(0, 8)})`);
      return { success: true, data: { node: serializeNode(node) } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('state-machine', `Failed to track Monaco edit: ${msg}`);
      return { success: false, error: msg };
    }
  });

  // ── Push Events to Renderer ───────────────────────────────────────────

  if (stateMachine && mainWindow) {
    stateMachine.onEvent((event: StateMachineEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sm:event', {
          type: event.type,
          nodeId: event.nodeId,
          previousState: event.previousState,
          newState: event.newState,
          timestamp: event.timestamp,
          data: event.data,
        });
      }
    });
  }

  // Also forward events to ALL browser windows (like the legacy handlers did)
  if (stateMachine) {
    stateMachine.onEvent((event: StateMachineEvent) => {
      try {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('sm:event', {
              type: event.type,
              nodeId: event.nodeId,
              previousState: event.previousState,
              newState: event.newState,
              timestamp: event.timestamp,
              data: event.data,
            });
          }
        }
      } catch {
        // Windows might be closed
      }
    });
  }

  logger.info('state-machine', 'IPC handlers registered (ARC 15 — graph enforcement via ExecutionGateway)');
}
