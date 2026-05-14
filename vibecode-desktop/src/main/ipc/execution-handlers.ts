import { ipcMain, BrowserWindow } from 'electron';
import {
  ExecutionEngine,
  ExecutionPlan,
  ExecutionStep,
  StepInput,
  ExecutionEvent,
} from '../services/execution-engine';

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

// ─── Singleton Execution Engine ─────────────────────────────────────────────

// Initialize with a default workspace root. The workspace can be updated
// when a workspace is opened via workspace:open.
let executionEngine = new ExecutionEngine(process.cwd());

/**
 * Update the execution engine's workspace root.
 * This should be called when the user opens a new workspace.
 */
export function setExecutionWorkspaceRoot(workspaceRoot: string): void {
  executionEngine = new ExecutionEngine(workspaceRoot);
  console.log(`[Execution] Workspace root set to: ${workspaceRoot}`);
}

/**
 * Get the current execution engine instance.
 */
export function getExecutionEngine(): ExecutionEngine {
  return executionEngine;
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

      // Structured event
      win.webContents.send('execution:step:update', stepStatus);

      // Legacy compatible event for preload
      win.webContents.send('execution:status', stepStatus);
    }
  } catch {
    // Window might be closed
  }
}

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerExecutionHandlers(): void {
  // Subscribe to execution engine events to stream updates to renderer
  executionEngine.onEvent((event: ExecutionEvent) => {
    try {
      // Broadcast to all windows
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('execution:step:update', {
            type: event.type,
            planId: event.planId,
            stepId: event.stepId,
            timestamp: event.timestamp,
            data: event.data,
          });

          // Legacy compatible event
          win.webContents.send('execution:status', {
            type: event.type,
            planId: event.planId,
            stepId: event.stepId,
            timestamp: event.timestamp,
            data: event.data,
          });
        }
      }
    } catch {
      // Window might be closed
    }
  });

  // ── execution:plan ─────────────────────────────────────────────────────
  ipcMain.handle(
    'execution:plan',
    async (_event, title: string, description: string, steps: StepInput[]) => {
      try {
        const plan = executionEngine.createPlan(title, description, steps);
        return ok({ plan });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── execution:approve ──────────────────────────────────────────────────
  ipcMain.handle('execution:approve', async (_event, planId: string) => {
    try {
      const plan = executionEngine.approvePlan(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:execute ──────────────────────────────────────────────────
  ipcMain.handle('execution:execute', async (event, planId: string) => {
    try {
      // The execution engine now has REAL executors built-in.
      // No need to set a fake executor — just execute the plan.
      const plan = await executionEngine.executePlan(planId);

      // Send final status update
      for (const step of plan.steps) {
        sendStepUpdate(event, step, step.status);
      }

      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:executeStep ──────────────────────────────────────────────
  ipcMain.handle('execution:executeStep', async (event, stepId: string) => {
    try {
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
      const plan = executionEngine.getPlan(planId);
      if (!plan) {
        return err(`Plan not found: ${planId}`);
      }

      const stepSummary = plan.steps.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        status: s.status,
        riskLevel: s.riskLevel,
        requiresApproval: s.requiresApproval,
        error: s.error,
        retryCount: s.retryCount,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      }));

      return ok({
        plan: {
          id: plan.id,
          title: plan.title,
          description: plan.description,
          status: plan.status,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
        },
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
      const step = await executionEngine.retryStep(stepId);
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:history ──────────────────────────────────────────────────
  ipcMain.handle('execution:history', async (_event, planId: string) => {
    try {
      const plan = executionEngine.getPlan(planId);
      if (!plan) {
        return err(`Plan not found: ${planId}`);
      }

      const history = plan.steps
        .filter((s) => s.startedAt)
        .map((s) => ({
          id: s.id,
          title: s.title,
          type: s.type,
          status: s.status,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          duration: s.completedAt && s.startedAt ? s.completedAt - s.startedAt : null,
          error: s.error,
          retryCount: s.retryCount,
          riskLevel: s.riskLevel,
          result: s.result,
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
        const plan = executionEngine.propose(title, description, steps);
        return ok({ plan });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── execution:getPlan ──────────────────────────────────────────────────
  ipcMain.handle('execution:getPlan', async (_event, planId: string) => {
    try {
      const plan = executionEngine.getPlan(planId);
      if (!plan) {
        return err(`Plan not found: ${planId}`);
      }
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:getStep ──────────────────────────────────────────────────
  ipcMain.handle('execution:getStep', async (_event, stepId: string) => {
    try {
      const step = executionEngine.getStep(stepId);
      if (!step) {
        return err(`Step not found: ${stepId}`);
      }
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:detectBlockers ───────────────────────────────────────────
  ipcMain.handle('execution:detectBlockers', async (_event, planId: string) => {
    try {
      const blockers = executionEngine.detectBlockers(planId);
      return ok({ blockers, count: blockers.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:rollbackStep (NEW) ───────────────────────────────────────
  ipcMain.handle('execution:rollbackStep', async (_event, stepId: string) => {
    try {
      await executionEngine.rollbackStep(stepId);
      const step = executionEngine.getStep(stepId);
      return ok({ step });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:rollbackPlan (NEW) ───────────────────────────────────────
  ipcMain.handle('execution:rollbackPlan', async (_event, planId: string) => {
    try {
      await executionEngine.rollbackPlan(planId);
      const plan = executionEngine.getPlan(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:listPlans (NEW) ──────────────────────────────────────────
  ipcMain.handle('execution:listPlans', async () => {
    try {
      const plans = executionEngine.getAllPlans();
      const summary = plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        stepCount: plan.steps.length,
        completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
        failedSteps: plan.steps.filter((s) => s.status === 'failed').length,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      }));
      return ok({ plans: summary, total: summary.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:deletePlan (NEW) ─────────────────────────────────────────
  ipcMain.handle('execution:deletePlan', async (_event, planId: string) => {
    try {
      executionEngine.deletePlan(planId);
      return ok({ deleted: true, planId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:setWorkspace (NEW) ───────────────────────────────────────
  ipcMain.handle('execution:setWorkspace', async (_event, workspaceRoot: string) => {
    try {
      setExecutionWorkspaceRoot(workspaceRoot);
      return ok({ workspaceRoot });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Execution handlers registered (with real executors + rollback + persistence)');
}

/** Expose executionEngine for use in other handlers */
export { executionEngine };
