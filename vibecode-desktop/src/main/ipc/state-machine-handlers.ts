// ─── VibeCode Desktop — Execution State Machine IPC Handlers ────────────────
// Bridges the ExecutionStateMachine to the renderer via IPC.
// ALL execution-related IPC should flow through here.
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
} from '../services/execution-state-machine';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';

// ─── Module State ──────────────────────────────────────────────────────────

let stateMachine: ExecutionStateMachine | null = null;

export function getStateMachine(): ExecutionStateMachine | null {
  return stateMachine;
}

export function createStateMachine(workspaceRoot: string): ExecutionStateMachine {
  stateMachine = new ExecutionStateMachine(workspaceRoot);
  return stateMachine;
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
    stateMachine.setWorkspaceRoot(workspaceRoot);
    return { success: true, data: { workspaceRoot: stateMachine.getWorkspaceRoot() } };
  });

  // ── Node Deletion ─────────────────────────────────────────────────────

  ipcMain.handle('sm:deleteNode', async (_event, nodeId: string) => {
    if (!stateMachine) return { success: false, error: 'State machine not initialized' };
    stateMachine.deleteNode(nodeId);
    return { success: true, data: { deleted: true, nodeId } };
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
        });
      }
    });
  }

  logger.info('state-machine', 'IPC handlers registered');
}
