// ============================================================
// VibeCode Desktop — ARC 22: Agent IPC Handlers
// IPC bridge between renderer and multi-agent system
// ============================================================

import { ipcMain, BrowserWindow } from 'electron';
import { MultiAgentOrchestrator } from '../ai/multi-agent-orchestrator';
import { AutonomousOrganization } from '../ai/autonomous-organization';
import {
  AgentRole,
  AutonomyLevel,
  AgentTask,
  Proposal,
  OrganizationGoal,
  AgentDashboardState,
} from '../ai/types';

// ─── Module State ───────────────────────────────────────────────────────────

let orchestrator: MultiAgentOrchestrator | null = null;
let organization: AutonomousOrganization | null = null;
let mainWindow: BrowserWindow | null = null;

// ─── Forward Events to Renderer ─────────────────────────────────────────────

function forwardToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ─── Initialize ─────────────────────────────────────────────────────────────

export function initializeAgentSystem(orch: MultiAgentOrchestrator, org: AutonomousOrganization): void {
  orchestrator = orch;
  organization = org;

  // Subscribe to orchestrator events → forward to renderer
  orchestrator.onOrchestratorEvent(event => {
    forwardToRenderer('agent:orchestrator:event', event);
  });

  // Subscribe to communication bus events → forward to renderer
  orchestrator.getCommunicationBus().onBusEvent(event => {
    forwardToRenderer('agent:communication:event', event);
  });

  // Subscribe to voting events → forward to renderer
  orchestrator.getVotingEngine().onVotingEvent(event => {
    forwardToRenderer('agent:voting:event', event);
  });

  // Subscribe to organization events → forward to renderer
  organization.onOrganizationEvent(event => {
    forwardToRenderer('agent:organization:event', event);
  });

  // Subscribe to context graph events
  orchestrator.getContextGraph().onGraphEvent(event => {
    forwardToRenderer('agent:context:event', event);
  });

  // Subscribe to parallel engine events
  orchestrator.getParallelEngine().onParallelEvent(event => {
    forwardToRenderer('agent:parallel:event', event);
  });
}

export function setAgentMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

// ─── Register All Agent IPC Handlers ────────────────────────────────────────

export function registerAgentHandlers(): void {
  console.log('[IPC] Registering agent system handlers...');

  // ── Orchestrator Control ──────────────────────────────────────────────

  ipcMain.handle('agent:start', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    try {
      await orchestrator.start();
      return { success: true, data: { agentCount: orchestrator.getStats().agentCount } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('agent:stop', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    orchestrator.stop();
    return { success: true };
  });

  ipcMain.handle('agent:getStatus', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: orchestrator.getStats() };
  });

  // ── Agent Management ──────────────────────────────────────────────────

  ipcMain.handle('agent:spawn', async (_event, role: AgentRole) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    try {
      const agent = await orchestrator.spawnAgent(role);
      return { success: true, data: { identity: agent.getIdentity(), capabilities: agent.getCapabilities() } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('agent:retire', async (_event, role: AgentRole) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const success = orchestrator.retireAgent(role);
    return { success, data: { role, retired: success } };
  });

  ipcMain.handle('agent:list', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const identities = orchestrator.getAgentIdentities();
    const agents = orchestrator.getActiveAgents().map(a => ({
      identity: a.getIdentity(),
      status: a.getStatus(),
      currentTask: a.getCurrentTask()?.id ?? null,
      stats: a.getStats(),
    }));
    return { success: true, data: { identities, agents, total: agents.length } };
  });

  ipcMain.handle('agent:getStats', async (_event, role: AgentRole) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const agent = orchestrator.getAgent(role);
    if (!agent) return { success: false, error: `Agent ${role} not found` };
    return { success: true, data: agent.getStats() };
  });

  // ── Task Management ───────────────────────────────────────────────────

  ipcMain.handle('agent:submitTask', async (_event, task: Omit<AgentTask, 'id' | 'createdAt' | 'status' | 'assignedTo'>) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    try {
      const result = orchestrator.submitTask(task);
      return { success: true, data: { task: result } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('agent:delegateTask', async (_event, taskId: string, targetAgent: AgentRole) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    try {
      const result = await orchestrator.delegateTask(taskId, targetAgent);
      return { success: true, data: { task: result } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('agent:getTask', async (_event, taskId: string) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const task = orchestrator.getTask(taskId);
    return { success: true, data: { task } };
  });

  ipcMain.handle('agent:listTasks', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const pending = orchestrator.getPendingTasks();
    const active = orchestrator.getActiveTasksList();
    return { success: true, data: { pending, active, totalPending: pending.length, totalActive: active.length } };
  });

  // ── Autonomy Control ──────────────────────────────────────────────────

  ipcMain.handle('agent:setAutonomy', async (_event, level: AutonomyLevel) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    orchestrator.setAutonomyLevel(level);
    return { success: true, data: { level } };
  });

  ipcMain.handle('agent:getAutonomy', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: { level: orchestrator.getAutonomyLevel() } };
  });

  // ── Voting ────────────────────────────────────────────────────────────

  ipcMain.handle('agent:vote', async (_event, proposalId: string, agentRole: AgentRole, vote: 'approve' | 'reject' | 'abstain', reasoning: string, confidence: number) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    try {
      const result = orchestrator.getVotingEngine().castVote(proposalId, agentRole, vote, reasoning, confidence);
      return { success: true, data: { proposal: result } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('agent:getProposals', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const proposals = orchestrator.getVotingEngine().getActiveProposals();
    return { success: true, data: { proposals, total: proposals.length } };
  });

  ipcMain.handle('agent:getProposal', async (_event, proposalId: string) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const proposal = orchestrator.getVotingEngine().getProposal(proposalId);
    return { success: true, data: { proposal } };
  });

  ipcMain.handle('agent:getVotingStats', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: orchestrator.getVotingEngine().getStats() };
  });

  // ── Context Graph ─────────────────────────────────────────────────────

  ipcMain.handle('agent:getContextStats', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: orchestrator.getContextGraph().getStats() };
  });

  ipcMain.handle('agent:queryContext', async (_event, query: string, limit?: number) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const results = orchestrator.getContextGraph().getRelevantContext(query, limit);
    return { success: true, data: { results, total: results.length } };
  });

  // ── Communication ─────────────────────────────────────────────────────

  ipcMain.handle('agent:getRecentMessages', async (_event, limit?: number) => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const messages = orchestrator.getCommunicationBus().getRecentMessages(limit);
    return { success: true, data: { messages, total: messages.length } };
  });

  ipcMain.handle('agent:getCommStats', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: orchestrator.getCommunicationBus().getStats() };
  });

  // ── Parallel Execution ────────────────────────────────────────────────

  ipcMain.handle('agent:getParallelStats', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: orchestrator.getParallelEngine().getStats() };
  });

  ipcMain.handle('agent:getLocks', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    return { success: true, data: { locks: orchestrator.getParallelEngine().getAllLocks() } };
  });

  // ── Organization ──────────────────────────────────────────────────────

  ipcMain.handle('agent:createGoal', async (_event, title: string, description: string, type: OrganizationGoal['type'], priority?: number) => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const goal = organization.createGoal(title, description, type, priority);
    return { success: true, data: { goal } };
  });

  ipcMain.handle('agent:getGoals', async () => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const active = organization.getActiveGoals();
    return { success: true, data: { goals: active, total: active.length } };
  });

  ipcMain.handle('agent:getGoal', async (_event, goalId: string) => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const goal = organization.getGoal(goalId);
    return { success: true, data: { goal } };
  });

  ipcMain.handle('agent:decomposeGoal', async (_event, goalId: string) => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const result = organization.decomposeGoal(goalId);
    return { success: true, data: result };
  });

  ipcMain.handle('agent:completeGoal', async (_event, goalId: string) => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const goal = organization.completeGoal(goalId);
    return { success: true, data: { goal } };
  });

  ipcMain.handle('agent:abandonGoal', async (_event, goalId: string, reason: string) => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const goal = organization.abandonGoal(goalId, reason);
    return { success: true, data: { goal } };
  });

  ipcMain.handle('agent:getLessons', async (_event, limit?: number) => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    const lessons = organization.getLessonsLearned(limit);
    return { success: true, data: { lessons, total: lessons.length } };
  });

  ipcMain.handle('agent:getOrgStats', async () => {
    if (!organization) return { success: false, error: 'Organization not initialized' };
    return { success: true, data: organization.getStats() };
  });

  // ── Dashboard ─────────────────────────────────────────────────────────

  ipcMain.handle('agent:getDashboard', async () => {
    if (!orchestrator) return { success: false, error: 'Orchestrator not initialized' };
    const state = orchestrator.getDashboardState();
    if (organization) {
      state.activeGoals = organization.getActiveGoals();
    }
    return { success: true, data: state };
  });

  console.log('[IPC] Agent system handlers registered (35 channels)');
}
