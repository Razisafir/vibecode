// ─── VibeCode Desktop — Continuous Agent Loop Engine ──────────────────────────
// ARC 21 P0-1: Real-Time Autonomy Layer
//
// The agent is no longer called. It is always running in the background,
// improving the system continuously within strict safety boundaries.
//
// This module implements a persistent background reasoning loop that:
//   - Runs independently of user input
//   - Continuously scans workspace state
//   - Detects improvement opportunities
//   - Suggests or triggers micro-actions
//   - Maintains a bounded compute budget
//
// Key features:
//   - Idle-time reasoning cycles
//   - Change detection hooks (file system + ESM graph)
//   - Opportunistic planning
//   - Throttled execution scheduling
//   - No infinite loops (strict safety budget)
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import type { ExecutionStateMachine, ExecutionNode } from './execution-state-machine';
import type { AgentRuntime, AgentLifecycleState } from './agent-runtime';
import type { WorkspaceContextService } from './workspace-context-service';
import type { SessionMemoryService } from './session-memory';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Loop engine configuration — bounds autonomous behavior */
export interface LoopEngineConfig {
  /** Minimum idle time (ms) before the agent starts reasoning */
  idleThreshold: number;
  /** Maximum time (ms) between reasoning cycles when active */
  activeCycleInterval: number;
  /** Maximum time (ms) between reasoning cycles when idle */
  idleCycleInterval: number;
  /** Maximum concurrent reasoning tasks */
  maxConcurrentTasks: number;
  /** Maximum compute budget per cycle (arbitrary units, 0-100) */
  maxComputeBudget: number;
  /** Whether autonomous execution is enabled */
  autonomousMode: AutonomousMode;
  /** Maximum actions per hour (rate limit) */
  maxActionsPerHour: number;
  /** Cooldown after an autonomous action (ms) */
  actionCooldown: number;
  /** Whether to log detailed reasoning traces */
  verboseLogging: boolean;
}

/** Autonomy levels — controls how aggressively the agent acts */
export type AutonomousMode = 'observe' | 'suggest' | 'assist' | 'autonomous';

/** A reasoning cycle — one pass of the background loop */
export interface ReasoningCycle {
  /** Cycle ID */
  id: string;
  /** When this cycle started */
  startedAt: number;
  /** When this cycle ended */
  endedAt: number;
  /** What triggered this cycle */
  trigger: CycleTrigger;
  /** Observations made during this cycle */
  observations: Observation[];
  /** Actions decided during this cycle */
  decisions: Decision[];
  /** Compute budget consumed (0-100) */
  computeCost: number;
  /** Whether the cycle resulted in any action */
  hadAction: boolean;
}

/** What triggered a reasoning cycle */
export type CycleTrigger =
  | 'idle_timeout'       // No user activity for idleThreshold ms
  | 'file_change'        // File system change detected
  | 'graph_mutation'     // ESM graph was mutated
  | 'error_detected'     // Error in terminal or execution
  | 'user_idle_return'   // User returned from idle
  | 'scheduled'          // Scheduled periodic cycle
  | 'manual';            // Manually triggered

/** An observation made during a reasoning cycle */
export interface Observation {
  /** What was observed */
  type: 'file_changed' | 'error_present' | 'test_failing' | 'dependency_stale' |
        'unused_import' | 'code_duplication' | 'performance_issue' | 'incomplete_task' |
        'workspace_pattern' | 'graph_anomaly';
  /** Description */
  description: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Related data */
  data?: Record<string, unknown>;
  /** Severity (how important) */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

/** A decision made during a reasoning cycle */
export interface Decision {
  /** What to do */
  action: DecisionAction;
  /** Description of the proposed action */
  description: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Autonomy level required for this action */
  requiredAutonomy: AutonomousMode;
  /** Whether this action was executed */
  executed: boolean;
  /** Result if executed */
  result?: 'success' | 'failed' | 'skipped' | 'deferred';
  /** Reason if not executed */
  skipReason?: string;
  /** Related observation */
  observationIndex?: number;
}

/** Types of actions the loop can decide to take */
export type DecisionAction =
  | 'suggest_fix'           // Suggest a fix to the user
  | 'auto_fix'              // Automatically apply a fix
  | 'suggest_refactor'      // Suggest a refactoring
  | 'auto_refactor'         // Automatically refactor
  | 'suggest_test'          // Suggest writing a test
  | 'auto_install_dep'      // Install a missing dependency
  | 'suggest_next_step'     // Suggest what to do next
  | 'trigger_debug_loop'    // Start an autonomous debugging loop
  | 'compress_memory'       // Compress session memory
  | 'optimize_graph'        // Optimize the execution graph
  | 'update_context'        // Re-index workspace context
  | 'notify_user';          // Notify the user of something

/** Loop engine state */
export type LoopEngineState = 'stopped' | 'running' | 'paused' | 'throttled';

/** Loop engine metrics */
export interface LoopEngineMetrics {
  /** Total cycles completed */
  totalCycles: number;
  /** Total actions taken */
  totalActions: number;
  /** Actions by type */
  actionsByType: Record<string, number>;
  /** Average cycle duration (ms) */
  avgCycleDuration: number;
  /** Average compute cost per cycle */
  avgComputeCost: number;
  /** Actions in the last hour */
  actionsLastHour: number;
  /** Last cycle timestamp */
  lastCycleAt: number;
  /** Consecutive idle cycles */
  consecutiveIdleCycles: number;
  /** Uptime (ms) */
  uptime: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_LOOP_CONFIG: LoopEngineConfig = {
  idleThreshold: 30_000,       // 30 seconds
  activeCycleInterval: 5_000,  // 5 seconds when active
  idleCycleInterval: 60_000,   // 60 seconds when idle
  maxConcurrentTasks: 3,
  maxComputeBudget: 40,        // Conservative — 40/100 units per cycle
  autonomousMode: 'suggest',   // Default: observe and suggest only
  maxActionsPerHour: 30,
  actionCooldown: 10_000,      // 10 seconds between autonomous actions
  verboseLogging: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMOUS LOOP ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class AutonomousLoopEngine extends EventEmitter {
  private esm: ExecutionStateMachine;
  private agentRuntime: AgentRuntime | null = null;
  private workspaceContext: WorkspaceContextService | null = null;
  private sessionMemory: SessionMemoryService | null = null;

  private config: LoopEngineConfig;
  private state: LoopEngineState = 'stopped';
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentCycle: ReasoningCycle | null = null;

  /** History of completed cycles (last 100) */
  private cycleHistory: ReasoningCycle[] = [];
  private readonly MAX_CYCLE_HISTORY = 100;

  /** Track actions per hour for rate limiting */
  private actionTimestamps: number[] = [];

  /** Last time an autonomous action was taken */
  private lastActionAt: number = 0;

  /** Last user activity timestamp */
  private lastUserActivityAt: number = Date.now();

  /** Track pending observations that haven't been processed yet */
  private pendingObservations: Observation[] = [];

  /** Metrics */
  private metrics: LoopEngineMetrics = {
    totalCycles: 0,
    totalActions: 0,
    actionsByType: {},
    avgCycleDuration: 0,
    avgComputeCost: 0,
    actionsLastHour: 0,
    lastCycleAt: 0,
    consecutiveIdleCycles: 0,
    uptime: 0,
  };

  /** When the engine was started */
  private startedAt: number = 0;

  constructor(
    esm: ExecutionStateMachine,
    config?: Partial<LoopEngineConfig>,
  ) {
    super();
    this.esm = esm;
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
    this.setMaxListeners(50);
  }

  // ─── Initialization ────────────────────────────────────────────────────

  /** Inject ARC 20 dependencies */
  injectDependencies(deps: {
    agentRuntime?: AgentRuntime;
    workspaceContext?: WorkspaceContextService;
    sessionMemory?: SessionMemoryService;
  }): void {
    if (deps.agentRuntime) this.agentRuntime = deps.agentRuntime;
    if (deps.workspaceContext) this.workspaceContext = deps.workspaceContext;
    if (deps.sessionMemory) this.sessionMemory = deps.sessionMemory;
    logger.info('autonomous-loop', 'Dependencies injected');
  }

  // ─── Engine Control ────────────────────────────────────────────────────

  /** Start the autonomous loop */
  start(): void {
    if (this.state === 'running') return;

    this.state = 'running';
    this.startedAt = Date.now();
    this.scheduleNextCycle('scheduled');

    logger.info('autonomous-loop', `Loop engine started (mode: ${this.config.autonomousMode})`);
    this.emit('engine:started', { mode: this.config.autonomousMode });
  }

  /** Stop the autonomous loop */
  stop(): void {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }

    this.state = 'stopped';
    logger.info('autonomous-loop', 'Loop engine stopped');
    this.emit('engine:stopped');
  }

  /** Pause the loop (e.g., when user is actively typing) */
  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    logger.debug('autonomous-loop', 'Loop paused');
    this.emit('engine:paused');
  }

  /** Resume the loop after a pause */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.scheduleNextCycle('user_idle_return');
    logger.debug('autonomous-loop', 'Loop resumed');
    this.emit('engine:resumed');
  }

  /** Update configuration at runtime */
  updateConfig(updates: Partial<LoopEngineConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('autonomous-loop', `Config updated: ${JSON.stringify(Object.keys(updates))}`);
    this.emit('config:updated', this.config);
  }

  /** Get current config */
  getConfig(): LoopEngineConfig {
    return { ...this.config };
  }

  // ─── User Activity Tracking ────────────────────────────────────────────

  /** Notify the loop that the user is active (prevents idle reasoning) */
  notifyUserActivity(): void {
    this.lastUserActivityAt = Date.now();

    // If running in a mode that respects user activity, pause reasoning
    if (this.state === 'running' && this.pendingObservations.length === 0) {
      // Don't pause immediately — just update the activity timestamp
      // The cycle will check this before doing idle-based reasoning
    }
  }

  /** Notify the loop of a file system change */
  notifyFileChange(filePath: string, changeType: 'create' | 'modify' | 'delete'): void {
    this.pendingObservations.push({
      type: 'file_changed',
      description: `File ${changeType}d: ${filePath}`,
      confidence: 1.0,
      data: { filePath, changeType },
      severity: 'info',
    });

    // If idle, trigger an immediate cycle
    if (this.state === 'running' && this.isUserIdle()) {
      this.scheduleNextCycle('file_change', 1000); // 1s delay to batch changes
    }
  }

  /** Notify the loop of an error */
  notifyError(source: string, message: string, filePath?: string): void {
    this.pendingObservations.push({
      type: 'error_present',
      description: `Error in ${source}: ${message.slice(0, 200)}`,
      confidence: 0.9,
      data: { source, message, filePath },
      severity: 'high',
    });

    // Errors always trigger an immediate cycle
    if (this.state === 'running') {
      this.scheduleNextCycle('error_detected', 500);
    }
  }

  /** Notify the loop of an ESM graph mutation */
  notifyGraphMutation(nodeId: string, newState: string): void {
    this.pendingObservations.push({
      type: 'graph_anomaly',
      description: `Graph node ${nodeId.substring(0, 8)} transitioned to ${newState}`,
      confidence: 0.7,
      data: { nodeId, newState },
      severity: 'info',
    });
  }

  // ─── Cycle Execution ──────────────────────────────────────────────────

  /** Schedule the next reasoning cycle */
  private scheduleNextCycle(trigger: CycleTrigger, delayOverride?: number): void {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
    }

    const isIdle = this.isUserIdle();
    const baseInterval = isIdle ? this.config.idleCycleInterval : this.config.activeCycleInterval;
    const delay = delayOverride ?? baseInterval;

    this.cycleTimer = setTimeout(() => {
      this.executeCycle(trigger).catch(err => {
        logger.error('autonomous-loop', `Cycle error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, delay);
  }

  /** Execute one reasoning cycle */
  private async executeCycle(trigger: CycleTrigger): Promise<void> {
    if (this.state !== 'running') return;

    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cycleStart = Date.now();

    this.currentCycle = {
      id: cycleId,
      startedAt: cycleStart,
      endedAt: 0,
      trigger,
      observations: [],
      decisions: [],
      computeCost: 0,
      hadAction: false,
    };

    try {
      // ── Phase 1: OBSERVE ──────────────────────────────────────────────
      const observations = this.observe(trigger);
      this.currentCycle.observations = observations;
      this.currentCycle.computeCost += observations.length * 2; // 2 units per observation

      // ── Phase 2: REASON ───────────────────────────────────────────────
      const decisions = this.reason(observations);
      this.currentCycle.decisions = decisions;
      this.currentCycle.computeCost += decisions.length * 5; // 5 units per decision

      // ── Phase 3: ACT ──────────────────────────────────────────────────
      await this.act(decisions);

      // ── Phase 4: REFLECT ──────────────────────────────────────────────
      this.reflect();

    } catch (err) {
      logger.error('autonomous-loop', `Cycle ${cycleId} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (this.currentCycle) {
        this.currentCycle.endedAt = Date.now();
        this.currentCycle.hadAction = this.currentCycle.decisions.some(d => d.executed);

        // Record cycle
        this.cycleHistory.push(this.currentCycle);
        if (this.cycleHistory.length > this.MAX_CYCLE_HISTORY) {
          this.cycleHistory = this.cycleHistory.slice(-this.MAX_CYCLE_HISTORY);
        }

        // Update metrics
        this.updateMetrics(this.currentCycle);

        this.emit('cycle:completed', this.currentCycle);
        this.currentCycle = null;
      }

      // Schedule next cycle
      if (this.state === 'running') {
        this.scheduleNextCycle('scheduled');
      }
    }
  }

  // ─── Phase 1: OBSERVE ────────────────────────────────────────────────

  /** Gather observations about the current workspace state */
  private observe(trigger: CycleTrigger): Observation[] {
    const observations: Observation[] = [];

    // 1. Process pending observations
    observations.push(...this.pendingObservations);
    this.pendingObservations = [];

    // 2. Scan ESM graph for anomalies
    if (this.esm) {
      const timeline = this.esm.getTimeline();
      const recentNodes = timeline.filter(
        n => Date.now() - n.createdAt < 300_000 // Last 5 minutes
      );

      // Check for failed nodes
      const failedNodes = recentNodes.filter(n => n.state === 'failed');
      for (const node of failedNodes) {
        observations.push({
          type: 'graph_anomaly',
          description: `Execution node failed: ${node.title}`,
          confidence: 0.95,
          data: { nodeId: node.id, nodeType: node.type, error: node.error },
          severity: 'high',
        });
      }

      // Check for stuck nodes (executing for too long)
      const stuckNodes = recentNodes.filter(
        n => n.state === 'executing' && Date.now() - n.createdAt > 120_000
      );
      for (const node of stuckNodes) {
        observations.push({
          type: 'graph_anomaly',
          description: `Execution node stuck (2+ min): ${node.title}`,
          confidence: 0.7,
          data: { nodeId: node.id, nodeType: node.type },
          severity: 'medium',
        });
      }
    }

    // 3. Scan workspace context for errors
    if (this.workspaceContext) {
      const errors = this.workspaceContext.getRecentErrors();
      const recentErrors = errors.filter(e => Date.now() - e.timestamp < 300_000);
      for (const error of recentErrors) {
        observations.push({
          type: 'error_present',
          description: `${error.source}: ${error.message.slice(0, 150)}`,
          confidence: 0.85,
          data: { source: error.source, message: error.message, filePath: error.filePath },
          severity: error.suggestedFix ? 'medium' : 'high',
        });
      }
    }

    // 4. Check session memory for incomplete tasks
    if (this.sessionMemory) {
      const unfinishedTasks = this.sessionMemory.getUnfinishedTasks();
      for (const task of unfinishedTasks.slice(0, 3)) {
        observations.push({
          type: 'incomplete_task',
          description: `Unfinished task: ${task.description}`,
          confidence: 0.9,
          data: { taskId: task.id, context: task.context, files: task.activeFiles },
          severity: 'medium',
        });
      }
    }

    // 5. Idle-time deep scan (only when user is idle)
    if (this.isUserIdle() && trigger === 'idle_timeout') {
      // Check for stale dependencies
      if (this.workspaceContext) {
        const context = this.workspaceContext.assembleContext();
        // Simplified: if there are many modified files, suggest committing
        if (context.gitState && context.gitState.modified.length > 5) {
          observations.push({
            type: 'workspace_pattern',
            description: `${context.gitState.modified.length} uncommitted changes — consider committing`,
            confidence: 0.6,
            data: { modifiedCount: context.gitState.modified.length },
            severity: 'low',
          });
        }
      }
    }

    if (this.config.verboseLogging && observations.length > 0) {
      logger.debug('autonomous-loop', `Observations: ${observations.length} items`);
    }

    return observations;
  }

  // ─── Phase 2: REASON ────────────────────────────────────────────────

  /** Decide what to do based on observations */
  private reason(observations: Observation[]): Decision[] {
    const decisions: Decision[] = [];

    // Sort observations by severity
    const severityOrder: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
    const sorted = [...observations].sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0)
    );

    let remainingBudget = this.config.maxComputeBudget;

    for (let i = 0; i < sorted.length && remainingBudget > 0; i++) {
      const obs = sorted[i];

      switch (obs.type) {
        case 'error_present': {
          decisions.push({
            action: 'suggest_fix',
            description: `Suggest fix for: ${obs.description.slice(0, 100)}`,
            confidence: obs.confidence * 0.8,
            requiredAutonomy: 'suggest',
            executed: false,
            observationIndex: i,
          });
          remainingBudget -= 10;

          // If confidence is high and mode allows, also offer auto-fix
          if (obs.confidence > 0.8 && this.canAutonomouslyAct('assist')) {
            decisions.push({
              action: 'auto_fix',
              description: `Auto-fix: ${obs.description.slice(0, 100)}`,
              confidence: obs.confidence * 0.6,
              requiredAutonomy: 'assist',
              executed: false,
              observationIndex: i,
            });
            remainingBudget -= 15;
          }
          break;
        }

        case 'graph_anomaly': {
          const data = obs.data ?? {};
          if (data.newState === 'failed') {
            decisions.push({
              action: 'trigger_debug_loop',
              description: `Autonomous debugging for failed: ${obs.description.slice(0, 80)}`,
              confidence: 0.5,
              requiredAutonomy: 'assist',
              executed: false,
              observationIndex: i,
            });
            remainingBudget -= 20;
          }
          break;
        }

        case 'incomplete_task': {
          decisions.push({
            action: 'suggest_next_step',
            description: `Resume unfinished: ${obs.description.slice(0, 80)}`,
            confidence: 0.7,
            requiredAutonomy: 'suggest',
            executed: false,
            observationIndex: i,
          });
          remainingBudget -= 5;
          break;
        }

        case 'file_changed': {
          decisions.push({
            action: 'update_context',
            description: 'Update workspace context index',
            confidence: 0.9,
            requiredAutonomy: 'observe',
            executed: false,
            observationIndex: i,
          });
          remainingBudget -= 3;
          break;
        }

        case 'workspace_pattern': {
          decisions.push({
            action: 'notify_user',
            description: obs.description,
            confidence: obs.confidence,
            requiredAutonomy: 'suggest',
            executed: false,
            observationIndex: i,
          });
          remainingBudget -= 2;
          break;
        }

        case 'dependency_stale': {
          decisions.push({
            action: 'suggest_fix',
            description: 'Outdated or missing dependency detected',
            confidence: 0.7,
            requiredAutonomy: 'suggest',
            executed: false,
            observationIndex: i,
          });
          remainingBudget -= 5;
          break;
        }

        default: {
          // Low-priority observations — just update context
          decisions.push({
            action: 'update_context',
            description: `Context update for: ${obs.type}`,
            confidence: 0.5,
            requiredAutonomy: 'observe',
            executed: false,
            observationIndex: i,
          });
          remainingBudget -= 1;
        }
      }
    }

    return decisions;
  }

  // ─── Phase 3: ACT ──────────────────────────────────────────────────

  /** Execute decisions based on autonomy level */
  private async act(decisions: Decision[]): Promise<void> {
    const autonomyLevels: Record<AutonomousMode, number> = {
      observe: 0,
      suggest: 1,
      assist: 2,
      autonomous: 3,
    };

    const currentLevel = autonomyLevels[this.config.autonomousMode];

    for (const decision of decisions) {
      const requiredLevel = autonomyLevels[decision.requiredAutonomy];

      if (requiredLevel > currentLevel) {
        decision.executed = false;
        decision.skipReason = `Autonomy level too low (${this.config.autonomousMode} < ${decision.requiredAutonomy})`;
        decision.result = 'deferred';
        continue;
      }

      // Check rate limiting
      if (!this.canTakeAction()) {
        decision.executed = false;
        decision.skipReason = 'Rate limit reached or cooldown active';
        decision.result = 'deferred';
        continue;
      }

      // Check confidence threshold
      const minConfidence: Record<AutonomousMode, number> = {
        observe: 0,
        suggest: 0.4,
        assist: 0.7,
        autonomous: 0.85,
      };

      if (decision.confidence < minConfidence[this.config.autonomousMode]) {
        decision.executed = false;
        decision.skipReason = `Confidence too low (${decision.confidence.toFixed(2)} < ${minConfidence[this.config.autonomousMode]})`;
        decision.result = 'skipped';
        continue;
      }

      // Execute the decision
      try {
        decision.executed = true;
        await this.executeDecision(decision);
        decision.result = 'success';
        this.recordAction(decision.action);
      } catch (err) {
        decision.result = 'failed';
        decision.skipReason = err instanceof Error ? err.message : String(err);
        logger.warn('autonomous-loop', `Action failed: ${decision.description} — ${decision.skipReason}`);
      }
    }
  }

  /** Execute a single decision */
  private async executeDecision(decision: Decision): Promise<void> {
    switch (decision.action) {
      case 'update_context': {
        // Re-index workspace context
        if (this.workspaceContext) {
          await this.workspaceContext.buildDependencyGraph();
        }
        break;
      }

      case 'suggest_fix':
      case 'suggest_refactor':
      case 'suggest_test':
      case 'suggest_next_step':
      case 'notify_user': {
        // Emit suggestion event — UI will display it
        this.emit('suggestion', {
          action: decision.action,
          description: decision.description,
          confidence: decision.confidence,
          observation: decision.observationIndex !== undefined
            ? this.currentCycle?.observations[decision.observationIndex]
            : undefined,
        });
        break;
      }

      case 'auto_fix':
      case 'auto_refactor':
      case 'auto_install_dep': {
        // Emit action request — must go through AgentRuntime
        if (this.agentRuntime) {
          this.emit('autonomous:action', {
            action: decision.action,
            description: decision.description,
            confidence: decision.confidence,
          });
        }
        break;
      }

      case 'trigger_debug_loop': {
        this.emit('autonomous:debug', {
          description: decision.description,
          confidence: decision.confidence,
        });
        break;
      }

      case 'compress_memory': {
        this.emit('autonomous:compress', {});
        break;
      }

      case 'optimize_graph': {
        this.emit('autonomous:optimize', {});
        break;
      }

      default:
        logger.debug('autonomous-loop', `Unhandled action type: ${decision.action}`);
    }
  }

  // ─── Phase 4: REFLECT ──────────────────────────────────────────────

  /** Reflect on the cycle and adjust behavior */
  private reflect(): void {
    if (!this.currentCycle) return;

    // If too many idle cycles with no action, slow down
    if (!this.currentCycle.hadAction) {
      this.metrics.consecutiveIdleCycles++;
    } else {
      this.metrics.consecutiveIdleCycles = 0;
    }

    // After 5+ consecutive idle cycles, transition to slower interval
    if (this.metrics.consecutiveIdleCycles > 5 && this.config.idleCycleInterval < 120_000) {
      logger.debug('autonomous-loop', 'Increasing idle interval due to inactivity');
      // We don't mutate config here — the scheduler uses idleCycleInterval directly
    }
  }

  // ─── Rate Limiting & Safety ─────────────────────────────────────────

  /** Check if an autonomous action can be taken */
  private canTakeAction(): boolean {
    // Check cooldown
    if (Date.now() - this.lastActionAt < this.config.actionCooldown) {
      return false;
    }

    // Check actions per hour
    const oneHourAgo = Date.now() - 3600_000;
    this.actionTimestamps = this.actionTimestamps.filter(t => t > oneHourAgo);
    if (this.actionTimestamps.length >= this.config.maxActionsPerHour) {
      return false;
    }

    return true;
  }

  /** Check if the current autonomy mode allows a given action level */
  private canAutonomouslyAct(required: AutonomousMode): boolean {
    const levels: Record<AutonomousMode, number> = {
      observe: 0,
      suggest: 1,
      assist: 2,
      autonomous: 3,
    };
    return levels[this.config.autonomousMode] >= levels[required];
  }

  /** Record that an action was taken */
  private recordAction(actionType: string): void {
    this.actionTimestamps.push(Date.now());
    this.lastActionAt = Date.now();
    this.metrics.totalActions++;
    this.metrics.actionsByType[actionType] = (this.metrics.actionsByType[actionType] ?? 0) + 1;
  }

  /** Check if the user is idle */
  private isUserIdle(): boolean {
    return Date.now() - this.lastUserActivityAt > this.config.idleThreshold;
  }

  // ─── Metrics ────────────────────────────────────────────────────────

  /** Update metrics after a cycle */
  private updateMetrics(cycle: ReasoningCycle): void {
    this.metrics.totalCycles++;
    this.metrics.lastCycleAt = Date.now();
    this.metrics.uptime = Date.now() - this.startedAt;

    const duration = cycle.endedAt - cycle.startedAt;
    const prevAvg = this.metrics.avgCycleDuration;
    this.metrics.avgCycleDuration = prevAvg === 0 ? duration : (prevAvg * 0.9 + duration * 0.1);

    const prevCost = this.metrics.avgComputeCost;
    this.metrics.avgComputeCost = prevCost === 0 ? cycle.computeCost : (prevCost * 0.9 + cycle.computeCost * 0.1);

    const oneHourAgo = Date.now() - 3600_000;
    this.metrics.actionsLastHour = this.actionTimestamps.filter(t => t > oneHourAgo).length;
  }

  /** Get current metrics */
  getMetrics(): LoopEngineMetrics {
    return { ...this.metrics };
  }

  /** Get cycle history */
  getCycleHistory(limit: number = 20): ReasoningCycle[] {
    return this.cycleHistory.slice(-limit);
  }

  /** Get current engine state */
  getState(): LoopEngineState {
    return this.state;
  }

  /** Get current cycle (if running) */
  getCurrentCycle(): ReasoningCycle | null {
    return this.currentCycle;
  }

  /** Manually trigger a reasoning cycle */
  async triggerManualCycle(): Promise<ReasoningCycle | null> {
    if (this.state !== 'running') return null;

    await this.executeCycle('manual');
    return this.cycleHistory[this.cycleHistory.length - 1] ?? null;
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let autonomousLoopEngine: AutonomousLoopEngine | null = null;

export function getAutonomousLoopEngine(esm?: ExecutionStateMachine, config?: Partial<LoopEngineConfig>): AutonomousLoopEngine {
  if (!autonomousLoopEngine && esm) {
    autonomousLoopEngine = new AutonomousLoopEngine(esm, config);
  }
  if (!autonomousLoopEngine) {
    throw new Error('AutonomousLoopEngine not initialized — call getAutonomousLoopEngine(esm) first');
  }
  return autonomousLoopEngine;
}

export function resetAutonomousLoopEngine(esm: ExecutionStateMachine, config?: Partial<LoopEngineConfig>): AutonomousLoopEngine {
  autonomousLoopEngine = new AutonomousLoopEngine(esm, config);
  return autonomousLoopEngine;
}
