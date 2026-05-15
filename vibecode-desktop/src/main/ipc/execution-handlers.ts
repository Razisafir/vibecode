import { ipcMain, BrowserWindow } from 'electron';
import {
  ExecutionEngine,
  ExecutionStep,
  StepInput,
  ExecutionEvent,
} from '../services/execution-engine';
import { DiffEngine } from '../services/diff-engine';
import { ExecutionQueue, QueueEvent } from '../services/execution-queue';
import { validateWithError } from '../utils/validation';
import { PlanInputSchema, IdSchema } from '../utils/schemas';
import { auditLog } from '../utils/audit-log';

// ─── Types ──────────────────────────────────────────────────────────────────

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function err(message: string): IpcResult {
  return { success: false, error: message };
}

// ─── Singleton Instances ────────────────────────────────────────────────────

let executionEngine = new ExecutionEngine(process.cwd());
let diffEngine = new DiffEngine(process.cwd());
let executionQueue = new ExecutionQueue(executionEngine);

export function setExecutionWorkspaceRoot(workspaceRoot: string): void {
  executionEngine = new ExecutionEngine(workspaceRoot);
  diffEngine = new DiffEngine(workspaceRoot);
  executionQueue = new ExecutionQueue(executionEngine);
  console.log(`[Execution] Workspace root set to: ${workspaceRoot}`);
}

export function getExecutionEngine(): ExecutionEngine {
  return executionEngine;
}

export function getDiffEngine(): DiffEngine {
  return diffEngine;
}

export function getExecutionQueue(): ExecutionQueue {
  return executionQueue;
}

// ─── Helper: Stream step updates to renderer ────────────────────────────────

function sendStepUpdate(event: Electron.IpcMainInvokeEvent, step: ExecutionStep, status: string): void {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      const stepStatus = {
        stepId: step.id,
        planId: step.planId,
        status,
        title: step.title,
        type: step.type,
        timestamp: Date.now(),
        error: step.error,
        result: step.result,
      };
      win.webContents.send('execution:step:update', stepStatus);
      win.webContents.send('execution:status', stepStatus);
    }
  } catch {
    // Window might be closed
  }
}

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerExecutionHandlers(): void {
  executionEngine.onEvent((event: ExecutionEvent) => {
    try {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('execution:step:update', {
            type: event.type, planId: event.planId, stepId: event.stepId,
            timestamp: event.timestamp, data: event.data,
          });
          win.webContents.send('execution:status', {
            type: event.type, planId: event.planId, stepId: event.stepId,
            timestamp: event.timestamp, data: event.data,
          });
        }
      }
    } catch { /* Window might be closed */ }
  });

  executionQueue.onEvent((event: QueueEvent) => {
    try {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('execution:queue:update', {
            type: event.type, entryId: event.entryId, planId: event.planId,
            timestamp: event.timestamp, data: event.data,
          });
        }
      }
    } catch { /* Window might be closed */ }
  });

  // ── execution:plan ─────────────────────────────────────────────────────
  ipcMain.handle(
    'execution:plan',
    async (_event, title: string, description: string, steps: StepInput[]) => {
      try {
        const validation = validateWithError(PlanInputSchema, { title, description, steps });
        if (!validation.success) return err(validation.error!);
        const plan = executionEngine.createPlan(validation.data!.title, validation.data!.description, validation.data!.steps);
        return ok({ plan });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── execution:approve ──────────────────────────────────────────────────
  ipcMain.handle('execution:approve', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const plan = executionEngine.approvePlan(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:execute ──────────────────────────────────────────────────
  ipcMain.handle('execution:execute', async (event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const plan = await executionEngine.executePlan(planId);
      for (const step of plan.steps) { sendStepUpdate(event, step, step.status); }
      auditLog.auditLog('execution.execute', { planId, status: plan.status, stepCount: plan.steps.length });
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:executeStep ──────────────────────────────────────────────
  ipcMain.handle('execution:executeStep', async (event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      const step = await executionEngine.executeStep(stepId);
      sendStepUpdate(event, step, step.status);
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:status ───────────────────────────────────────────────────
  ipcMain.handle('execution:status', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const plan = executionEngine.getPlan(planId);
      if (!plan) return err(`Plan not found: ${planId}`);
      const stepSummary = plan.steps.map((s) => ({
        id: s.id, title: s.title, type: s.type, status: s.status,
        riskLevel: s.riskLevel, requiresApproval: s.requiresApproval,
        error: s.error, retryCount: s.retryCount, startedAt: s.startedAt, completedAt: s.completedAt,
      }));
      return ok({
        plan: { id: plan.id, title: plan.title, description: plan.description, status: plan.status, createdAt: plan.createdAt, updatedAt: plan.updatedAt },
        steps: stepSummary,
        progress: {
          total: plan.steps.length,
          completed: plan.steps.filter((s) => s.status === 'completed').length,
          failed: plan.steps.filter((s) => s.status === 'failed').length,
          running: plan.steps.filter((s) => s.status === 'running').length,
          pending: plan.steps.filter((s) => s.status === 'pending').length,
        },
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:cancel ───────────────────────────────────────────────────
  ipcMain.handle('execution:cancel', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      executionEngine.cancelPlan(planId);
      const plan = executionEngine.getPlan(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:retry ────────────────────────────────────────────────────
  ipcMain.handle('execution:retry', async (_event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      const step = await executionEngine.retryStep(stepId);
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:history ──────────────────────────────────────────────────
  ipcMain.handle('execution:history', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const plan = executionEngine.getPlan(planId);
      if (!plan) return err(`Plan not found: ${planId}`);
      const history = plan.steps
        .filter((s) => s.startedAt)
        .map((s) => ({
          id: s.id, title: s.title, type: s.type, status: s.status,
          startedAt: s.startedAt, completedAt: s.completedAt,
          duration: s.completedAt && s.startedAt ? s.completedAt - s.startedAt : null,
          error: s.error, retryCount: s.retryCount, riskLevel: s.riskLevel, result: s.result,
        }))
        .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
      return ok({ history, planId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:propose ──────────────────────────────────────────────────
  ipcMain.handle(
    'execution:propose',
    async (_event, title: string, description: string, steps: StepInput[]) => {
      try {
        const validation = validateWithError(PlanInputSchema, { title, description, steps });
        if (!validation.success) return err(validation.error!);
        const plan = executionEngine.propose(validation.data!.title, validation.data!.description, validation.data!.steps);
        return ok({ plan });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── execution:getPlan ──────────────────────────────────────────────────
  ipcMain.handle('execution:getPlan', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const plan = executionEngine.getPlan(planId);
      if (!plan) return err(`Plan not found: ${planId}`);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getStep ──────────────────────────────────────────────────
  ipcMain.handle('execution:getStep', async (_event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      const step = executionEngine.getStep(stepId);
      if (!step) return err(`Step not found: ${stepId}`);
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:detectBlockers ───────────────────────────────────────────
  ipcMain.handle('execution:detectBlockers', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const blockers = executionEngine.detectBlockers(planId);
      return ok({ blockers, count: blockers.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:rollbackStep ─────────────────────────────────────────────
  ipcMain.handle('execution:rollbackStep', async (_event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      await executionEngine.rollbackStep(stepId);
      const step = executionEngine.getStep(stepId);
      auditLog.auditLog('execution.rollbackStep', { stepId });
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:rollbackPlan ─────────────────────────────────────────────
  ipcMain.handle('execution:rollbackPlan', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      await executionEngine.rollbackPlan(planId);
      const plan = executionEngine.getPlan(planId);
      auditLog.auditLog('execution.rollbackPlan', { planId });
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:listPlans ────────────────────────────────────────────────
  ipcMain.handle('execution:listPlans', async () => {
    try {
      const plans = executionEngine.getAllPlans();
      const summary = plans.map((plan) => ({
        id: plan.id, title: plan.title, description: plan.description, status: plan.status,
        stepCount: plan.steps.length,
        completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
        failedSteps: plan.steps.filter((s) => s.status === 'failed').length,
        createdAt: plan.createdAt, updatedAt: plan.updatedAt,
      }));
      return ok({ plans: summary, total: summary.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:deletePlan ───────────────────────────────────────────────
  ipcMain.handle('execution:deletePlan', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      executionEngine.deletePlan(planId);
      return ok({ deleted: true, planId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:setWorkspace ─────────────────────────────────────────────
  ipcMain.handle('execution:setWorkspace', async (_event, workspaceRoot: string) => {
    try {
      if (!workspaceRoot || typeof workspaceRoot !== 'string') return err('workspaceRoot is required and must be a string');
      setExecutionWorkspaceRoot(workspaceRoot);
      return ok({ workspaceRoot });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getDiff ──────────────────────────────────────────────────
  ipcMain.handle('execution:getDiff', async (_event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      const step = executionEngine.getStep(stepId);
      if (!step) return err(`Step not found: ${stepId}`);
      const diffResult = await diffEngine.generateFileDiffFromStep(step);
      if (!diffResult) return err(`Cannot generate diff for step type "${step.type}" or no file content available`);
      return ok(diffResult);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getPlanDiffs ─────────────────────────────────────────────
  ipcMain.handle('execution:getPlanDiffs', async (_event, planId: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);
      const plan = executionEngine.getPlan(planId);
      if (!plan) return err(`Plan not found: ${planId}`);
      const diffs = await diffEngine.generatePlanDiffs(plan.steps);
      return ok({ diffs });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getStepResult ────────────────────────────────────────────
  ipcMain.handle('execution:getStepResult', async (_event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      const step = executionEngine.getStep(stepId);
      if (!step) return err(`Step not found: ${stepId}`);
      const output = executionQueue.getStepOutput(stepId);
      return ok({ step, output: output ?? undefined });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getStepOutput ────────────────────────────────────────────
  ipcMain.handle('execution:getStepOutput', async (_event, stepId: string) => {
    try {
      const idV = validateWithError(IdSchema, stepId);
      if (!idV.success) return err(idV.error!);
      const output = executionQueue.getStepOutput(stepId);
      if (!output) return err(`No output captured for step: ${stepId}`);
      return ok(output);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:queue:list ───────────────────────────────────────────────
  ipcMain.handle('execution:queue:list', async () => {
    try {
      const entries = executionQueue.list();
      return ok({ entries });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:queue:add ────────────────────────────────────────────────
  ipcMain.handle(
    'execution:queue:add',
    async (_event, planId: string, priority?: number, stepTimeout?: number) => {
      try {
        const idV = validateWithError(IdSchema, planId);
        if (!idV.success) return err(idV.error!);
        const entry = executionQueue.add(planId, priority ?? 0, stepTimeout ?? 120_000);
        return ok(entry);
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── execution:queue:cancel ─────────────────────────────────────────────
  ipcMain.handle('execution:queue:cancel', async (_event, entryId: string) => {
    try {
      const idV = validateWithError(IdSchema, entryId);
      if (!idV.success) return err(idV.error!);
      const cancelled = executionQueue.cancel(entryId);
      return ok({ cancelled });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getHistory ───────────────────────────────────────────────
  ipcMain.handle('execution:getHistory', async () => {
    try {
      const history = executionQueue.getHistory();
      return ok({ history });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Execution handlers registered (with validation, diff preview + execution queue + history)');
}

/** Expose executionEngine for use in other handlers */
export { executionEngine };
