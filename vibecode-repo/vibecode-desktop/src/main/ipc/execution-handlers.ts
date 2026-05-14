import { ipcMain, BrowserWindow } from 'electron';
import {
  ExecutionEngine,
  ExecutionPlan,
  ExecutionStep,
  StepInput,
} from '../services/execution-engine';
import {
  ProposalOrchestrator,
  ExecutionProgressEvent,
  ProposalGenerationResult,
} from '../services/proposal-orchestrator';
import { FileSystemSandbox } from '../services/sandbox';

// Import all executors to register them
import '../services/executors';

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

// ─── Singletons ─────────────────────────────────────────────────────────────

const executionEngine = new ExecutionEngine();
const sandbox = new FileSystemSandbox();
let orchestrator: ProposalOrchestrator | null = null;

/** Initialize the orchestrator with a workspace root */
function ensureOrchestrator(workspaceRoot?: string): ProposalOrchestrator {
  if (!orchestrator) {
    const root = workspaceRoot ?? process.cwd();
    sandbox.addRoot(root);
    orchestrator = new ProposalOrchestrator(executionEngine, sandbox, root);
  }
  return orchestrator;
}

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
      const orch = ensureOrchestrator();
      const plan = await orch.approveAndExecute(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:execute ──────────────────────────────────────────────────
  ipcMain.handle('execution:execute', async (event, planId: string) => {
    try {
      const orch = ensureOrchestrator();

      // Subscribe to progress events and forward to renderer
      const unsubscribe = orch.onProgress((progressEvent: ExecutionProgressEvent) => {
        try {
          const win = BrowserWindow.fromWebContents(event.sender);
          if (win && !win.isDestroyed()) {
            // Structured event for new consumers
            win.webContents.send('execution:step:update', {
              stepId: progressEvent.stepId,
              planId: progressEvent.planId,
              type: progressEvent.type,
              message: progressEvent.message,
              data: progressEvent.data,
              timestamp: progressEvent.timestamp,
            });

            // Legacy compatible event for preload
            win.webContents.send('execution:status', {
              stepId: progressEvent.stepId,
              planId: progressEvent.planId,
              type: progressEvent.type,
              status: mapProgressTypeToStatus(progressEvent.type),
              message: progressEvent.message,
              timestamp: progressEvent.timestamp,
            });
          }
        } catch {
          // Window might be closed
        }
      });

      try {
        const plan = await orch.approveAndExecute(planId);
        return ok({ plan });
      } finally {
        unsubscribe();
      }
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
      const orch = ensureOrchestrator();
      orch.cancelExecution(planId);
      const plan = executionEngine.getPlan(planId);
      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:reject ───────────────────────────────────────────────────
  ipcMain.handle('execution:reject', async (_event, planId: string) => {
    try {
      const orch = ensureOrchestrator();
      orch.rejectProposal(planId);
      return ok({ rejected: true, planId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:modifyStep ───────────────────────────────────────────────
  ipcMain.handle(
    'execution:modifyStep',
    async (_event, planId: string, stepId: string, updates: Record<string, unknown>) => {
      try {
        const orch = ensureOrchestrator();
        orch.modifyProposalStep(planId, stepId, updates as any);
        return ok({ modified: true, planId, stepId });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

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

  // ── execution:processAIResponse ────────────────────────────────────────
  //
  // The core pipeline endpoint: AI response → parsed intent → proposal
  //
  ipcMain.handle(
    'execution:processAIResponse',
    async (
      _event,
      aiResponse: string,
      userMessage: string,
      context?: { workspaceRoot?: string; openFiles?: string[] }
    ) => {
      try {
        const orch = ensureOrchestrator(context?.workspaceRoot);
        const result = orch.processAIResponse(aiResponse, userMessage, context);

        if (!result) {
          return ok({ hasProposal: false });
        }

        return ok({
          hasProposal: true,
          proposal: result.proposal,
          intent: result.intent,
          autoApproved: result.autoApproved,
        });
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

  // ── execution:rollback ─────────────────────────────────────────────────
  //
  // Restore backup files for a completed/failed plan
  //
  ipcMain.handle('execution:rollback', async (_event, planId: string) => {
    try {
      const plan = executionEngine.getPlan(planId);
      if (!plan) {
        return err(`Plan not found: ${planId}`);
      }

      const rollbackResults: Array<{ stepId: string; success: boolean; error?: string }> = [];

      for (const step of plan.steps) {
        if (step.status === 'completed' && step.result) {
          const result = step.result as Record<string, unknown>;
          const backupPath = result.backupPath as string | undefined;

          if (backupPath) {
            try {
              const { default: fs } = await import('fs');
              if (fs.existsSync(backupPath)) {
                const filePath = result.filePath as string;
                fs.copyFileSync(backupPath, filePath);
                fs.unlinkSync(backupPath); // Clean up backup
                rollbackResults.push({ stepId: step.id, success: true });
              }
            } catch (rollbackErr) {
              rollbackResults.push({
                stepId: step.id,
                success: false,
                error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
              });
            }
          }
        }
      }

      return ok({ rollbackResults, planId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── execution:executionHistory ─────────────────────────────────────────
  ipcMain.handle('execution:executionHistory', async () => {
    try {
      const orch = ensureOrchestrator();
      const history = orch.getExecutionHistory();
      return ok({ history, count: history.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── sandbox:addRoot ────────────────────────────────────────────────────
  ipcMain.handle('sandbox:addRoot', async (_event, rootPath: string) => {
    try {
      sandbox.addRoot(rootPath);
      if (orchestrator) {
        orchestrator.setWorkspaceRoot(rootPath);
      }
      return ok({ added: true, rootPath });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── sandbox:getRoots ───────────────────────────────────────────────────
  ipcMain.handle('sandbox:getRoots', async () => {
    try {
      const roots = sandbox.getAllowedRoots();
      return ok({ roots });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── sandbox:getBlockedLog ──────────────────────────────────────────────
  ipcMain.handle('sandbox:getBlockedLog', async () => {
    try {
      const log = sandbox.getBlockedAccessLog();
      return ok({ log, count: log.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Execution handlers registered (with real executors + orchestrator)');
}

/** Map progress event types to legacy status strings */
function mapProgressTypeToStatus(type: ExecutionProgressEvent['type']): string {
  switch (type) {
    case 'step_started':
      return 'running';
    case 'step_progress':
      return 'running';
    case 'step_completed':
      return 'completed';
    case 'step_failed':
      return 'failed';
    case 'plan_completed':
      return 'completed';
    case 'plan_failed':
      return 'failed';
    case 'plan_cancelled':
      return 'cancelled';
    case 'plan_created':
      return 'draft';
    case 'plan_approved':
      return 'approved';
    default:
      return 'pending';
  }
}

/** Expose executionEngine for use in other handlers */
export { executionEngine };
