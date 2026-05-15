// ─── VibeCode Desktop — Stability Metrics Collector (ARC 18) ────────────────
// POST-KERNEL REAL-WORLD VALIDATION
//
// This module tracks system stability metrics during adversarial testing.
// It records graph consistency, node rates, safety gate accuracy, latency,
// and UX impact data for the ARC 18 breakage report.
//
// This is a TEST-ONLY module — not imported in production code.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ExecutionStateMachine,
  ExecutionNode,
  NodeState,
} from '../services/execution-state-machine';

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GraphConsistencyMetrics {
  /** Total number of nodes created during test */
  totalNodesCreated: number;
  /** Number of nodes that reached terminal state (completed/failed/cancelled) */
  terminalNodes: number;
  /** Number of nodes stuck in non-terminal states after test */
  stuckNodes: number;
  /** Number of duplicate node IDs detected */
  duplicateNodeIds: number;
  /** Number of orphaned nodes (parentId references non-existent node) */
  orphanedNodes: number;
  /** Number of broken parent→child links */
  brokenParentChildLinks: number;
  /** Number of broken source link references */
  brokenSourceLinks: number;
  /** Whether the graph is self-consistent */
  isConsistent: boolean;
}

export interface SafetyGateMetrics {
  /** Number of operations blocked by safety gate (true positives) */
  blockedCorrectly: number;
  /** Number of dangerous operations that slipped through (false negatives) */
  falseNegatives: number;
  /** Number of safe operations incorrectly blocked (false positives) */
  falsePositives: number;
  /** Number of operations that required approval */
  approvalRequired: number;
  /** Number of operations auto-approved */
  autoApproved: number;
  /** Accuracy: (blockedCorrectly + autoApproved) / total */
  accuracy: number;
  /** False positive rate */
  falsePositiveRate: number;
  /** False negative rate */
  falseNegativeRate: number;
}

export interface LatencyMetrics {
  /** Time to create a node through gateway (ms) */
  nodeCreationLatencies: number[];
  /** Time from request to execution start (ms) */
  executionStartLatencies: number[];
  /** Time for full execution cycle (ms) */
  fullExecutionLatencies: number[];
  /** Average node creation latency */
  avgNodeCreation: number;
  /** P95 node creation latency */
  p95NodeCreation: number;
  /** P99 node creation latency */
  p99NodeCreation: number;
  /** Average full execution latency */
  avgFullExecution: number;
  /** P95 full execution latency */
  p95FullExecution: number;
}

export interface ConcurrencyMetrics {
  /** Total concurrent operations tested */
  concurrentOps: number;
  /** Number of operations that succeeded under concurrency */
  succeeded: number;
  /** Number of operations that failed under concurrency */
  failed: number;
  /** Number of graph corruption events detected */
  graphCorruptions: number;
  /** Number of lost updates (node data overwritten) */
  lostUpdates: number;
  /** Number of inconsistent node orderings */
  inconsistentOrderings: number;
  /** Whether the graph remained consistent under load */
  consistentUnderLoad: boolean;
}

export interface UXImpactMetrics {
  /** Average gateway overhead per operation (ms) */
  avgGatewayOverhead: number;
  /** Maximum gateway overhead observed (ms) */
  maxGatewayOverhead: number;
  /** Whether terminal responsiveness is acceptable (< 50ms overhead) */
  terminalResponsivenessOk: boolean;
  /** Whether editor responsiveness is acceptable (< 100ms overhead) */
  editorResponsivenessOk: boolean;
  /** Whether AI response delay is acceptable (< 200ms overhead) */
  aiResponseDelayOk: boolean;
  /** Overall UX impact score (0-100, 100 = no perceptible impact) */
  uxImpactScore: number;
}

export interface FailureRecord {
  /** Unique ID for this failure */
  id: string;
  /** Failure category */
  category: 'CRITICAL' | 'MAJOR' | 'MINOR';
  /** The P0 module where failure occurred */
  module: string;
  /** Description of the failure */
  description: string;
  /** Expected behavior */
  expected: string;
  /** Actual behavior */
  actual: string;
  /** Stack trace if available */
  stack?: string;
  /** Timestamp */
  timestamp: number;
}

export interface BreakageReport {
  /** System stability score (0-100) */
  systemStabilityScore: number;
  /** Graph consistency score (0-100) */
  graphConsistencyScore: number;
  /** UX impact score (0-100) */
  uxImpactScore: number;
  /** All failures recorded */
  failures: FailureRecord[];
  /** Graph consistency metrics */
  graphMetrics: GraphConsistencyMetrics;
  /** Safety gate metrics */
  safetyMetrics: SafetyGateMetrics;
  /** Latency metrics */
  latencyMetrics: LatencyMetrics;
  /** Concurrency metrics */
  concurrencyMetrics: ConcurrencyMetrics;
  /** UX impact metrics */
  uxMetrics: UXImpactMetrics;
  /** Final recommendation */
  recommendation: 'SHIP' | 'FIX_BEFORE_SHIP' | 'KERNEL_OVER_ENGINEERED';
  /** Report generation timestamp */
  generatedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STABILITY METRICS COLLECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export class StabilityMetricsCollector {
  private nodeCreationLatencies: number[] = [];
  private executionStartLatencies: number[] = [];
  private fullExecutionLatencies: number[] = [];
  private gatewayOverheads: number[] = [];

  private safetyBlockedCorrectly = 0;
  private safetyFalseNegatives = 0;
  private safetyFalsePositives = 0;
  private safetyApprovalRequired = 0;
  private safetyAutoApproved = 0;

  private concurrentSucceeded = 0;
  private concurrentFailed = 0;
  private concurrentCorruptions = 0;
  private concurrentLostUpdates = 0;
  private concurrentInconsistentOrderings = 0;

  private failures: FailureRecord[] = [];
  private failureIdCounter = 0;

  // ─── Latency Tracking ──────────────────────────────────────────────────

  /** Record a node creation latency measurement */
  recordNodeCreation(latencyMs: number): void {
    this.nodeCreationLatencies.push(latencyMs);
  }

  /** Record an execution start latency measurement */
  recordExecutionStart(latencyMs: number): void {
    this.executionStartLatencies.push(latencyMs);
  }

  /** Record a full execution cycle latency measurement */
  recordFullExecution(latencyMs: number): void {
    this.fullExecutionLatencies.push(latencyMs);
  }

  /** Record gateway overhead measurement */
  recordGatewayOverhead(overheadMs: number): void {
    this.gatewayOverheads.push(overheadMs);
  }

  // ─── Safety Gate Tracking ──────────────────────────────────────────────

  /** Record a correctly blocked dangerous operation */
  recordSafetyBlock(): void {
    this.safetyBlockedCorrectly++;
  }

  /** Record a false negative (dangerous op slipped through) */
  recordSafetyFalseNegative(): void {
    this.safetyFalseNegatives++;
  }

  /** Record a false positive (safe op incorrectly blocked) */
  recordSafetyFalsePositive(): void {
    this.safetyFalsePositives++;
  }

  /** Record an approval requirement */
  recordApprovalRequired(): void {
    this.safetyApprovalRequired++;
  }

  /** Record an auto-approval */
  recordAutoApproval(): void {
    this.safetyAutoApproved++;
  }

  // ─── Concurrency Tracking ─────────────────────────────────────────────

  /** Record a concurrent operation success */
  recordConcurrentSuccess(): void {
    this.concurrentSucceeded++;
  }

  /** Record a concurrent operation failure */
  recordConcurrentFailure(): void {
    this.concurrentFailed++;
  }

  /** Record a graph corruption event */
  recordGraphCorruption(): void {
    this.concurrentCorruptions++;
  }

  /** Record a lost update */
  recordLostUpdate(): void {
    this.concurrentLostUpdates++;
  }

  /** Record an inconsistent ordering */
  recordInconsistentOrdering(): void {
    this.concurrentInconsistentOrderings++;
  }

  // ─── Failure Recording ────────────────────────────────────────────────

  /** Record a failure */
  recordFailure(failure: Omit<FailureRecord, 'id' | 'timestamp'>): void {
    this.failures.push({
      ...failure,
      id: `FAIL-${++this.failureIdCounter}`,
      timestamp: Date.now(),
    });
  }

  // ─── Graph Consistency Check ───────────────────────────────────────────

  /** Check the execution graph for consistency issues */
  checkGraphConsistency(esm: ExecutionStateMachine): GraphConsistencyMetrics {
    const snapshot = esm.getGraphSnapshot();
    const nodes = snapshot.nodes;
    const nodeIds = new Set(nodes.map(n => n.id));

    let duplicateNodeIds = 0;
    const seenIds = new Set<string>();
    for (const node of nodes) {
      if (seenIds.has(node.id)) duplicateNodeIds++;
      seenIds.add(node.id);
    }

    let orphanedNodes = 0;
    let brokenParentChildLinks = 0;
    let brokenSourceLinks = 0;

    for (const node of nodes) {
      // Check parent exists
      if (node.parentId && !nodeIds.has(node.parentId)) {
        orphanedNodes++;
      }

      // Check parent→child bidirectional links
      if (node.parentId) {
        const parent = esm.getNode(node.parentId);
        if (parent && !parent.childIds.includes(node.id)) {
          brokenParentChildLinks++;
        }
      }

      // Check children exist
      for (const childId of node.childIds) {
        if (!nodeIds.has(childId)) {
          brokenParentChildLinks++;
        }
      }

      // Check source links
      for (const sourceId of node.sourceIds) {
        if (!nodeIds.has(sourceId)) {
          brokenSourceLinks++;
        }
      }
    }

    const terminalStates: NodeState[] = ['completed', 'failed', 'rolled_back', 'cancelled'];
    const terminalNodes = nodes.filter(n => terminalStates.includes(n.state)).length;
    const stuckNodes = nodes.filter(n => !terminalStates.includes(n.state) && n.state !== 'planned' && n.state !== 'approved').length;

    const isConsistent =
      duplicateNodeIds === 0 &&
      orphanedNodes === 0 &&
      brokenParentChildLinks === 0 &&
      brokenSourceLinks === 0;

    return {
      totalNodesCreated: nodes.length,
      terminalNodes,
      stuckNodes,
      duplicateNodeIds,
      orphanedNodes,
      brokenParentChildLinks,
      brokenSourceLinks,
      isConsistent,
    };
  }

  // ─── Report Generation ─────────────────────────────────────────────────

  /** Compute percentile from array of values */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /** Compute average from array of values */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /** Generate the final breakage report */
  generateReport(esm: ExecutionStateMachine): BreakageReport {
    const graphMetrics = this.checkGraphConsistency(esm);

    const totalSafetyOps = this.safetyBlockedCorrectly + this.safetyFalseNegatives + this.safetyAutoApproved + this.safetyFalsePositives;
    const safetyMetrics: SafetyGateMetrics = {
      blockedCorrectly: this.safetyBlockedCorrectly,
      falseNegatives: this.safetyFalseNegatives,
      falsePositives: this.safetyFalsePositives,
      approvalRequired: this.safetyApprovalRequired,
      autoApproved: this.safetyAutoApproved,
      accuracy: totalSafetyOps > 0 ? (this.safetyBlockedCorrectly + this.safetyAutoApproved) / totalSafetyOps : 1,
      falsePositiveRate: totalSafetyOps > 0 ? this.safetyFalsePositives / totalSafetyOps : 0,
      falseNegativeRate: totalSafetyOps > 0 ? this.safetyFalseNegatives / totalSafetyOps : 0,
    };

    const latencyMetrics: LatencyMetrics = {
      nodeCreationLatencies: this.nodeCreationLatencies,
      executionStartLatencies: this.executionStartLatencies,
      fullExecutionLatencies: this.fullExecutionLatencies,
      avgNodeCreation: this.average(this.nodeCreationLatencies),
      p95NodeCreation: this.percentile(this.nodeCreationLatencies, 95),
      p99NodeCreation: this.percentile(this.nodeCreationLatencies, 99),
      avgFullExecution: this.average(this.fullExecutionLatencies),
      p95FullExecution: this.percentile(this.fullExecutionLatencies, 95),
    };

    const concurrentOps = this.concurrentSucceeded + this.concurrentFailed;
    const concurrencyMetrics: ConcurrencyMetrics = {
      concurrentOps,
      succeeded: this.concurrentSucceeded,
      failed: this.concurrentFailed,
      graphCorruptions: this.concurrentCorruptions,
      lostUpdates: this.concurrentLostUpdates,
      inconsistentOrderings: this.concurrentInconsistentOrderings,
      consistentUnderLoad: this.concurrentCorruptions === 0 && this.concurrentLostUpdates === 0,
    };

    const avgOverhead = this.average(this.gatewayOverheads);
    const maxOverhead = this.gatewayOverheads.length > 0 ? Math.max(...this.gatewayOverheads) : 0;
    const terminalOk = avgOverhead < 50;
    const editorOk = avgOverhead < 100;
    const aiOk = avgOverhead < 200;

    const uxMetrics: UXImpactMetrics = {
      avgGatewayOverhead: avgOverhead,
      maxGatewayOverhead: maxOverhead,
      terminalResponsivenessOk: terminalOk,
      editorResponsivenessOk: editorOk,
      aiResponseDelayOk: aiOk,
      uxImpactScore: Math.max(0, Math.min(100, 100 - (avgOverhead * 2))),
    };

    // ─── Compute Scores ──────────────────────────────────────────────────

    // Graph consistency score
    const graphConsistencyScore = graphMetrics.isConsistent
      ? Math.max(0, 100 - (graphMetrics.orphanedNodes * 10) - (graphMetrics.brokenParentChildLinks * 10) - (graphMetrics.brokenSourceLinks * 5) - (graphMetrics.stuckNodes * 2))
      : Math.max(0, 50 - (graphMetrics.orphanedNodes * 10) - (graphMetrics.brokenParentChildLinks * 10));

    // System stability score: weighted average
    const criticalFailures = this.failures.filter(f => f.category === 'CRITICAL').length;
    const majorFailures = this.failures.filter(f => f.category === 'MAJOR').length;
    const minorFailures = this.failures.filter(f => f.category === 'MINOR').length;

    const systemStabilityScore = Math.max(0, Math.min(100,
      100
      - (criticalFailures * 25)
      - (majorFailures * 10)
      - (minorFailures * 3)
      - (safetyMetrics.falseNegativeRate * 50)
      - (concurrencyMetrics.graphCorruptions * 20)
    ));

    // UX impact score (from metrics)
    const uxImpactScore = uxMetrics.uxImpactScore;

    // ─── Recommendation ──────────────────────────────────────────────────

    let recommendation: BreakageReport['recommendation'];
    if (systemStabilityScore >= 90 && criticalFailures === 0 && graphConsistencyScore >= 90) {
      recommendation = 'SHIP';
    } else if (criticalFailures > 0 || systemStabilityScore < 70 || graphConsistencyScore < 70) {
      recommendation = 'FIX_BEFORE_SHIP';
    } else if (uxImpactScore < 50 && systemStabilityScore >= 80) {
      recommendation = 'KERNEL_OVER_ENGINEERED';
    } else {
      recommendation = 'FIX_BEFORE_SHIP';
    }

    return {
      systemStabilityScore,
      graphConsistencyScore,
      uxImpactScore,
      failures: [...this.failures],
      graphMetrics,
      safetyMetrics,
      latencyMetrics,
      concurrencyMetrics,
      uxMetrics,
      recommendation,
      generatedAt: Date.now(),
    };
  }

  /** Reset all collected metrics */
  reset(): void {
    this.nodeCreationLatencies = [];
    this.executionStartLatencies = [];
    this.fullExecutionLatencies = [];
    this.gatewayOverheads = [];
    this.safetyBlockedCorrectly = 0;
    this.safetyFalseNegatives = 0;
    this.safetyFalsePositives = 0;
    this.safetyApprovalRequired = 0;
    this.safetyAutoApproved = 0;
    this.concurrentSucceeded = 0;
    this.concurrentFailed = 0;
    this.concurrentCorruptions = 0;
    this.concurrentLostUpdates = 0;
    this.concurrentInconsistentOrderings = 0;
    this.failures = [];
    this.failureIdCounter = 0;
  }
}

/** Module-level singleton for test use */
export const stabilityMetrics = new StabilityMetricsCollector();
