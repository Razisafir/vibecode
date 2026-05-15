// ============================================================
// VibeCode Desktop — Proposal IPC Handlers
// Wires the proposal generator to the IPC layer
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import {
  getProposalGenerator,
  resetProposalGenerator,
  ProposalCardData,
} from '../services/proposal-generator';
import { getStateMachine } from './state-machine-handlers';
import { validateWithError } from '../utils/validation';
import { ProposalModificationSchema, IdSchema } from '../utils/schemas';
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

// ─── In-memory proposal store ───────────────────────────────────────────────

const proposalStore = new Map<string, ProposalCardData>();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerProposalHandlers(): void {
  // ARC 12: ProposalGenerator now uses ESM instead of legacy ExecutionEngine
  const sm = getStateMachine();
  if (sm) {
    try {
      resetProposalGenerator(null as any); // Will be refactored to use ESM directly
    } catch (e) {
      console.warn('[IPC/Proposal] Could not initialize ProposalGenerator:', e);
    }
  }

  // ── proposal:generateFromResponse ────────────────────────────────────
  ipcMain.handle(
    'proposal:generateFromResponse',
    async (_event, response: string, context?: { workspaceRoot?: string; projectId?: string }) => {
      try {
        if (!response || typeof response !== 'string') return err('Response is required and must be a string');
        if (response.length > 1000000) return err('Response exceeds maximum length of 1,000,000 characters');

        const sm = getStateMachine();
        if (!sm) return err('State machine not initialized');
        const generator = getProposalGenerator(null as any);
        const intents = generator.parseLLMResponse(response, context);
        if (intents.length === 0) return ok({ intents: [], proposals: [] });

        const proposals: ProposalCardData[] = [];
        for (const intent of intents) {
          const { plan, proposalCard } = generator.generateProposalFromIntent(intent);
          proposalCard.planId = plan.id;
          proposalStore.set(proposalCard.id, proposalCard);
          proposals.push(proposalCard);
        }
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
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);

      // ARC 12: Use ESM for plan approval and execution
      const sm = getStateMachine();
      if (!sm) return err('State machine not initialized');

      const planNode = sm.approvePlan(planId);
      for (const [, proposal] of proposalStore) {
        if (proposal.planId === planId) proposal.status = 'approved';
      }
      broadcastProposalUpdate('approved', [planId]);

      sm.executePlan(planId).then((executedNode) => {
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) {
            proposal.status = executedNode.state === 'completed' ? 'completed' : executedNode.state === 'failed' ? 'failed' : 'executing';
          }
        }
        broadcastProposalUpdate(executedNode.state === 'completed' ? 'completed' : 'failed', [planId]);
        auditLog.auditLog('proposal.execute', { planId, status: executedNode.state, stepCount: executedNode.childIds.length });
      }).catch(() => {
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) proposal.status = 'failed';
        }
        broadcastProposalUpdate('failed', [planId]);
      });

      return ok({ plan: { id: planNode.id, title: planNode.title, status: planNode.state } });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── proposal:reject ──────────────────────────────────────────────────
  ipcMain.handle('proposal:reject', async (_event, planId: string, reason?: string) => {
    try {
      const idV = validateWithError(IdSchema, planId);
      if (!idV.success) return err(idV.error!);

      for (const [, proposal] of proposalStore) {
        if (proposal.planId === planId) {
          proposal.status = 'rejected';
          if (reason) proposal.details.rejectionReason = reason;
        }
      }

      // ARC 12: Use ESM for plan cancellation
      const sm = getStateMachine();
      if (sm) {
        const node = sm.getNode(planId);
        if (node && node.state === 'planned') sm.cancelPlan(planId);
      }

      broadcastProposalUpdate('rejected', [planId]);
      return ok({ planId, rejected: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── proposal:modify ──────────────────────────────────────────────────
  ipcMain.handle(
    'proposal:modify',
    async (_event, planId: string, modifications: Record<string, unknown>) => {
      try {
        const idV = validateWithError(IdSchema, planId);
        if (!idV.success) return err(idV.error!);

        const modV = validateWithError(ProposalModificationSchema, modifications);
        if (!modV.success) return err(modV.error!);

        // ARC 12: Use ESM for plan modification
        const sm = getStateMachine();
        if (!sm) return err('State machine not initialized');
        const planNode = sm.getNode(planId);
        if (!planNode) return err(`Plan not found: ${planId}`);
        if (planNode.state !== 'planned') return err(`Can only modify draft proposals — current status: "${planNode.state}"`);

        if (modV.data!.stepUpdates) {
          const children = sm.getChildren(planId);
          for (const stepUpdate of modV.data!.stepUpdates!) {
            const stepNode = children[stepUpdate.stepIndex];
            if (!stepNode) continue;
            const update = stepUpdate.updates;
            if (update.title) stepNode.title = update.title;
            if (update.description) stepNode.description = update.description;
            if (update.params) {
              const stepData = stepNode.data as any;
              stepData.params = { ...stepData.params, ...update.params };
            }
            if (update.riskLevel) stepNode.riskLevel = update.riskLevel;
            stepNode.updatedAt = Date.now();
          }
        }

        planNode.updatedAt = Date.now();
        for (const [, proposal] of proposalStore) {
          if (proposal.planId === planId) {
            if (modV.data!.title) proposal.title = modV.data!.title!;
            if (modV.data!.description) proposal.description = modV.data!.description!;
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
      const idV = validateWithError(IdSchema, proposalId);
      if (!idV.success) return err(idV.error!);
      const proposal = proposalStore.get(proposalId);
      if (!proposal) return err(`Proposal not found: ${proposalId}`);
      return ok({ proposal });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Proposal handlers registered (with validation)');
}

// ─── Broadcast Updates to Renderer ──────────────────────────────────────────

function broadcastProposalUpdate(event: string, planIds: string[]): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('proposal:updated', { event, planIds, timestamp: Date.now() });
      }
    }
  } catch { /* Window might be closed */ }
}
