// ─── VibeCode Desktop — Agent Self-Metrics Dashboard ─────────────────────────
// ARC 21 P0-6: Self-Metrics + Telemetry
//
// Internal telemetry for:
//   - Decision accuracy
//   - Execution success rate
//   - User intervention frequency
//   - Latency per reasoning cycle
//   - Graph mutation efficiency
//
// This becomes the self-awareness layer of the system.
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';
import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsWriteInternalSync,
  kernelFsMkdirInternalSync,
} from '../kernel/kernel-fs';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** A single metric data point */
export interface MetricDataPoint {
  /** Timestamp */
  timestamp: number;
  /** Metric name */
  metric: string;
  /** Numeric value */
  value: number;
  /** Optional tags */
  tags?: Record<string, string>;
}

/** Agent decision record */
export interface DecisionRecord {
  /** Decision ID */
  id: string;
  /** What was decided */
  action: string;
  /** Confidence at decision time */
  confidence: number;
  /** Whether the decision was correct */
  wasCorrect: boolean | null; // null = not yet evaluated
  /** Whether the user intervened */
  userIntervened: boolean;
  /** Timestamp */
  timestamp: number;
  /** Time to make decision (ms) */
  decisionLatency: number;
}

/** Execution record */
export interface ExecutionRecord {
  /** Node ID */
  nodeId: string;
  /** Execution type */
  type: string;
  /** Whether it succeeded */
  success: boolean;
  /** Duration (ms) */
  duration: number;
  /** Whether it was retried */
  wasRetried: boolean;
  /** Number of retries */
  retryCount: number;
  /** Timestamp */
  timestamp: number;
}

/** Reasoning cycle record */
export interface CycleRecord {
  /** Cycle ID */
  id: string;
  /** Trigger type */
  trigger: string;
  /** Number of observations */
  observationCount: number;
  /** Number of decisions */
  decisionCount: number;
  /** Whether any action was taken */
  hadAction: boolean;
  /** Total cycle duration (ms) */
  duration: number;
  /** Compute cost */
  computeCost: number;
  /** Timestamp */
  timestamp: number;
}

/** Aggregated metrics summary */
export interface AgentMetricsSummary {
  // ─── Decision Metrics ──────────────────────────────────────────────
  /** Total decisions made */
  totalDecisions: number;
  /** Decision accuracy (correct / total evaluated) */
  decisionAccuracy: number;
  /** Average decision confidence */
  avgDecisionConfidence: number;
  /** Average decision latency (ms) */
  avgDecisionLatency: number;

  // ─── Execution Metrics ─────────────────────────────────────────────
  /** Total executions */
  totalExecutions: number;
  /** Execution success rate */
  executionSuccessRate: number;
  /** Average execution duration (ms) */
  avgExecutionDuration: number;
  /** Execution retry rate */
  retryRate: number;

  // ─── User Interaction Metrics ──────────────────────────────────────
  /** How often the user intervenes in agent decisions */
  userInterventionRate: number;
  /** How often users accept proactive suggestions */
  suggestionAcceptanceRate: number;
  /** How often users dismiss suggestions */
  suggestionDismissalRate: number;

  // ─── Reasoning Cycle Metrics ───────────────────────────────────────
  /** Total reasoning cycles */
  totalCycles: number;
  /** Average cycle duration (ms) */
  avgCycleDuration: number;
  /** Cycles resulting in action */
  actionRate: number;
  /** Average compute cost per cycle */
  avgComputeCost: number;

  // ─── Graph Mutation Metrics ────────────────────────────────────────
  /** Total graph mutations */
  totalMutations: number;
  /** Mutations that were later rolled back */
  rollbackRate: number;
  /** Average node creation rate (per hour) */
  nodeCreationRate: number;

  // ─── Time Window ───────────────────────────────────────────────────
  /** Period this summary covers */
  periodStart: number;
  /** Period end */
  periodEnd: number;
  /** When this summary was generated */
  generatedAt: number;
}

/** Metrics configuration */
export interface MetricsConfig {
  /** Maximum decision records to keep */
  maxDecisions: number;
  /** Maximum execution records to keep */
  maxExecutions: number;
  /** Maximum cycle records to keep */
  maxCycles: number;
  /** Maximum raw metric data points */
  maxDataPoints: number;
  /** Whether to persist metrics to disk */
  persist: boolean;
  /** How often to auto-summarize (ms, 0 = disabled) */
  autoSummarizeInterval: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  maxDecisions: 500,
  maxExecutions: 1000,
  maxCycles: 200,
  maxDataPoints: 2000,
  persist: true,
  autoSummarizeInterval: 300_000, // 5 minutes
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT METRICS SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentMetricsService extends EventEmitter {
  private config: MetricsConfig;

  /** Record stores */
  private decisions: DecisionRecord[] = [];
  private executions: ExecutionRecord[] = [];
  private cycles: CycleRecord[] = [];
  private dataPoints: MetricDataPoint[] = [];

  /** User interaction counters */
  private userInterventions: number = 0;
  private suggestionsAccepted: number = 0;
  private suggestionsDismissed: number = 0;
  private totalSuggestions: number = 0;

  /** Graph mutation counters */
  private graphMutations: number = 0;
  private graphRollbacks: number = 0;
  private nodeCreations: number = 0;
  private nodeCreationStart: number = Date.now();

  /** Summarize timer */
  private summarizeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Persist path */
  private persistPath: string;

  constructor(config?: Partial<MetricsConfig>) {
    super();
    this.config = { ...DEFAULT_METRICS_CONFIG, ...config };
    this.setMaxListeners(30);

    const vibecodeHome = process.env.VIBECODE_HOME ||
      path.join(os.homedir(), '.vibecode');
    this.persistPath = path.join(vibecodeHome, 'agent-metrics.json');

    if (this.config.persist) {
      this.load();
    }

    if (this.config.autoSummarizeInterval > 0) {
      this.summarizeTimer = setInterval(() => {
        const summary = this.generateSummary();
        this.emit('metrics:summary', summary);
      }, this.config.autoSummarizeInterval);
    }
  }

  // ─── Recording API ──────────────────────────────────────────────────

  /** Record a decision */
  recordDecision(decision: Omit<DecisionRecord, 'id' | 'timestamp'>): void {
    const record: DecisionRecord = {
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...decision,
      timestamp: Date.now(),
    };

    this.decisions.push(record);
    if (this.decisions.length > this.config.maxDecisions) {
      this.decisions = this.decisions.slice(-this.config.maxDecisions);
    }

    this.recordDataPoint('decision.confidence', decision.confidence);
    this.recordDataPoint('decision.latency', decision.decisionLatency);

    if (decision.userIntervened) {
      this.userInterventions++;
    }

    this.emit('decision:recorded', record);
  }

  /** Record an execution */
  recordExecution(execution: Omit<ExecutionRecord, 'timestamp'>): void {
    const record: ExecutionRecord = {
      ...execution,
      timestamp: Date.now(),
    };

    this.executions.push(record);
    if (this.executions.length > this.config.maxExecutions) {
      this.executions = this.executions.slice(-this.config.maxExecutions);
    }

    this.recordDataPoint('execution.duration', execution.duration);
    if (execution.wasRetried) {
      this.recordDataPoint('execution.retry', 1);
    }

    this.emit('execution:recorded', record);
  }

  /** Record a reasoning cycle */
  recordCycle(cycle: Omit<CycleRecord, 'timestamp'>): void {
    const record: CycleRecord = {
      ...cycle,
      timestamp: Date.now(),
    };

    this.cycles.push(record);
    if (this.cycles.length > this.config.maxCycles) {
      this.cycles = this.cycles.slice(-this.config.maxCycles);
    }

    this.recordDataPoint('cycle.duration', cycle.duration);
    this.recordDataPoint('cycle.compute_cost', cycle.computeCost);

    this.emit('cycle:recorded', record);
  }

  /** Record a raw metric data point */
  recordDataPoint(metric: string, value: number, tags?: Record<string, string>): void {
    this.dataPoints.push({ timestamp: Date.now(), metric, value, tags });
    if (this.dataPoints.length > this.config.maxDataPoints) {
      this.dataPoints = this.dataPoints.slice(-this.config.maxDataPoints);
    }
  }

  /** Record a graph mutation */
  recordGraphMutation(type: 'create' | 'transition' | 'delete' | 'rollback'): void {
    this.graphMutations++;
    if (type === 'create') {
      this.nodeCreations++;
    }
    if (type === 'rollback') {
      this.graphRollbacks++;
    }
  }

  /** Record a suggestion outcome */
  recordSuggestionOutcome(outcome: 'accepted' | 'dismissed'): void {
    this.totalSuggestions++;
    if (outcome === 'accepted') this.suggestionsAccepted++;
    if (outcome === 'dismissed') this.suggestionsDismissed++;
  }

  /** Evaluate a past decision (mark it as correct or incorrect) */
  evaluateDecision(decisionId: string, wasCorrect: boolean): void {
    const decision = this.decisions.find(d => d.id === decisionId);
    if (decision) {
      decision.wasCorrect = wasCorrect;
    }
  }

  // ─── Summary Generation ────────────────────────────────────────────

  /** Generate a comprehensive metrics summary */
  generateSummary(): AgentMetricsSummary {
    const now = Date.now();
    const evaluatedDecisions = this.decisions.filter(d => d.wasCorrect !== null);
    const correctDecisions = evaluatedDecisions.filter(d => d.wasCorrect === true);

    const successfulExecutions = this.executions.filter(e => e.success);
    const retriedExecutions = this.executions.filter(e => e.wasRetried);

    const cyclesWithActions = this.cycles.filter(c => c.hadAction);

    const hoursSinceStart = Math.max(0.001, (now - this.nodeCreationStart) / 3600_000);

    const summary: AgentMetricsSummary = {
      // Decision metrics
      totalDecisions: this.decisions.length,
      decisionAccuracy: evaluatedDecisions.length > 0
        ? correctDecisions.length / evaluatedDecisions.length : 0,
      avgDecisionConfidence: this.decisions.length > 0
        ? this.decisions.reduce((sum, d) => sum + d.confidence, 0) / this.decisions.length : 0,
      avgDecisionLatency: this.decisions.length > 0
        ? this.decisions.reduce((sum, d) => sum + d.decisionLatency, 0) / this.decisions.length : 0,

      // Execution metrics
      totalExecutions: this.executions.length,
      executionSuccessRate: this.executions.length > 0
        ? successfulExecutions.length / this.executions.length : 0,
      avgExecutionDuration: this.executions.length > 0
        ? this.executions.reduce((sum, e) => sum + e.duration, 0) / this.executions.length : 0,
      retryRate: this.executions.length > 0
        ? retriedExecutions.length / this.executions.length : 0,

      // User interaction metrics
      userInterventionRate: this.decisions.length > 0
        ? this.userInterventions / this.decisions.length : 0,
      suggestionAcceptanceRate: this.totalSuggestions > 0
        ? this.suggestionsAccepted / this.totalSuggestions : 0,
      suggestionDismissalRate: this.totalSuggestions > 0
        ? this.suggestionsDismissed / this.totalSuggestions : 0,

      // Reasoning cycle metrics
      totalCycles: this.cycles.length,
      avgCycleDuration: this.cycles.length > 0
        ? this.cycles.reduce((sum, c) => sum + c.duration, 0) / this.cycles.length : 0,
      actionRate: this.cycles.length > 0
        ? cyclesWithActions.length / this.cycles.length : 0,
      avgComputeCost: this.cycles.length > 0
        ? this.cycles.reduce((sum, c) => sum + c.computeCost, 0) / this.cycles.length : 0,

      // Graph mutation metrics
      totalMutations: this.graphMutations,
      rollbackRate: this.graphMutations > 0
        ? this.graphRollbacks / this.graphMutations : 0,
      nodeCreationRate: this.nodeCreations / hoursSinceStart,

      // Period
      periodStart: this.cycles.length > 0
        ? this.cycles[0].timestamp : now,
      periodEnd: now,
      generatedAt: now,
    };

    this.emit('metrics:summary', summary);
    this.schedulePersist();

    return summary;
  }

  // ─── Query API ──────────────────────────────────────────────────────

  /** Get recent decisions */
  getRecentDecisions(limit: number = 20): DecisionRecord[] {
    return this.decisions.slice(-limit);
  }

  /** Get recent executions */
  getRecentExecutions(limit: number = 20): ExecutionRecord[] {
    return this.executions.slice(-limit);
  }

  /** Get recent cycles */
  getRecentCycles(limit: number = 20): CycleRecord[] {
    return this.cycles.slice(-limit);
  }

  /** Get metric data points for a specific metric */
  getDataPoints(metric: string, since?: number): MetricDataPoint[] {
    return this.dataPoints
      .filter(dp => dp.metric === metric && (!since || dp.timestamp >= since));
  }

  /** Get metric time series for charting */
  getMetricTimeSeries(metric: string, intervalMs: number = 60_000, since?: number): Array<{ time: number; value: number; count: number }> {
    const points = this.getDataPoints(metric, since);
    const buckets: Map<number, { sum: number; count: number }> = new Map();

    for (const dp of points) {
      const bucket = Math.floor(dp.timestamp / intervalMs) * intervalMs;
      const existing = buckets.get(bucket) ?? { sum: 0, count: 0 };
      existing.sum += dp.value;
      existing.count++;
      buckets.set(bucket, existing);
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([time, { sum, count }]) => ({ time, value: sum / count, count }));
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!kernelFsExistsInternal(this.persistPath)) return;

      const data = JSON.parse(kernelFsReadSync(this.persistPath, 'utf-8'));

      this.decisions = data.decisions ?? [];
      this.executions = data.executions ?? [];
      this.cycles = data.cycles ?? [];
      this.dataPoints = data.dataPoints ?? [];
      this.userInterventions = data.userInterventions ?? 0;
      this.suggestionsAccepted = data.suggestionsAccepted ?? 0;
      this.suggestionsDismissed = data.suggestionsDismissed ?? 0;
      this.totalSuggestions = data.totalSuggestions ?? 0;
      this.graphMutations = data.graphMutations ?? 0;
      this.graphRollbacks = data.graphRollbacks ?? 0;
      this.nodeCreations = data.nodeCreations ?? 0;

      logger.info('agent-metrics', `Loaded: ${this.decisions.length} decisions, ${this.executions.length} executions, ${this.cycles.length} cycles`);
    } catch (err) {
      logger.warn('agent-metrics', `Failed to load: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private persist(): void {
    if (!this.config.persist) return;

    try {
      const dir = path.dirname(this.persistPath);
      if (!kernelFsExistsInternal(dir)) {
        kernelFsMkdirInternalSync(dir);
      }

      const data = {
        decisions: this.decisions.slice(-this.config.maxDecisions),
        executions: this.executions.slice(-this.config.maxExecutions),
        cycles: this.cycles.slice(-this.config.maxCycles),
        dataPoints: this.dataPoints.slice(-this.config.maxDataPoints),
        userInterventions: this.userInterventions,
        suggestionsAccepted: this.suggestionsAccepted,
        suggestionsDismissed: this.suggestionsDismissed,
        totalSuggestions: this.totalSuggestions,
        graphMutations: this.graphMutations,
        graphRollbacks: this.graphRollbacks,
        nodeCreations: this.nodeCreations,
      };

      kernelFsWriteInternalSync(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.error('agent-metrics', `Failed to persist: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private schedulePersist(): void {
    // Debounced persist
    setTimeout(() => this.persist(), 3000);
  }

  /** Force persist — call on shutdown */
  flush(): void {
    this.persist();
  }

  /** Clean up */
  dispose(): void {
    if (this.summarizeTimer) {
      clearInterval(this.summarizeTimer);
      this.summarizeTimer = null;
    }
    this.flush();
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let agentMetricsService: AgentMetricsService | null = null;

export function getAgentMetricsService(config?: Partial<MetricsConfig>): AgentMetricsService {
  if (!agentMetricsService) {
    agentMetricsService = new AgentMetricsService(config);
  }
  return agentMetricsService;
}

export function resetAgentMetricsService(config?: Partial<MetricsConfig>): AgentMetricsService {
  if (agentMetricsService) agentMetricsService.dispose();
  agentMetricsService = new AgentMetricsService(config);
  return agentMetricsService;
}
