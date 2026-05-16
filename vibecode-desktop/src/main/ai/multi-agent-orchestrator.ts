// ============================================================
// VibeCode Desktop — ARC 22: Multi-Agent Orchestrator Core
// Central orchestration runtime: agent registry, capabilities
// map, shared execution bus, task delegation engine,
// inter-agent communication coordination
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  AgentRole,
  AgentStatus,
  AgentTask,
  AgentTaskStatus,
  AgentAction,
  AgentIdentity,
  AgentCapabilities,
  AgentDashboardState,
  AgentDashboardEntry,
  AutonomyLevel,
  OrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG,
  DashboardMetrics,
  OrganizationGoal,
  Proposal,
} from './types';
import { BaseAgent } from './agents/base-agent';
import { AgentCommunicationBus } from './agent-communication-bus';
import { SharedContextGraph } from './shared-context-graph';
import { AgentVotingEngine } from './agent-voting-engine';
import { ParallelExecutionEngine } from './parallel-execution-engine';
import { ExecutionEngine } from '../services/execution-engine';
import { ProviderManager } from '../services/provider-manager';
import { MemoryStore } from '../services/memory-store';
import { EventEmitter } from 'events';

// ─── Event Types ────────────────────────────────────────────────────────────

export type OrchestratorEventType =
  | 'agent:spawned'
  | 'agent:retired'
  | 'task:queued'
  | 'task:delegated'
  | 'task:completed'
  | 'task:failed'
  | 'autonomy:changed'
  | 'orchestrator:started'
  | 'orchestrator:stopped'
  | 'cycle:complete';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  data?: unknown;
}

// ─── Task Queue Entry ───────────────────────────────────────────────────────

interface TaskQueueEntry {
  task: AgentTask;
  enqueuedAt: number;
  priority: number;
  assignedAgent?: AgentRole;
}

// ─── Multi-Agent Orchestrator ───────────────────────────────────────────────

export class MultiAgentOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private taskQueue: TaskQueueEntry[] = [];
  private activeTasks: Map<string, AgentTask> = new Map();
  private completedTasks: Map<string, AgentTask> = new Map();
  private communicationBus: AgentCommunicationBus;
  private contextGraph: SharedContextGraph;
  private votingEngine: AgentVotingEngine;
  private parallelEngine: ParallelExecutionEngine;
  private executionEngine: ExecutionEngine;
  private providerManager: ProviderManager;
  private memoryStore: MemoryStore;
  private autonomyLevel: AutonomyLevel;
  private handlers: ((event: OrchestratorEvent) => void)[] = [];
  private cycleTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(
    executionEngine: ExecutionEngine,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
    config?: Partial<OrchestratorConfig>,
  ) {
    super();
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.executionEngine = executionEngine;
    this.providerManager = providerManager;
    this.memoryStore = memoryStore;
    this.autonomyLevel = this.config.defaultAutonomyLevel;

    // Initialize subsystems
    this.communicationBus = new AgentCommunicationBus();
    this.contextGraph = new SharedContextGraph();
    this.votingEngine = new AgentVotingEngine(this.communicationBus, this.autonomyLevel);
    this.parallelEngine = new ParallelExecutionEngine(executionEngine, this.config.maxConcurrentTasks);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Start the orchestrator — spawns all agents and begins the reasoning loop.
   */
  async start(): Promise<void> {
    if (this.running) return;

    console.log('[MultiAgentOrchestrator] Starting orchestration system...');

    // Spawn all 6 specialized agents
    this.spawnAllAgents();

    // Start the main orchestration cycle
    this.running = true;
    this.startCycleTimer();
    this.startIdleReasoningTimer();

    // Subscribe to communication bus events
    this.communicationBus.onBusEvent(event => {
      this.handleCommunicationEvent(event);
    });

    // Subscribe to voting events
    this.votingEngine.onVotingEvent(event => {
      this.handleVotingEvent(event);
    });

    this.emitOrchestratorEvent('orchestrator:started');
    console.log('[MultiAgentOrchestrator] Orchestration system started with', this.agents.size, 'agents');
  }

  /**
   * Stop the orchestrator gracefully.
   */
  stop(): void {
    if (!this.running) return;

    console.log('[MultiAgentOrchestrator] Stopping orchestration system...');

    this.running = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }

    // Dispose all agents
    for (const agent of this.agents.values()) {
      agent.dispose();
    }

    this.emitOrchestratorEvent('orchestrator:stopped');
  }

  // ─── Agent Management ─────────────────────────────────────────────────

  /**
   * Spawn a specific agent by role.
   */
  async spawnAgent(role: AgentRole): Promise<BaseAgent> {
    if (this.agents.has(role)) {
      throw new Error(`Agent ${role} already spawned`);
    }

    const agent = this.createAgentByRole(role);
    this.agents.set(role, agent);

    // Subscribe to agent events
    agent.onAgentEvent(event => {
      this.handleAgentEvent(event);
    });

    // Subscribe agent to relevant context updates
    this.contextGraph.subscribe(role, {
      sources: ['workspace', 'user'],
      minImportance: 0.3,
    }, entries => {
      for (const entry of entries) {
        agent.addObservation({
          id: entry.id,
          type: 'pattern_found',
          source: entry.source,
          content: entry.content,
          severity: entry.importance > 0.8 ? 'critical' : entry.importance > 0.5 ? 'warning' : 'info',
          timestamp: entry.timestamp,
          agentId: role,
        });
      }
    });

    this.emitOrchestratorEvent('agent:spawned', { role, agentId: agent.getIdentity().id });
    console.log(`[MultiAgentOrchestrator] Spawned ${role} agent: ${agent.getIdentity().name}`);

    return agent;
  }

  /**
   * Retire (remove) a specific agent.
   */
  retireAgent(role: AgentRole): boolean {
    const agent = this.agents.get(role);
    if (!agent) return false;

    agent.dispose();
    this.agents.delete(role);
    this.emitOrchestratorEvent('agent:retired', { role });
    return true;
  }

  /**
   * Get an agent by role.
   */
  getAgent(role: AgentRole): BaseAgent | null {
    return this.agents.get(role) ?? null;
  }

  /**
   * Get all active agents.
   */
  getActiveAgents(): BaseAgent[] {
    return Array.from(this.agents.values()).filter(a => a.getStatus() !== 'suspended');
  }

  /**
   * Get all spawned agent identities.
   */
  getAgentIdentities(): AgentIdentity[] {
    return Array.from(this.agents.values()).map(a => a.getIdentity());
  }

  // ─── Task Management ──────────────────────────────────────────────────

  /**
   * Submit a new task to the orchestrator.
   * The task will be queued and delegated to the most appropriate agent.
   */
  submitTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'status' | 'assignedTo'>): AgentTask {
    const fullTask: AgentTask = {
      ...task,
      id: uuidv4(),
      assignedTo: 'architect' as AgentRole, // placeholder, will be assigned
      status: 'queued',
      createdAt: Date.now(),
    };

    // Find the best agent for this task
    const bestAgent = this.findBestAgent(fullTask);
    fullTask.assignedTo = bestAgent;

    // Add to priority queue
    const entry: TaskQueueEntry = {
      task: fullTask,
      enqueuedAt: Date.now(),
      priority: fullTask.priority,
      assignedAgent: bestAgent,
    };

    this.taskQueue.push(entry);
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    this.emitOrchestratorEvent('task:queued', { task: fullTask, bestAgent });

    // Try to assign immediately
    this.tryAssignTasks();

    return fullTask;
  }

  /**
   * Delegate a task to a specific agent.
   */
  async delegateTask(taskId: string, targetAgent: AgentRole): Promise<AgentTask | null> {
    const agent = this.agents.get(targetAgent);
    if (!agent) return null;

    // Find the task
    let task: AgentTask | null = null;
    for (const entry of this.taskQueue) {
      if (entry.task.id === taskId) {
        task = entry.task;
        break;
      }
    }
    if (!task) {
      task = this.activeTasks.get(taskId) ?? null;
    }
    if (!task) return null;

    task.assignedTo = targetAgent;
    task.status = 'assigned';

    this.emitOrchestratorEvent('task:delegated', { taskId, targetAgent });

    // If agent is idle, assign immediately
    if (agent.getStatus() === 'idle') {
      return this.executeTaskWithAgent(task, agent);
    }

    return task;
  }

  /**
   * Get all pending tasks in the queue.
   */
  getPendingTasks(): AgentTask[] {
    return this.taskQueue.map(e => e.task);
  }

  /**
   * Get all active tasks.
   */
  getActiveTasksList(): AgentTask[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Get a specific task by ID.
   */
  getTask(taskId: string): AgentTask | null {
    // Check active, then completed, then queue
    return this.activeTasks.get(taskId) ??
           this.completedTasks.get(taskId) ??
           this.taskQueue.find(e => e.task.id === taskId)?.task ??
           null;
  }

  // ─── Autonomy Control ─────────────────────────────────────────────────

  setAutonomyLevel(level: AutonomyLevel): void {
    this.autonomyLevel = level;
    this.votingEngine.setAutonomyLevel(level);

    // Update all agents
    for (const agent of this.agents.values()) {
      agent.setAutonomyLevel(level);
    }

    this.emitOrchestratorEvent('autonomy:changed', { level });
  }

  getAutonomyLevel(): AutonomyLevel {
    return this.autonomyLevel;
  }

  // ─── Subsystem Access ────────────────────────────────────────────────

  getCommunicationBus(): AgentCommunicationBus {
    return this.communicationBus;
  }

  getContextGraph(): SharedContextGraph {
    return this.contextGraph;
  }

  getVotingEngine(): AgentVotingEngine {
    return this.votingEngine;
  }

  getParallelEngine(): ParallelExecutionEngine {
    return this.parallelEngine;
  }

  // ─── Dashboard State ─────────────────────────────────────────────────

  /**
   * Get the complete dashboard state for the renderer.
   */
  getDashboardState(): AgentDashboardState {
    const agentEntries: AgentDashboardEntry[] = Array.from(this.agents.values()).map(agent => ({
      identity: agent.getIdentity(),
      status: agent.getStatus(),
      currentTask: agent.getCurrentTask(),
      recentActions: [], // populated from action tracking
      confidence: 0.7, // default
      lastActivity: agent.getStats().lastReasoningCycle,
    }));

    const recentMessages = this.communicationBus.getRecentMessages(20);
    const activeProposals = this.votingEngine.getActiveProposals();

    return {
      agents: agentEntries,
      activeTasks: this.getActiveTasksList(),
      activeProposals,
      recentMessages,
      activeGoals: [], // populated by autonomous organization
      systemMetrics: this.computeMetrics(),
      autonomyLevel: this.autonomyLevel,
    };
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  getStats(): {
    running: boolean;
    agentCount: number;
    activeTaskCount: number;
    queuedTaskCount: number;
    completedTaskCount: number;
    autonomyLevel: AutonomyLevel;
    communicationStats: ReturnType<AgentCommunicationBus['getStats']>;
    contextStats: ReturnType<SharedContextGraph['getStats']>;
    votingStats: ReturnType<AgentVotingEngine['getStats']>;
    parallelStats: ReturnType<ParallelExecutionEngine['getStats']>;
  } {
    return {
      running: this.running,
      agentCount: this.agents.size,
      activeTaskCount: this.activeTasks.size,
      queuedTaskCount: this.taskQueue.length,
      completedTaskCount: this.completedTasks.size,
      autonomyLevel: this.autonomyLevel,
      communicationStats: this.communicationBus.getStats(),
      contextStats: this.contextGraph.getStats(),
      votingStats: this.votingEngine.getStats(),
      parallelStats: this.parallelEngine.getStats(),
    };
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onOrchestratorEvent(handler: (event: OrchestratorEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  // ─── Private: Agent Creation ──────────────────────────────────────────

  private spawnAllAgents(): void {
    const roles: AgentRole[] = ['architect', 'debug', 'research', 'security', 'performance', 'product'];
    for (const role of roles) {
      this.spawnAgent(role).catch(err => {
        console.error(`[MultiAgentOrchestrator] Failed to spawn ${role}:`, err);
      });
    }
  }

  private createAgentByRole(role: AgentRole): BaseAgent {
    // Dynamic import pattern — we create agents via their factory functions
    // This is done synchronously to keep the API simple
    const commonDeps = {
      bus: this.communicationBus,
      contextGraph: this.contextGraph,
      providerManager: this.providerManager,
      memoryStore: this.memoryStore,
    };

    switch (role) {
      case 'architect': {
        const { createArchitectAgent } = require('./agents/architect-agent');
        return createArchitectAgent(commonDeps.bus, commonDeps.contextGraph, commonDeps.providerManager, commonDeps.memoryStore);
      }
      case 'debug': {
        const { createDebugAgent } = require('./agents/debug-agent');
        return createDebugAgent(commonDeps.bus, commonDeps.contextGraph, commonDeps.providerManager, commonDeps.memoryStore);
      }
      case 'research': {
        const { createResearchAgent } = require('./agents/research-agent');
        return createResearchAgent(commonDeps.bus, commonDeps.contextGraph, commonDeps.providerManager, commonDeps.memoryStore);
      }
      case 'security': {
        const { createSecurityAgent } = require('./agents/security-agent');
        return createSecurityAgent(commonDeps.bus, commonDeps.contextGraph, commonDeps.providerManager, commonDeps.memoryStore);
      }
      case 'performance': {
        const { createPerformanceAgent } = require('./agents/performance-agent');
        return createPerformanceAgent(commonDeps.bus, commonDeps.contextGraph, commonDeps.providerManager, commonDeps.memoryStore);
      }
      case 'product': {
        const { createProductAgent } = require('./agents/product-agent');
        return createProductAgent(commonDeps.bus, commonDeps.contextGraph, commonDeps.providerManager, commonDeps.memoryStore);
      }
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
  }

  // ─── Private: Task Delegation ─────────────────────────────────────────

  private findBestAgent(task: AgentTask): AgentRole {
    let bestRole: AgentRole = 'architect'; // default
    let bestScore = -1;

    for (const [role, agent] of this.agents) {
      if (agent.getStatus() !== 'idle') continue;
      const score = agent.scoreTaskRelevance(task);
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    }

    // If no idle agent scores well, assign to the best matching agent anyway
    if (bestScore < 0.3) {
      for (const [role, agent] of this.agents) {
        const score = agent.scoreTaskRelevance(task);
        if (score > bestScore) {
          bestScore = score;
          bestRole = role;
        }
      }
    }

    return bestRole;
  }

  private tryAssignTasks(): void {
    // Try to assign queued tasks to idle agents
    const unassigned = this.taskQueue.filter(e => !this.activeTasks.has(e.task.id));
    for (const entry of unassigned) {
      const agent = this.agents.get(entry.assignedAgent!);
      if (agent && agent.getStatus() === 'idle') {
        this.executeTaskWithAgent(entry.task, agent);
        // Remove from queue
        const idx = this.taskQueue.indexOf(entry);
        if (idx >= 0) this.taskQueue.splice(idx, 1);
      }
    }
  }

  private async executeTaskWithAgent(task: AgentTask, agent: BaseAgent): Promise<AgentTask> {
    task.status = 'in_progress';
    task.startedAt = Date.now();
    this.activeTasks.set(task.id, task);

    try {
      const result = await agent.assignTask(task);

      if (result.status === 'completed') {
        this.activeTasks.delete(task.id);
        this.completedTasks.set(task.id, result);
        this.emitOrchestratorEvent('task:completed', { task: result });
      } else if (result.status === 'failed') {
        this.activeTasks.delete(task.id);
        this.completedTasks.set(task.id, result);
        this.emitOrchestratorEvent('task:failed', { task: result });

        // If failed due to wrong agent, try re-delegation
        if (result.result?.summary?.includes('wrong agent')) {
          this.redelegateTask(task);
        }
      }

      // Try to assign next tasks
      this.tryAssignTasks();

      return result;
    } catch (err) {
      task.status = 'failed';
      this.activeTasks.delete(task.id);
      this.completedTasks.set(task.id, task);
      this.emitOrchestratorEvent('task:failed', { task, error: err instanceof Error ? err.message : String(err) });
      this.tryAssignTasks();
      return task;
    }
  }

  private redelegateTask(originalTask: AgentTask): void {
    // Find second-best agent
    let bestRole: AgentRole | null = null;
    let bestScore = -1;

    for (const [role, agent] of this.agents) {
      if (role === originalTask.assignedTo) continue;
      const score = agent.scoreTaskRelevance(originalTask);
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    }

    if (bestRole && bestScore > 0.2) {
      const newTask: AgentTask = {
        ...originalTask,
        id: uuidv4(),
        assignedTo: bestRole,
        status: 'queued',
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
      };
      this.submitTask(newTask);
    }
  }

  // ─── Private: Reasoning Cycle ─────────────────────────────────────────

  private startCycleTimer(): void {
    this.cycleTimer = setInterval(() => {
      this.runCycle();
    }, this.config.goalCheckIntervalMs);
    if (this.cycleTimer?.unref) this.cycleTimer.unref();
  }

  private startIdleReasoningTimer(): void {
    this.idleTimer = setInterval(() => {
      this.runIdleReasoning();
    }, this.config.idleReasoningIntervalMs);
    if (this.idleTimer?.unref) this.idleTimer.unref();
  }

  private async runCycle(): Promise<void> {
    // Check for expired tasks
    const now = Date.now();
    for (const [id, task] of this.activeTasks) {
      if (task.startedAt && (now - task.startedAt) > 5 * 60 * 1000) { // 5 min timeout
        task.status = 'failed';
        this.activeTasks.delete(id);
        this.completedTasks.set(id, task);
      }
    }

    // Try to assign queued tasks
    this.tryAssignTasks();

    this.emitOrchestratorEvent('cycle:complete');
  }

  private async runIdleReasoning(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.getStatus() === 'idle') {
        try {
          await agent.idleReasoning();
        } catch (err) {
          console.error(`[MultiAgentOrchestrator] Idle reasoning failed for ${agent.getIdentity().role}:`, err);
        }
      }
    }
  }

  // ─── Private: Event Routing ───────────────────────────────────────────

  private handleAgentEvent(event: any): void {
    // Route agent events to appropriate subsystems
    if (event.type === 'action:proposed') {
      const action = event.data?.action as AgentAction | undefined;
      if (action && action.riskLevel === 'high') {
        // High-risk actions go through voting
        this.votingEngine.createProposal(
          `Action: ${action.description}`,
          action.reasoning,
          action.agentId as AgentRole,
          [action],
          action.riskLevel,
        );
      }
    }
  }

  private handleCommunicationEvent(event: any): void {
    // Route communication events to context graph
    if (event.type === 'message:sent') {
      // Could add to context graph for transparency
    }
  }

  private handleVotingEvent(event: any): void {
    // Handle proposal outcomes
    if (event.type === 'consensus:reached') {
      // Execute the approved proposal
    } else if (event.type === 'proposal:rejected') {
      // Notify the proposing agent
    }
  }

  private computeMetrics(): DashboardMetrics {
    const agentCount = this.agents.size;
    const activeAgents = Array.from(this.agents.values()).filter(a => a.getStatus() !== 'idle' && a.getStatus() !== 'suspended').length;

    return {
      totalAgents: agentCount,
      activeAgents,
      pendingTasks: this.taskQueue.length,
      activeProposals: this.votingEngine.getActiveProposals().length,
      avgConfidence: 0.7, // computed from agent stats
      executionSuccessRate: this.completedTasks.size > 0
        ? Array.from(this.completedTasks.values()).filter(t => t.status === 'completed').length / this.completedTasks.size
        : 1,
      decisionsPerMinute: 0, // tracked over time
      messagesPerMinute: 0, // tracked over time
    };
  }

  private emitOrchestratorEvent(type: OrchestratorEventType, data?: unknown): void {
    const event: OrchestratorEvent = { type, timestamp: Date.now(), data };
    for (const handler of this.handlers) {
      try { handler(event); } catch (err) { console.error('[MultiAgentOrchestrator] Event handler error:', err); }
    }
    this.emit(type, event);
  }

  dispose(): void {
    this.stop();
    this.communicationBus.dispose();
    this.contextGraph.dispose();
    this.votingEngine.dispose();
    this.parallelEngine.dispose();
    this.handlers = [];
    this.agents.clear();
    this.taskQueue = [];
    this.activeTasks.clear();
    this.completedTasks.clear();
    this.removeAllListeners();
  }
}
