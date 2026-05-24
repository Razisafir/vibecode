// ─── VibeCode Desktop — Autonomous Improvement System ─────────────────────────
// ARC 21 P0-2: Self-Improving Agent Loop
//
// The agent can detect inefficiencies in its own previous actions and
// optimize the execution graph. This is the meta-cognitive layer.
//
// Capabilities:
//   - Detect inefficiencies in previous actions
//   - Refactor past execution nodes
//   - Optimize graph structure (merge, compress, deduplicate)
//   - Suggest system-level improvements
//   - Performance regression detection
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import type { ExecutionStateMachine, ExecutionNode, NodeState } from './execution-state-machine';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Types of improvements the system can identify */
export type ImprovementType =
  | 'redundant_nodes'        // Multiple nodes doing the same thing
  | 'stale_nodes'            // Nodes that are no longer relevant
  | 'inefficient_path'       // Execution could have been shorter
  | 'retry_pattern'          // Same step retried many times
  | 'orphaned_nodes'         // Nodes with no causal chain
  | 'bloated_context'        // Context includes unnecessary data
  | 'missed_optimization'    // A better approach existed
  | 'performance_regression' // System is slower than baseline
  | 'memory_leak'            // Growing memory/state without cleanup;

/** An identified improvement opportunity */
export interface ImprovementOpportunity {
  /** Unique ID */
  id: string;
  /** Type of improvement */
  type: ImprovementType;
  /** Description of the issue */
  description: string;
  /** Suggested action */
  suggestedAction: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Estimated impact (0-1) */
  impact: number;
  /** Risk of applying (0-1) */
  risk: number;
  /** Related node IDs */
  relatedNodeIds: string[];
  /** Auto-applicable? */
  canAutoApply: boolean;
  /** When this was identified */
  identifiedAt: number;
}

/** An applied improvement */
export interface AppliedImprovement {
  /** The opportunity that was applied */
  opportunityId: string;
  /** What was done */
  actionTaken: string;
  /** Result */
  result: 'success' | 'partial' | 'failed';
  /** Before metric value */
  beforeMetric: number;
  /** After metric value */
  afterMetric: number;
  /** When it was applied */
  appliedAt: number;
}

/** Graph optimization report */
export interface GraphOptimizationReport {
  /** Total nodes before optimization */
  nodesBefore: number;
  /** Total nodes after optimization */
  nodesAfter: number;
  /** Nodes removed */
  nodesRemoved: number;
  /** Nodes merged */
  nodesMerged: number;
  /** Estimated time saved (ms) */
  estimatedTimeSaved: number;
  /** Improvements applied */
  improvements: AppliedImprovement[];
  /** When this report was generated */
  generatedAt: number;
}

/** Performance baseline for regression detection */
export interface PerformanceBaseline {
  /** Average step execution time (ms) */
  avgStepDuration: number;
  /** Average plan completion time (ms) */
  avgPlanDuration: number;
  /** Average retry rate */
  avgRetryRate: number;
  /** Average graph depth */
  avgGraphDepth: number;
  /** Node success rate */
  successRate: number;
  /** When this baseline was computed */
  computedAt: number;
  /** Number of samples */
  sampleCount: number;
}

/** Self-improvement metrics */
export interface SelfImprovementMetrics {
  /** Total opportunities identified */
  totalOpportunities: number;
  /** Total improvements applied */
  totalApplied: number;
  /** Success rate of applied improvements */
  applicationSuccessRate: number;
  /** Average impact of improvements */
  avgImpact: number;
  /** Nodes removed through optimization */
  nodesOptimized: number;
  /** Time of last analysis */
  lastAnalysisAt: number;
  /** Current performance baseline */
  baseline: PerformanceBaseline | null;
  /** Active regression alerts */
  regressionAlerts: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELF-IMPROVEMENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentSelfImprovement extends EventEmitter {
  private esm: ExecutionStateMachine;
  private metrics: SelfImprovementMetrics;
  private pendingOpportunities: Map<string, ImprovementOpportunity> = new Map();
  private appliedImprovements: AppliedImprovement[] = [];
  private baseline: PerformanceBaseline | null = null;
  private regressionAlerts: string[] = [];

  private readonly MAX_APPLIED_HISTORY = 200;
  private readonly REGRESSION_THRESHOLD = 1.5; // 50% worse than baseline triggers alert
  private readonly MIN_BASELINE_SAMPLES = 10;

  constructor(esm: ExecutionStateMachine) {
    super();
    this.esm = esm;
    this.setMaxListeners(30);

    this.metrics = {
      totalOpportunities: 0,
      totalApplied: 0,
      applicationSuccessRate: 0,
      avgImpact: 0,
      nodesOptimized: 0,
      lastAnalysisAt: 0,
      baseline: null,
      regressionAlerts: [],
    };
  }

  // ─── Analysis Engine ──────────────────────────────────────────────────

  /** Run a full self-analysis of the execution graph */
  analyze(): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];
    const timeline = this.esm.getTimeline();

    if (timeline.length < 2) return opportunities;

    // 1. Detect redundant nodes
    opportunities.push(...this.detectRedundantNodes(timeline));

    // 2. Detect stale nodes
    opportunities.push(...this.detectStaleNodes(timeline));

    // 3. Detect retry patterns
    opportunities.push(...this.detectRetryPatterns(timeline));

    // 4. Detect orphaned nodes
    opportunities.push(...this.detectOrphanedNodes(timeline));

    // 5. Detect performance regressions
    this.updateBaseline(timeline);
    opportunities.push(...this.detectRegressions(timeline));

    // Store opportunities
    for (const opp of opportunities) {
      this.pendingOpportunities.set(opp.id, opp);
      this.metrics.totalOpportunities++;
      this.emit('opportunity:identified', opp);
    }

    this.metrics.lastAnalysisAt = Date.now();
    logger.info('self-improvement', `Analysis complete: ${opportunities.length} opportunities identified`);

    return opportunities;
  }

  /** Detect nodes that are doing the same thing (redundant) */
  private detectRedundantNodes(timeline: ExecutionNode[]): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];
    const nodeSignatures: Map<string, ExecutionNode[]> = new Map();

    // Group nodes by their action signature
    for (const node of timeline) {
      const sig = this.computeNodeSignature(node);
      if (!nodeSignatures.has(sig)) {
        nodeSignatures.set(sig, []);
      }
      nodeSignatures.get(sig)!.push(node);
    }

    // Find groups with multiple nodes
    for (const [sig, nodes] of nodeSignatures) {
      if (nodes.length > 1) {
        const completedNodes = nodes.filter(n => n.state === 'completed');
        if (completedNodes.length > 1) {
          opportunities.push({
            id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'redundant_nodes',
            description: `${completedNodes.length} redundant nodes with same action: ${sig.slice(0, 80)}`,
            suggestedAction: 'Merge or remove redundant execution nodes',
            confidence: 0.8,
            impact: 0.3,
            risk: 0.1,
            relatedNodeIds: completedNodes.map(n => n.id),
            canAutoApply: true,
            identifiedAt: Date.now(),
          });
        }
      }
    }

    return opportunities;
  }

  /** Detect nodes that are no longer relevant (stale) */
  private detectStaleNodes(timeline: ExecutionNode[]): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];
    const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

    const staleNodes = timeline.filter(
      n => n.state === 'planned' && Date.now() - n.createdAt > STALE_THRESHOLD
    );

    if (staleNodes.length > 0) {
      opportunities.push({
        id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'stale_nodes',
        description: `${staleNodes.length} nodes have been in 'planned' state for 24+ hours`,
        suggestedAction: 'Cancel or archive stale planned nodes',
        confidence: 0.85,
        impact: 0.4,
        risk: 0.15,
        relatedNodeIds: staleNodes.map(n => n.id),
        canAutoApply: true,
        identifiedAt: Date.now(),
      });
    }

    return opportunities;
  }

  /** Detect nodes with excessive retries */
  private detectRetryPatterns(timeline: ExecutionNode[]): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];
    const failedNodes = timeline.filter(n => n.state === 'failed');

    // Group by similar action to find patterns
    const failureGroups: Map<string, ExecutionNode[]> = new Map();
    for (const node of failedNodes) {
      const key = `${node.type}:${(node.data as any)?.stepType ?? ''}`;
      if (!failureGroups.has(key)) failureGroups.set(key, []);
      failureGroups.get(key)!.push(node);
    }

    for (const [key, nodes] of failureGroups) {
      if (nodes.length >= 3) {
        opportunities.push({
          id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'retry_pattern',
          description: `Repeated failures for ${key}: ${nodes.length} failures`,
          suggestedAction: 'Analyze root cause of repeated failures — consider alternative approach',
          confidence: 0.75,
          impact: 0.6,
          risk: 0.2,
          relatedNodeIds: nodes.map(n => n.id),
          canAutoApply: false,
          identifiedAt: Date.now(),
        });
      }
    }

    return opportunities;
  }

  /** Detect nodes with no causal chain (orphaned) */
  private detectOrphanedNodes(timeline: ExecutionNode[]): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];
    const allNodeIds = new Set(timeline.map(n => n.id));

    const orphaned = timeline.filter(n => {
      // Root nodes with no children and no source links
      const hasChildren = n.childIds && n.childIds.length > 0;
      const hasSource = n.sourceIds && n.sourceIds.length > 0;
      const hasDependents = timeline.some(other =>
        other.dependsOn?.includes(n.id)
      );
      return !hasChildren && !hasSource && !hasDependents && n.state === 'completed';
    });

    if (orphaned.length > 5) {
      opportunities.push({
        id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'orphaned_nodes',
        description: `${orphaned.length} orphaned nodes with no causal chain`,
        suggestedAction: 'Archive orphaned nodes to reduce graph size',
        confidence: 0.7,
        impact: 0.2,
        risk: 0.05,
        relatedNodeIds: orphaned.map(n => n.id).slice(0, 10),
        canAutoApply: true,
        identifiedAt: Date.now(),
      });
    }

    return opportunities;
  }

  /** Update the performance baseline from current data */
  private updateBaseline(timeline: ExecutionNode[]): void {
    const completedNodes = timeline.filter(n => n.state === 'completed');
    if (completedNodes.length < this.MIN_BASELINE_SAMPLES) return;

    const durations = completedNodes
      .filter(n => n.result && (n.result as any).duration)
      .map(n => (n.result as any).duration as number);

    const failedNodes = timeline.filter(n => n.state === 'failed');

    this.baseline = {
      avgStepDuration: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
      avgPlanDuration: 0, // Would need plan-level tracking
      avgRetryRate: timeline.length > 0 ? failedNodes.length / timeline.length : 0,
      avgGraphDepth: this.computeGraphDepth(timeline),
      successRate: timeline.length > 0 ? completedNodes.length / timeline.length : 0,
      computedAt: Date.now(),
      sampleCount: completedNodes.length,
    };

    this.metrics.baseline = this.baseline;
  }

  /** Detect performance regressions compared to baseline */
  private detectRegressions(timeline: ExecutionNode[]): ImprovementOpportunity[] {
    const opportunities: ImprovementOpportunity[] = [];

    if (!this.baseline || this.baseline.sampleCount < this.MIN_BASELINE_SAMPLES) {
      return opportunities;
    }

    // Check recent failure rate vs baseline
    const recentNodes = timeline.filter(n => Date.now() - n.createdAt < 300_000); // Last 5 min
    if (recentNodes.length >= 5) {
      const recentFailures = recentNodes.filter(n => n.state === 'failed').length;
      const recentFailureRate = recentFailures / recentNodes.length;

      if (recentFailureRate > this.baseline.avgRetryRate * this.REGRESSION_THRESHOLD) {
        const alert = `Failure rate regression: ${(recentFailureRate * 100).toFixed(1)}% vs baseline ${(this.baseline.avgRetryRate * 100).toFixed(1)}%`;
        this.regressionAlerts.push(alert);
        this.metrics.regressionAlerts = [...this.regressionAlerts];

        opportunities.push({
          id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'performance_regression',
          description: alert,
          suggestedAction: 'Investigate recent failures — possible regression introduced',
          confidence: 0.65,
          impact: 0.8,
          risk: 0.3,
          relatedNodeIds: recentNodes.filter(n => n.state === 'failed').map(n => n.id),
          canAutoApply: false,
          identifiedAt: Date.now(),
        });
      }
    }

    return opportunities;
  }

  // ─── Graph Optimization ──────────────────────────────────────────────

  /** Apply optimizations to the execution graph */
  optimizeGraph(): GraphOptimizationReport {
    const timeline = this.esm.getTimeline();
    const nodesBefore = timeline.length;
    let nodesRemoved = 0;
    let nodesMerged = 0;
    const improvements: AppliedImprovement[] = [];

    // Apply safe auto-applicable improvements
    const autoApplicable = Array.from(this.pendingOpportunities.values())
      .filter(opp => opp.canAutoApply && opp.risk < 0.2);

    for (const opp of autoApplicable) {
      try {
        const result = this.applyImprovement(opp);
        improvements.push(result);

        if (result.result === 'success') {
          if (opp.type === 'redundant_nodes') nodesMerged += opp.relatedNodeIds.length - 1;
          if (opp.type === 'stale_nodes' || opp.type === 'orphaned_nodes') {
            nodesRemoved += opp.relatedNodeIds.length;
          }
        }

        this.pendingOpportunities.delete(opp.id);
      } catch (err) {
        logger.warn('self-improvement', `Failed to apply optimization: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const report: GraphOptimizationReport = {
      nodesBefore,
      nodesAfter: nodesBefore - nodesRemoved,
      nodesRemoved,
      nodesMerged,
      estimatedTimeSaved: nodesRemoved * 50, // Rough estimate
      improvements,
      generatedAt: Date.now(),
    };

    this.metrics.nodesOptimized += nodesRemoved + nodesMerged;
    this.emit('graph:optimized', report);
    logger.info('self-improvement', `Graph optimized: removed ${nodesRemoved}, merged ${nodesMerged} nodes`);

    return report;
  }

  /** Apply a single improvement */
  private applyImprovement(opp: ImprovementOpportunity): AppliedImprovement {
    const beforeMetric = this.computeGraphMetric();

    switch (opp.type) {
      case 'stale_nodes': {
        // Cancel stale planned nodes
        for (const nodeId of opp.relatedNodeIds) {
          try {
            this.esm.transitionNode(nodeId, 'cancelled');
          } catch {
            try { this.esm.deleteNode(nodeId); } catch { /* skip */ }
          }
        }
        break;
      }

      case 'orphaned_nodes': {
        // Remove orphaned completed nodes
        for (const nodeId of opp.relatedNodeIds) {
          try {
            this.esm.deleteNode(nodeId);
          } catch { /* skip */ }
        }
        break;
      }

      case 'redundant_nodes': {
        // Keep only the most recent node, delete the rest
        const nodesToKeep = 1;
        for (let i = 0; i < opp.relatedNodeIds.length - nodesToKeep; i++) {
          try {
            this.esm.deleteNode(opp.relatedNodeIds[i]);
          } catch { /* skip */ }
        }
        break;
      }

      default:
        throw new Error(`Cannot auto-apply improvement type: ${opp.type}`);
    }

    const afterMetric = this.computeGraphMetric();
    const applied: AppliedImprovement = {
      opportunityId: opp.id,
      actionTaken: opp.suggestedAction,
      result: afterMetric <= beforeMetric ? 'success' : 'partial',
      beforeMetric,
      afterMetric,
      appliedAt: Date.now(),
    };

    this.appliedImprovements.push(applied);
    if (this.appliedImprovements.length > this.MAX_APPLIED_HISTORY) {
      this.appliedImprovements = this.appliedImprovements.slice(-this.MAX_APPLIED_HISTORY);
    }

    this.metrics.totalApplied++;
    this.updateApplicationMetrics();

    return applied;
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  /** Compute a node signature for deduplication */
  private computeNodeSignature(node: ExecutionNode): string {
    const data = node.data as any;
    const parts = [
      node.type,
      data?.stepType ?? data?.kind ?? '',
      data?.filePath ?? data?.command ?? '',
      data?.action ?? '',
    ];
    return parts.filter(Boolean).join('|');
  }

  /** Compute a graph health metric (lower is better) */
  private computeGraphMetric(): number {
    const timeline = this.esm.getTimeline();
    const failed = timeline.filter(n => n.state === 'failed').length;
    const stale = timeline.filter(n => n.state === 'planned' && Date.now() - n.createdAt > 86_400_000).length;
    return failed * 3 + stale * 1 + timeline.length * 0.01;
  }

  /** Compute graph depth */
  private computeGraphDepth(timeline: ExecutionNode[]): number {
    const childSet = new Set<string>();
    for (const node of timeline) {
      for (const childId of (node.childIds ?? [])) {
        childSet.add(childId);
      }
    }
    // Depth = nodes that are NOT children = root count approximation
    return timeline.length > 0 ? Math.log2(timeline.length) : 0;
  }

  /** Update application success rate */
  private updateApplicationMetrics(): void {
    if (this.appliedImprovements.length === 0) return;

    const successes = this.appliedImprovements.filter(i => i.result === 'success').length;
    this.metrics.applicationSuccessRate = successes / this.appliedImprovements.length;

    const totalImpact = this.appliedImprovements.reduce((sum, i) => {
      return sum + Math.max(0, i.beforeMetric - i.afterMetric);
    }, 0);
    this.metrics.avgImpact = totalImpact / this.appliedImprovements.length;
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /** Get all pending improvement opportunities */
  getPendingOpportunities(): ImprovementOpportunity[] {
    return Array.from(this.pendingOpportunities.values());
  }

  /** Get applied improvement history */
  getAppliedImprovements(limit: number = 50): AppliedImprovement[] {
    return this.appliedImprovements.slice(-limit);
  }

  /** Get current metrics */
  getMetrics(): SelfImprovementMetrics {
    return { ...this.metrics };
  }

  /** Get regression alerts */
  getRegressionAlerts(): string[] {
    return [...this.regressionAlerts];
  }

  /** Clear regression alerts */
  clearRegressionAlerts(): void {
    this.regressionAlerts = [];
    this.metrics.regressionAlerts = [];
  }

  /** Dismiss a pending opportunity */
  dismissOpportunity(id: string): void {
    this.pendingOpportunities.delete(id);
  }

  /** Force-apply a specific improvement (even if not auto-applicable) */
  forceApplyImprovement(id: string): AppliedImprovement | null {
    const opp = this.pendingOpportunities.get(id);
    if (!opp) return null;

    try {
      const result = this.applyImprovement(opp);
      this.pendingOpportunities.delete(id);
      return result;
    } catch (err) {
      logger.error('self-improvement', `Force apply failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let agentSelfImprovement: AgentSelfImprovement | null = null;

export function getAgentSelfImprovement(esm?: ExecutionStateMachine): AgentSelfImprovement {
  if (!agentSelfImprovement && esm) {
    agentSelfImprovement = new AgentSelfImprovement(esm);
  }
  if (!agentSelfImprovement) {
    throw new Error('AgentSelfImprovement not initialized — call getAgentSelfImprovement(esm) first');
  }
  return agentSelfImprovement;
}

export function resetAgentSelfImprovement(esm: ExecutionStateMachine): AgentSelfImprovement {
  agentSelfImprovement = new AgentSelfImprovement(esm);
  return agentSelfImprovement;
}
