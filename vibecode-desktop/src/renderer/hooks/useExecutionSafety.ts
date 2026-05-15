// ============================================================
// VibeCode Desktop — useExecutionSafety React Hook
// Trust & Execution Safety system for the renderer layer
//
// ⚠️  DEPRECATED — ARC 12
// This hook is deprecated. Use useExecutionStateMachine instead.
// It now delegates entirely to the ExecutionStateMachine (ESM)
// and keeps the same return interface for backward compatibility.
// ============================================================

import { useCallback, useMemo } from 'react';
import { useExecutionStateMachine } from './useExecutionStateMachine';
import type { ExecutionNode } from './useExecutionStateMachine';

// ─── Public Types (kept for backward compatibility) ──────────────────────────

export interface StepRiskAssessment {
  stepId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  factors: RiskFactor[];
  canAutoApprove: boolean;
  requiresManualReview: boolean;
}

export interface RiskFactor {
  type: 'file_delete' | 'file_overwrite' | 'command_execution' | 'dependency_change' | 'config_change' | 'large_change';
  description: string;
  severity: 'info' | 'warning' | 'danger';
  affectedPaths: string[];
}

export interface SafetyWarning {
  id: string;
  type: 'high_risk_operation' | 'destructive_action' | 'unreviewed_change' | 'dependency_conflict' | 'config_modification';
  message: string;
  stepId: string;
  timestamp: number;
  dismissed: boolean;
}

export interface SafeExecutionResult {
  success: boolean;
  approvedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  rolledBack: boolean;
  safetyScore: number;
}

export interface ExecutionPreview {
  planId: string;
  totalSteps: number;
  safeSteps: number;
  riskySteps: number;
  affectedFiles: string[];
  estimatedImpact: 'minimal' | 'moderate' | 'significant' | 'major';
  diffSummary: {
    additions: number;
    deletions: number;
    filesChanged: number;
  };
  rollbackAvailable: boolean;
}

export interface RollbackPreview {
  stepId: string;
  canRollback: boolean;
  originalContent?: string;
  newContent?: string;
  affectedFiles: string[];
  snapshotTimestamp: number;
}

export interface UseExecutionSafetyReturn {
  /** Overall safety score for the current plan (0-100) */
  safetyScore: number;
  /** Risk assessment for each step */
  stepRisks: Map<string, StepRiskAssessment>;
  /** Whether there are any warnings */
  hasWarnings: boolean;
  /** Active warnings list */
  warnings: SafetyWarning[];
  /** Whether approval is needed before executing */
  needsApproval: boolean;
  /** Preview a plan's safety before executing */
  assessPlan: (planId: string) => Promise<void>;
  /** Assess a single step */
  assessStep: (stepId: string) => Promise<void>;
  /** Approve and execute with safety checks */
  safeExecute: (planId: string) => Promise<SafeExecutionResult>;
  /** Preview what will happen (diffs) before executing */
  previewExecution: (planId: string) => Promise<ExecutionPreview>;
  /** Get rollback snapshot info */
  getRollbackInfo: (stepId: string) => Promise<RollbackPreview>;
  /** Dismiss a warning */
  dismissWarning: (warningId: string) => void;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Convert an ESM ExecutionNode to a legacy StepRiskAssessment */
function nodeToRiskAssessment(node: ExecutionNode): StepRiskAssessment {
  return {
    stepId: node.id,
    riskLevel: node.riskLevel,
    confidence: node.safetyScore,
    factors: [],
    canAutoApprove: node.riskLevel === 'low' && !node.requiresApproval,
    requiresManualReview: node.riskLevel === 'high' || node.riskLevel === 'critical' || node.requiresApproval,
  };
}

/** Convert an ESM ExecutionNode to a legacy SafetyWarning if it warrants one */
function nodeToWarning(node: ExecutionNode): SafetyWarning | null {
  // Only warn on nodes with low safety scores or that require approval
  if (node.safetyScore >= 80 && !node.requiresApproval) return null;

  let type: SafetyWarning['type'] = 'unreviewed_change';
  let message = `Step "${node.title}" requires review`;

  if (node.riskLevel === 'critical') {
    type = 'destructive_action';
    message = `Step "${node.title}" is a destructive action`;
  } else if (node.riskLevel === 'high') {
    type = 'high_risk_operation';
    message = `Step "${node.title}" is a high-risk operation`;
  } else if (node.requiresApproval) {
    type = 'unreviewed_change';
    message = `Step "${node.title}" requires manual approval`;
  } else if (node.safetyScore < 60) {
    type = 'config_modification';
    message = `Step "${node.title}" has a low safety score (${node.safetyScore})`;
  }

  return {
    id: `warn-${node.id}`,
    type,
    message,
    stepId: node.id,
    timestamp: node.updatedAt,
    dismissed: node.state === 'completed' || node.state === 'cancelled' || node.state === 'rolled_back',
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useExecutionSafety(): UseExecutionSafetyReturn {
  console.warn('[VibeCode] useExecutionSafety is deprecated. Use useExecutionStateMachine instead.');

  const {
    nodes,
    getPlans,
    getChildren,
    runSafetyCheck,
    createPlan,
    approvePlan,
    executePlan,
  } = useExecutionStateMachine();

  // ── Derive safety data from ESM graph ──

  const allStepNodes = useMemo(() => {
    const steps: ExecutionNode[] = [];
    const plans = getPlans();
    for (const plan of plans) {
      const children = getChildren(plan.id);
      steps.push(...children);
    }
    return steps;
  }, [nodes, getPlans, getChildren]);

  const stepRisks = useMemo(() => {
    const map = new Map<string, StepRiskAssessment>();
    for (const node of allStepNodes) {
      map.set(node.id, nodeToRiskAssessment(node));
    }
    return map;
  }, [allStepNodes]);

  const warnings = useMemo(() => {
    const ws: SafetyWarning[] = [];
    for (const node of allStepNodes) {
      const w = nodeToWarning(node);
      if (w) ws.push(w);
    }
    return ws;
  }, [allStepNodes]);

  const safetyScore = useMemo(() => {
    if (allStepNodes.length === 0) return 100;
    const total = allStepNodes.reduce((sum, n) => sum + n.safetyScore, 0);
    return Math.round(total / allStepNodes.length);
  }, [allStepNodes]);

  const hasWarnings = useMemo(() => {
    return warnings.some((w) => !w.dismissed);
  }, [warnings]);

  const needsApproval = useMemo(() => {
    return allStepNodes.some((n) => n.requiresApproval);
  }, [allStepNodes]);

  // ── Actions (delegated to ESM) ──

  const assessPlan = useCallback(async (_planId: string) => {
    // Delegate to ESM's runSafetyCheck for the plan's step nodes
    const plan = getPlans().find((p) => p.id === _planId);
    if (plan) {
      const children = getChildren(_planId);
      await runSafetyCheck(children.map((c) => c.id));
    }
  }, [getPlans, getChildren, runSafetyCheck]);

  const assessStep = useCallback(async (stepId: string) => {
    // Delegate to ESM's runSafetyCheck for a single node
    await runSafetyCheck([stepId]);
  }, [runSafetyCheck]);

  const safeExecute = useCallback(async (planId: string): Promise<SafeExecutionResult> => {
    // Delegate to ESM's createPlan + approvePlan + executePlan flow
    const planNode = getPlans().find((p) => p.id === planId);

    // If plan needs approval, approve it first
    if (planNode?.state === 'planned') {
      await approvePlan(planId);
    }

    // Execute the plan
    const result = await executePlan(planId);

    // Build the result from the updated graph
    const children = getChildren(planId);
    const approvedSteps = children.filter((c) => c.state === 'completed').length;
    const failedSteps = children.filter((c) => c.state === 'failed').length;
    const skippedSteps = children.filter((c) => c.state === 'cancelled').length;

    return {
      success: result !== null && failedSteps === 0,
      approvedSteps,
      skippedSteps,
      failedSteps,
      rolledBack: false,
      safetyScore,
    };
  }, [getPlans, approvePlan, executePlan, getChildren, safetyScore]);

  const previewExecution = useCallback(async (_planId: string): Promise<ExecutionPreview> => {
    const plans = getPlans();
    const plan = plans.find((p) => p.id === _planId);
    const children = plan ? getChildren(_planId) : [];

    const safeSteps = children.filter((c) => c.safetyScore >= 80).length;
    const riskySteps = children.length - safeSteps;
    const affectedFiles: string[] = [];

    for (const child of children) {
      const filePath = (child.data?.filePath as string) ?? (child.data?.path as string);
      if (filePath && !affectedFiles.includes(filePath)) {
        affectedFiles.push(filePath);
      }
    }

    const totalChanges = children.reduce((sum, c) => {
      return sum + ((c.data?.additions as number) ?? 0) + ((c.data?.deletions as number) ?? 0);
    }, 0);

    let estimatedImpact: ExecutionPreview['estimatedImpact'] = 'minimal';
    if (riskySteps > children.length * 0.5 || totalChanges > 500 || affectedFiles.length > 10) {
      estimatedImpact = 'major';
    } else if (riskySteps > children.length * 0.25 || totalChanges > 200 || affectedFiles.length > 5) {
      estimatedImpact = 'significant';
    } else if (riskySteps > 0 || totalChanges > 50 || affectedFiles.length > 2) {
      estimatedImpact = 'moderate';
    }

    return {
      planId: _planId,
      totalSteps: children.length,
      safeSteps,
      riskySteps,
      affectedFiles,
      estimatedImpact,
      diffSummary: { additions: 0, deletions: 0, filesChanged: 0 },
      rollbackAvailable: children.some((c) => c.state === 'completed'),
    };
  }, [getPlans, getChildren]);

  const getRollbackInfo = useCallback(async (stepId: string): Promise<RollbackPreview> => {
    const node = nodes.get(stepId);
    if (!node) {
      return {
        stepId,
        canRollback: false,
        affectedFiles: [],
        snapshotTimestamp: 0,
      };
    }

    const filePath = (node.data?.filePath as string) ?? (node.data?.path as string);
    const affectedFiles: string[] = filePath ? [filePath] : [];

    return {
      stepId,
      canRollback: node.state === 'completed',
      originalContent: node.data?.originalContent as string | undefined,
      newContent: node.data?.newContent as string | undefined,
      affectedFiles,
      snapshotTimestamp: node.completedAt ?? 0,
    };
  }, [nodes]);

  const dismissWarning = useCallback((_warningId: string) => {
    // No-op: warnings are now derived from the ESM graph state,
    // not managed as local state. They update automatically as
    // node states change.
  }, []);

  return {
    safetyScore,
    stepRisks,
    hasWarnings,
    warnings,
    needsApproval,
    assessPlan,
    assessStep,
    safeExecute,
    previewExecution,
    getRollbackInfo,
    dismissWarning,
  };
}
