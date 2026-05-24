// ─── VibeCode Desktop — Proactive AI Actions System ───────────────────────────
// ARC 21 P0-4: Proactive AI Actions
//
// Upgrades the agent so it can:
//   - Suggest fixes BEFORE the user asks
//   - Auto-detect broken flows
//   - Trigger repair proposals automatically
//   - Open execution plans without explicit prompts
//
// Includes:
//   - Confidence threshold system
//   - Action gating layer (low/medium/high autonomy modes)
//   - Safe auto-execution rules
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import type { ExecutionStateMachine, ExecutionNode } from './execution-state-machine';
import type { AgentRuntime } from './agent-runtime';
import type { WorkspaceContextService, RecentError } from './workspace-context-service';
import type { TerminalIntelligenceService, FailureDiagnosis } from './terminal-intelligence';
import type { SessionMemoryService } from './session-memory';
import type { AutonomousLoopEngine, AutonomousMode } from './autonomous-loop-engine';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A proactive action the system can take */
export interface ProactiveAction {
  /** Unique ID */
  id: string;
  /** Action type */
  type: ProactiveActionType;
  /** Human-readable description */
  description: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Autonomy level required */
  requiredAutonomy: ActionAutonomyLevel;
  /** Current status */
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'dismissed';
  /** Source that triggered this action */
  trigger: ActionTrigger;
  /** Suggested execution steps */
  steps: ProactiveStep[];
  /** Risk assessment */
  risk: ActionRisk;
  /** When this action was created */
  createdAt: number;
  /** When this action was resolved */
  resolvedAt: number | null;
  /** Result */
  result?: ActionExecutionResult;
  /** User feedback */
  userFeedback?: 'accepted' | 'dismissed' | 'modified';
}

/** Types of proactive actions */
export type ProactiveActionType =
  | 'fix_error'               // Fix a detected error
  | 'install_dependency'       // Install a missing package
  | 'suggest_refactor'         // Suggest code refactoring
  | 'suggest_test'             // Suggest adding tests
  | 'resume_task'              // Resume an unfinished task
  | 'optimize_imports'         // Clean up unused imports
  | 'fix_type_error'           // Fix a TypeScript type error
  | 'suggest_commit'           // Suggest committing changes
  | 'suggest_next_step'        // Suggest what to do next
  | 'auto_debug'               // Start autonomous debugging
  | 'context_update'           // Update workspace context
  | 'notify_anomaly';          // Notify about unusual behavior

/** Autonomy level required for an action */
export type ActionAutonomyLevel = 'suggest' | 'assist' | 'autonomous';

/** What triggered this proactive action */
export interface ActionTrigger {
  /** Source type */
  source: 'error' | 'terminal_failure' | 'graph_anomaly' | 'idle_analysis' |
          'pattern_detected' | 'context_change' | 'memory_recall' | 'manual';
  /** Source description */
  description: string;
  /** Related data */
  data?: Record<string, unknown>;
}

/** A step in a proactive action */
export interface ProactiveStep {
  /** Step description */
  description: string;
  /** Step type */
  type: 'file_edit' | 'terminal_command' | 'analysis' | 'notification';
  /** Parameters */
  params: Record<string, unknown>;
  /** Whether this step is reversible */
  reversible: boolean;
  /** Estimated impact */
  impact: 'low' | 'medium' | 'high';
}

/** Risk assessment for a proactive action */
export interface ActionRisk {
  /** Overall risk level */
  level: 'low' | 'medium' | 'high' | 'critical';
  /** Description of risks */
  description: string;
  /** Whether the action can be undone */
  canUndo: boolean;
  /** Files that will be affected */
  affectedFiles: string[];
  /** Whether the action modifies workspace files */
  modifiesFiles: boolean;
}

/** Result of executing a proactive action */
export interface ActionExecutionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Description of what happened */
  description: string;
  /** Nodes created in the ESM */
  nodeIds: string[];
  /** Error if failed */
  error?: string;
  /** Duration (ms) */
  duration: number;
}

/** Proactive actions configuration */
export interface ProactiveActionsConfig {
  /** Minimum confidence to suggest an action */
  suggestConfidenceThreshold: number;
  /** Minimum confidence to auto-assist */
  assistConfidenceThreshold: number;
  /** Minimum confidence to auto-execute */
  autonomousConfidenceThreshold: number;
  /** Maximum pending actions */
  maxPendingActions: number;
  /** Cooldown between proactive suggestions (ms) */
  suggestionCooldown: number;
  /** Whether to suppress duplicate suggestions */
  suppressDuplicates: boolean;
  /** Current autonomy mode */
  autonomyMode: AutonomousMode;
}

/** Proactive actions metrics */
export interface ProactiveActionsMetrics {
  /** Total actions generated */
  totalGenerated: number;
  /** Actions by type */
  byType: Record<string, number>;
  /** Actions accepted by user */
  userAccepted: number;
  /** Actions dismissed by user */
  userDismissed: number;
  /** Actions auto-executed */
  autoExecuted: number;
  /** Actions that failed */
  failed: number;
  /** Average confidence of generated actions */
  avgConfidence: number;
  /** Suggestion acceptance rate */
  acceptanceRate: number;
  /** Last suggestion timestamp */
  lastSuggestionAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PROACTIVE_CONFIG: ProactiveActionsConfig = {
  suggestConfidenceThreshold: 0.4,
  assistConfidenceThreshold: 0.7,
  autonomousConfidenceThreshold: 0.85,
  maxPendingActions: 20,
  suggestionCooldown: 30_000, // 30 seconds
  suppressDuplicates: true,
  autonomyMode: 'suggest',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROACTIVE ACTIONS SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class ProactiveActionsService extends EventEmitter {
  private esm: ExecutionStateMachine;
  private agentRuntime: AgentRuntime | null = null;
  private workspaceContext: WorkspaceContextService | null = null;
  private terminalIntelligence: TerminalIntelligenceService | null = null;
  private sessionMemory: SessionMemoryService | null = null;
  private loopEngine: AutonomousLoopEngine | null = null;
  private config: ProactiveActionsConfig;

  /** Pending actions awaiting user decision */
  private pendingActions: Map<string, ProactiveAction> = new Map();

  /** Recently dismissed action signatures (for dedup) */
  private dismissedSignatures: Map<string, number> = new Map();
  private readonly DISMISS_TTL = 300_000; // 5 minutes

  /** Action history (last 100) */
  private actionHistory: ProactiveAction[] = [];
  private readonly MAX_HISTORY = 100;

  /** Last suggestion timestamp */
  private lastSuggestionAt: number = 0;

  /** Metrics */
  private metrics: ProactiveActionsMetrics = {
    totalGenerated: 0,
    byType: {},
    userAccepted: 0,
    userDismissed: 0,
    autoExecuted: 0,
    failed: 0,
    avgConfidence: 0,
    acceptanceRate: 0,
    lastSuggestionAt: 0,
  };

  constructor(esm: ExecutionStateMachine, config?: Partial<ProactiveActionsConfig>) {
    super();
    this.esm = esm;
    this.config = { ...DEFAULT_PROACTIVE_CONFIG, ...config };
    this.setMaxListeners(50);
  }

  /** Inject dependencies */
  injectDependencies(deps: {
    agentRuntime?: AgentRuntime;
    workspaceContext?: WorkspaceContextService;
    terminalIntelligence?: TerminalIntelligenceService;
    sessionMemory?: SessionMemoryService;
    loopEngine?: AutonomousLoopEngine;
  }): void {
    if (deps.agentRuntime) this.agentRuntime = deps.agentRuntime;
    if (deps.workspaceContext) this.workspaceContext = deps.workspaceContext;
    if (deps.terminalIntelligence) this.terminalIntelligence = deps.terminalIntelligence;
    if (deps.sessionMemory) this.sessionMemory = deps.sessionMemory;
    if (deps.loopEngine) this.loopEngine = deps.loopEngine;
  }

  // ─── Proactive Detection ────────────────────────────────────────────

  /** Scan for proactive action opportunities */
  scan(): ProactiveAction[] {
    const actions: ProactiveAction[] = [];

    // 1. Check for errors that can be fixed
    actions.push(...this.detectFixableErrors());

    // 2. Check for terminal failures
    actions.push(...this.detectTerminalFailures());

    // 3. Check for unfinished tasks
    actions.push(...this.detectUnfinishedTasks());

    // 4. Check for common improvement opportunities
    actions.push(...this.detectImprovementOpportunities());

    // Filter by confidence threshold
    const threshold = this.getConfidenceThreshold();
    const filtered = actions.filter(a => a.confidence >= threshold);

    // Deduplicate
    const deduped = this.deduplicateActions(filtered);

    // Register and emit
    for (const action of deduped) {
      this.registerAction(action);
    }

    return deduped;
  }

  /** Detect errors that can be proactively fixed */
  private detectFixableErrors(): ProactiveAction[] {
    const actions: ProactiveAction[] = [];

    if (!this.workspaceContext) return actions;

    const errors = this.workspaceContext.getRecentErrors();
    const recentErrors = errors.filter(e => Date.now() - e.timestamp < 300_000); // Last 5 min

    for (const error of recentErrors) {
      const signature = `fix_error:${error.message.slice(0, 50)}`;
      if (this.isDismissed(signature)) continue;

      actions.push({
        id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'fix_error',
        description: `Fix error: ${error.message.slice(0, 100)}`,
        confidence: error.suggestedFix ? 0.75 : 0.4,
        requiredAutonomy: error.suggestedFix ? 'assist' : 'suggest',
        status: 'pending',
        trigger: {
          source: 'error',
          description: `Error from ${error.source}`,
          data: { error },
        },
        steps: error.suggestedFix ? [{
          description: `Apply suggested fix: ${error.suggestedFix.slice(0, 100)}`,
          type: 'file_edit',
          params: { fix: error.suggestedFix, filePath: error.filePath },
          reversible: true,
          impact: 'medium',
        }] : [],
        risk: {
          level: 'low',
          description: 'Applying suggested fix for detected error',
          canUndo: true,
          affectedFiles: error.filePath ? [error.filePath] : [],
          modifiesFiles: !!error.filePath,
        },
        createdAt: Date.now(),
        resolvedAt: null,
      });
    }

    return actions;
  }

  /** Detect terminal failures that can be proactively addressed */
  private detectTerminalFailures(): ProactiveAction[] {
    const actions: ProactiveAction[] = [];

    if (!this.workspaceContext || !this.terminalIntelligence) return actions;

    const terminalHistory = this.workspaceContext.getTerminalHistory();
    const recentFailures = terminalHistory.filter(
      t => t.failed && Date.now() - t.timestamp < 300_000
    );

    for (const failure of recentFailures) {
      const signature = `terminal_fix:${failure.command.slice(0, 50)}`;
      if (this.isDismissed(signature)) continue;

      // Get diagnosis from terminal intelligence
      const diagnosis = this.terminalIntelligence.diagnoseFailure(
        failure.command,
        failure.exitCode ?? 1,
        failure.outputSnippet,
        '',
      );

      actions.push({
        id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: diagnosis.canAutoFix ? 'fix_error' : 'suggest_next_step',
        description: `Fix terminal failure: ${failure.command.slice(0, 60)}`,
        confidence: diagnosis.confidence,
        requiredAutonomy: diagnosis.canAutoFix ? 'assist' : 'suggest',
        status: 'pending',
        trigger: {
          source: 'terminal_failure',
          description: `Command failed: ${failure.command}`,
          data: { diagnosis, failure },
        },
        steps: diagnosis.canAutoFix && diagnosis.autoFixCommand ? [{
          description: `Run auto-fix: ${diagnosis.autoFixCommand}`,
          type: 'terminal_command',
          params: { command: diagnosis.autoFixCommand },
          reversible: false,
          impact: 'medium',
        }] : [{
          description: `Suggested fix: ${diagnosis.suggestedFix}`,
          type: 'notification',
          params: { message: diagnosis.suggestedFix },
          reversible: true,
          impact: 'low',
        }],
        risk: {
          level: diagnosis.canAutoFix ? 'medium' : 'low',
          description: `Terminal fix: ${diagnosis.suggestedFix}`,
          canUndo: !diagnosis.canAutoFix,
          affectedFiles: [],
          modifiesFiles: false,
        },
        createdAt: Date.now(),
        resolvedAt: null,
      });
    }

    return actions;
  }

  /** Detect unfinished tasks that can be resumed */
  private detectUnfinishedTasks(): ProactiveAction[] {
    const actions: ProactiveAction[] = [];

    if (!this.sessionMemory) return actions;

    const unfinished = this.sessionMemory.getUnfinishedTasks();
    const recent = unfinished.filter(t => Date.now() - t.lastActiveAt < 7 * 24 * 60 * 60 * 1000); // Last 7 days

    for (const task of recent.slice(0, 3)) {
      actions.push({
        id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'resume_task',
        description: `Resume: ${task.description}`,
        confidence: 0.6,
        requiredAutonomy: 'suggest',
        status: 'pending',
        trigger: {
          source: 'memory_recall',
          description: `Unfinished task from previous session`,
          data: { task },
        },
        steps: [{
          description: `Open files: ${task.activeFiles.join(', ')}`,
          type: 'notification',
          params: { files: task.activeFiles, context: task.context },
          reversible: true,
          impact: 'low',
        }],
        risk: {
          level: 'low',
          description: 'Resuming a previously unfinished task',
          canUndo: true,
          affectedFiles: task.activeFiles,
          modifiesFiles: false,
        },
        createdAt: Date.now(),
        resolvedAt: null,
      });
    }

    return actions;
  }

  /** Detect general improvement opportunities */
  private detectImprovementOpportunities(): ProactiveAction[] {
    const actions: ProactiveAction[] = [];

    if (!this.workspaceContext) return actions;

    const context = this.workspaceContext.assembleContext();

    // Suggest committing if many changes
    if (context.gitState && context.gitState.isDirty && context.gitState.modified.length > 5) {
      actions.push({
        id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'suggest_commit',
        description: `You have ${context.gitState.modified.length} uncommitted changes. Consider committing.`,
        confidence: 0.5,
        requiredAutonomy: 'suggest',
        status: 'pending',
        trigger: {
          source: 'context_change',
          description: `${context.gitState.modified.length} uncommitted changes`,
          data: { modifiedCount: context.gitState.modified.length },
        },
        steps: [],
        risk: {
          level: 'low',
          description: 'Suggestion only — no automatic action',
          canUndo: true,
          affectedFiles: [],
          modifiesFiles: false,
        },
        createdAt: Date.now(),
        resolvedAt: null,
      });
    }

    return actions;
  }

  // ─── Action Management ──────────────────────────────────────────────

  /** Register a proactive action */
  private registerAction(action: ProactiveAction): void {
    // Check cooldown
    if (Date.now() - this.lastSuggestionAt < this.config.suggestionCooldown) {
      return;
    }

    // Check max pending
    if (this.pendingActions.size >= this.config.maxPendingActions) {
      return;
    }

    this.pendingActions.set(action.id, action);
    this.metrics.totalGenerated++;
    this.metrics.byType[action.type] = (this.metrics.byType[action.type] ?? 0) + 1;
    this.metrics.avgConfidence = this.metrics.totalGenerated === 1
      ? action.confidence
      : (this.metrics.avgConfidence * 0.95 + action.confidence * 0.05);

    this.lastSuggestionAt = Date.now();
    this.metrics.lastSuggestionAt = Date.now();

    this.emit('action:proposed', action);

    // Auto-execute if autonomy mode allows and confidence is high enough
    if (this.shouldAutoExecute(action)) {
      this.executeAction(action.id);
    }
  }

  /** Check if an action should be auto-executed */
  private shouldAutoExecute(action: ProactiveAction): boolean {
    if (this.config.autonomyMode === 'observe' || this.config.autonomyMode === 'suggest') {
      return false;
    }

    if (action.risk.level === 'critical') return false;
    if (action.risk.modifiesFiles && this.config.autonomyMode === 'assist') {
      return action.confidence >= this.config.assistConfidenceThreshold && action.risk.canUndo;
    }

    if (this.config.autonomyMode === 'autonomous') {
      return action.confidence >= this.config.autonomousConfidenceThreshold;
    }

    return false;
  }

  /** Execute a pending action */
  async executeAction(actionId: string): Promise<ActionExecutionResult | null> {
    const action = this.pendingActions.get(actionId);
    if (!action) return null;

    action.status = 'executing';
    this.emit('action:executing', action);

    const startTime = Date.now();
    const result: ActionExecutionResult = {
      success: false,
      description: '',
      nodeIds: [],
      duration: 0,
    };

    try {
      // Execute each step
      for (const step of action.steps) {
        // Create an ESM node for tracking
        const node = this.esm.createNode({
          type: 'step',
          title: step.description,
          description: `Proactive action step: ${step.description}`,
          data: {
            kind: 'step',
            stepType: step.type,
            params: step.params,
          },
          riskLevel: action.risk.level === 'low' ? 'low' : action.risk.level === 'medium' ? 'medium' : 'high',
        });

        result.nodeIds.push(node.id);

        // For now, we emit the step for external execution
        // A full implementation would route through ExecutionGateway
        this.emit('action:step', { actionId, step, nodeId: node.id });

        this.esm.transitionNode(node.id, 'completed');
      }

      result.success = true;
      result.description = `Executed ${action.steps.length} steps`;
      action.status = 'completed';
      action.result = result;
      this.metrics.autoExecuted++;

    } catch (err) {
      result.success = false;
      result.error = err instanceof Error ? err.message : String(err);
      action.status = 'failed';
      action.result = result;
      this.metrics.failed++;
    }

    result.duration = Date.now() - startTime;
    action.resolvedAt = Date.now();

    // Move to history
    this.pendingActions.delete(actionId);
    this.actionHistory.push(action);
    if (this.actionHistory.length > this.MAX_HISTORY) {
      this.actionHistory = this.actionHistory.slice(-this.MAX_HISTORY);
    }

    this.updateAcceptanceMetrics();
    this.emit('action:completed', action);

    return result;
  }

  /** User accepts a suggestion */
  acceptAction(actionId: string): void {
    const action = this.pendingActions.get(actionId);
    if (!action) return;

    action.userFeedback = 'accepted';
    this.metrics.userAccepted++;
    this.executeAction(actionId);
  }

  /** User dismisses a suggestion */
  dismissAction(actionId: string): void {
    const action = this.pendingActions.get(actionId);
    if (!action) return;

    action.status = 'dismissed';
    action.userFeedback = 'dismissed';
    action.resolvedAt = Date.now();
    this.metrics.userDismissed++;

    // Track dismissed signature for dedup
    const sig = `${action.type}:${action.description.slice(0, 50)}`;
    this.dismissedSignatures.set(sig, Date.now());

    this.pendingActions.delete(actionId);
    this.actionHistory.push(action);
    this.updateAcceptanceMetrics();

    this.emit('action:dismissed', action);
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  /** Get confidence threshold based on current autonomy mode */
  private getConfidenceThreshold(): number {
    switch (this.config.autonomyMode) {
      case 'observe': return 1.0; // No actions in observe mode
      case 'suggest': return this.config.suggestConfidenceThreshold;
      case 'assist': return this.config.assistConfidenceThreshold;
      case 'autonomous': return this.config.autonomousConfidenceThreshold;
    }
  }

  /** Check if an action signature was recently dismissed */
  private isDismissed(signature: string): boolean {
    const dismissedAt = this.dismissedSignatures.get(signature);
    if (!dismissedAt) return false;
    if (Date.now() - dismissedAt > this.DISMISS_TTL) {
      this.dismissedSignatures.delete(signature);
      return false;
    }
    return true;
  }

  /** Deduplicate actions */
  private deduplicateActions(actions: ProactiveAction[]): ProactiveAction[] {
    if (!this.config.suppressDuplicates) return actions;

    const seen = new Set<string>();
    return actions.filter(action => {
      const sig = `${action.type}:${action.description.slice(0, 50)}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  /** Update acceptance rate metric */
  private updateAcceptanceMetrics(): void {
    const total = this.metrics.userAccepted + this.metrics.userDismissed;
    if (total > 0) {
      this.metrics.acceptanceRate = this.metrics.userAccepted / total;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /** Get all pending actions */
  getPendingActions(): ProactiveAction[] {
    return Array.from(this.pendingActions.values());
  }

  /** Get action history */
  getActionHistory(limit: number = 20): ProactiveAction[] {
    return this.actionHistory.slice(-limit);
  }

  /** Get current metrics */
  getMetrics(): ProactiveActionsMetrics {
    return { ...this.metrics };
  }

  /** Get current config */
  getConfig(): ProactiveActionsConfig {
    return { ...this.config };
  }

  /** Update config */
  updateConfig(updates: Partial<ProactiveActionsConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('config:updated', this.config);
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let proactiveActionsService: ProactiveActionsService | null = null;

export function getProactiveActionsService(esm?: ExecutionStateMachine, config?: Partial<ProactiveActionsConfig>): ProactiveActionsService {
  if (!proactiveActionsService && esm) {
    proactiveActionsService = new ProactiveActionsService(esm, config);
  }
  if (!proactiveActionsService) {
    throw new Error('ProactiveActionsService not initialized');
  }
  return proactiveActionsService;
}

export function resetProactiveActionsService(esm: ExecutionStateMachine, config?: Partial<ProactiveActionsConfig>): ProactiveActionsService {
  proactiveActionsService = new ProactiveActionsService(esm, config);
  return proactiveActionsService;
}
