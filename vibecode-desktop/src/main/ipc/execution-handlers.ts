import { ipcMain, BrowserWindow } from 'electron';
import {
  ExecutionEngine,
  ExecutionPlan,
  ExecutionStep,
  StepInput,
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

const executionEngine = new ExecutionEngine();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerExecutionHandlers(): void {
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
      // Stream step updates to renderer during execution
      executionEngine.setExecutor(async (step: ExecutionStep) => {
        // Notify renderer about step execution
        try {
          const win = BrowserWindow.fromWebContents(event.sender);
          if (win && !win.isDestroyed()) {
            const stepStatus = {
              stepId: step.id,
              planId: step.planId,
              status: 'running',
              title: step.title,
              type: step.type,
              timestamp: Date.now(),
            };

            // Structured event
            win.webContents.send('execution:step:update', stepStatus);

            // Legacy compatible event for preload
            win.webContents.send('execution:status', stepStatus);
          }
        } catch {
          // Window might be closed
        }

        // Return a default result — in production, this would dispatch
        // to the appropriate handler (fs, terminal, etc.)
        return {
          stepId: step.id,
          type: step.type,
          executed: true,
          timestamp: Date.now(),
          params: step.params,
        };
      });

      const plan = await executionEngine.executePlan(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:executeStep ──────────────────────────────────────────────
  ipcMain.handle('execution:executeStep', async (_event, stepId: string) => {
    try {
      const step = await executionEngine.executeStep(stepId);
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

  console.log('[IPC] Execution handlers registered');
}

/** Expose executionEngine for use in other handlers */
export { executionEngine };
