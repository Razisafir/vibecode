// ============================================================
// VibeCode Desktop — Proposal IPC Handlers
// Wires the proposal generator to the IPC layer
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import {
  getProposalGenerator,
  resetProposalGenerator,
  ExecutionIntent,
  ProposalCardData,
} from '../services/proposal-generator';
import { getExecutionEngine } from './execution-handlers';

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

// ─── In-memory proposal store ───────────────────────────────────────────────
// Maps proposalId → ProposalCardData for fast lookup by the renderer.

const proposalStore = new Map<string, ProposalCardData>();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerProposalHandlers(): void {
  // Initialize the proposal generator with the current execution engine
  try {
    resetProposalGenerator(getExecutionEngine());
  } catch (e) {
    console.warn('[IPC/Proposal] Could not initialize ProposalGenerator yet:', e);
  }

  // ── proposal:generateFromResponse ────────────────────────────────────
  ipcMain.handle(
    'proposal:generateFromResponse',
    async (
      _event,
      response: string,
      context?: { workspaceRoot?: string; projectId?: string }
    ) => {
      try {
        const generator = getProposalGenerator(getExecutionEngine());
        const intents = generator.parseLLMResponse(response, context);

        if (intents.length === 0) {
          return ok({ intents: [], proposals: [] });
        }

        // Generate proposals for each intent
        const proposals: ProposalCardData[] = [];
        for (const intent of intents) {
          const { plan, proposalCard } = generator.generateProposalFromIntent(intent);
          proposalCard.planId = plan.id;
          proposalStore.set(proposalCard.id, proposalCard);
          proposals.push(proposalCard);
        }

        // Notify all windows about new proposals
        broadcastProposalUpdate('created', proposals.map((p) => p.id));

        return ok({ intents, proposals });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── proposal:approveAndExecute ───────────────────────────────────────
  ipcMain.handle('proposal:approveAndExecute', async (_event, planId: string) => {
    try {
      const engine = getExecutionEngine();
      const plan = engine.approvePlan(planId);

      // Update proposal status in store
      for (const [, proposal] of proposalStore) {
        if (proposal.planId === planId) {
          proposal.status = 'approved';
        }
      }

      // Notify windows
      broadcastProposalUpdate('approved', [planId]);

      // Execute the plan (async — don't wait for full completion)
      engine.executePlan(planId).then((executedPlan) => {
        // Update proposal status based on execution result
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) {
            proposal.status =
              executedPlan.status === 'completed'
                ? 'completed'
                : executedPlan.status === 'failed'
                ? 'failed'
                : 'executing';
          }
        }
        broadcastProposalUpdate(
          executedPlan.status === 'completed' ? 'completed' : 'failed',
          [planId]
        );
      }).catch((execError) => {
        console.error('[IPC/Proposal] Execution failed:', execError);
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) {
            proposal.status = 'failed';
          }
        }
        broadcastProposalUpdate('failed', [planId]);
      });

      return ok({ plan });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── proposal:reject ──────────────────────────────────────────────────
  ipcMain.handle(
    'proposal:reject',
    async (_event, planId: string, reason?: string) => {
      try {
        // Update proposal status
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) {
            proposal.status = 'rejected';
            if (reason) {
              proposal.details.rejectionReason = reason;
            }
          }
        }

        // Also cancel the plan in the execution engine if it's still draft
        const engine = getExecutionEngine();
        const plan = engine.getPlan(planId);
        if (plan && plan.status === 'draft') {
          engine.cancelPlan(planId);
        }

        broadcastProposalUpdate('rejected', [planId]);
        return ok({ planId, rejected: true });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── proposal:modify ──────────────────────────────────────────────────
  ipcMain.handle(
    'proposal:modify',
    async (
      _event,
      planId: string,
      modifications: {
        title?: string;
        description?: string;
        stepUpdates?: Array<{
          stepIndex: number;
          updates: Partial<{
            title: string;
            description: string;
            params: Record<string, unknown>;
            riskLevel: 'low' | 'medium' | 'high';
          }>;
        }>;
      }
    ) => {
      try {
        const engine = getExecutionEngine();
        const plan = engine.getPlan(planId);
        if (!plan) {
          return err(`Plan not found: ${planId}`);
        }

        if (plan.status !== 'draft') {
          return err(`Can only modify draft proposals — current status: "${plan.status}"`);
        }

        // Apply step modifications
        if (modifications.stepUpdates) {
          for (const stepUpdate of modifications.stepUpdates) {
            const step = plan.steps[stepUpdate.stepIndex];
            if (!step) continue;

            const update = stepUpdate.updates;
            if (update.title) step.title = update.title;
            if (update.description) step.description = update.description;
            if (update.params) {
              step.params = { ...step.params, ...update.params };
            }
            if (update.riskLevel) step.riskLevel = update.riskLevel;
          }
        }

        // Update plan metadata
        plan.updatedAt = Date.now();

        // Update proposal card in store
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) {
            if (modifications.title) proposal.title = modifications.title;
            if (modifications.description) proposal.description = modifications.description;
          }
        }

        broadcastProposalUpdate('modified', [planId]);
        return ok({ plan });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── proposal:list ────────────────────────────────────────────────────
  ipcMain.handle('proposal:list', async () => {
    try {
      const proposals = Array.from(proposalStore.values());
      // Return pending proposals first, then by timestamp
      const sorted = proposals.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return b.timestamp - a.timestamp;
      });
      return ok({ proposals: sorted, total: sorted.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── proposal:get ─────────────────────────────────────────────────────
  ipcMain.handle('proposal:get', async (_event, proposalId: string) => {
    try {
      const proposal = proposalStore.get(proposalId);
      if (!proposal) {
        return err(`Proposal not found: ${proposalId}`);
      }
      return ok({ proposal });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Proposal handlers registered');
}

// ─── Broadcast Updates to Renderer ──────────────────────────────────────────

function broadcastProposalUpdate(
  event: string,
  planIds: string[]
): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('proposal:updated', {
          event,
          planIds,
          timestamp: Date.now(),
        });
      }
    }
  } catch {
    // Window might be closed
  }
}
