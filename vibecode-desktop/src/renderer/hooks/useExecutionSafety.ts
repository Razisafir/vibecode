// ============================================================
// VibeCode Desktop — useExecutionSafety React Hook
// Trust & Execution Safety system for the renderer layer
// ============================================================

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ExecutionStep, StepType, DiffResult } from '../types';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface StepRiskAssessment {
  stepId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
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

/** Map a StepType to a base risk weight (higher = riskier) */
function stepTypeBaseRisk(type: StepType): number {
  switch (type) {
    case 'file_delete':
      return 80;
    case 'command':
      return 55;
    case 'file_edit':
      return 35;
    case 'code_generation':
      return 30;
    case 'file_create':
      return 15;
    case 'analysis':
      return 5;
    case 'review':
      return 5;
    case 'test':
      return 10;
    default:
      return 25;
  }
}

/** Determine risk level from a numeric score */
function scoreToRiskLevel(score: number): StepRiskAssessment['riskLevel'] {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/** Identify risk factors for a given execution step */
function identifyRiskFactors(step: ExecutionStep): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const params = step.params ?? {};
  const filePath = (params.filePath as string) ?? (params.path as string) ?? '';
  const paths: string[] = filePath ? [filePath] : [];

  switch (step.type) {
    case 'file_delete':
      factors.push({
        type: 'file_delete',
        description: filePath
          ? `Deleting file: ${filePath}`
          : 'File deletion operation',
        severity: 'danger',
        affectedPaths: paths,
      });
      break;

    case 'command':
      factors.push({
        type: 'command_execution',
        description: params.command
          ? `Running command: ${(params.command as string).slice(0, 80)}`
          : 'Command execution',
        severity: 'warning',
        affectedPaths: paths,
      });
      // Detect dependency changes via package managers
      const cmd = (params.command as string) ?? '';
      if (/\b(npm|i|install|add|remove|uninstall|yarn|pnpm)\b/.test(cmd)) {
        factors.push({
          type: 'dependency_change',
          description: 'Command may modify project dependencies',
          severity: 'warning',
          affectedPaths: paths,
        });
      }
      break;

    case 'file_edit':
      factors.push({
        type: 'file_overwrite',
        description: filePath
          ? `Modifying existing file: ${filePath}`
          : 'File modification',
        severity: 'warning',
        affectedPaths: paths,
      });
      // Detect config file edits
      if (/\.(json|yaml|yml|toml|env|config|rc)$/i.test(filePath)) {
        factors.push({
          type: 'config_change',
          description: `Configuration file being modified: ${filePath}`,
          severity: 'warning',
          affectedPaths: paths,
        });
      }
      break;

    case 'code_generation':
      factors.push({
        type: 'file_overwrite',
        description: filePath
          ? `Generating code for: ${filePath}`
          : 'Code generation step',
        severity: 'info',
        affectedPaths: paths,
      });
      break;

    default:
      break;
  }

  return factors;
}

/** Build a SafetyWarning from a risky step */
function buildWarning(step: ExecutionStep, factors: RiskFactor[]): SafetyWarning | null {
  const dangerFactors = factors.filter((f) => f.severity === 'danger');
  const warningFactors = factors.filter((f) => f.severity === 'warning');

  if (dangerFactors.length > 0) {
    return {
      id: `warn-${step.id}-${Date.now()}`,
      type: 'destructive_action',
      message: dangerFactors.map((f) => f.description).join('; '),
      stepId: step.id,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  if (step.type === 'file_delete') {
    return {
      id: `warn-${step.id}-${Date.now()}`,
      type: 'destructive_action',
      message: `Step "${step.title}" involves file deletion`,
      stepId: step.id,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  if (warningFactors.some((f) => f.type === 'dependency_change')) {
    return {
      id: `warn-${step.id}-${Date.now()}`,
      type: 'dependency_conflict',
      message: `Step "${step.title}" may modify project dependencies`,
      stepId: step.id,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  if (warningFactors.some((f) => f.type === 'config_change')) {
    return {
      id: `warn-${step.id}-${Date.now()}`,
      type: 'config_modification',
      message: `Step "${step.title}" modifies a configuration file`,
      stepId: step.id,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  if (step.riskLevel === 'high' || scoreToRiskLevel(stepTypeBaseRisk(step.type)) === 'high') {
    return {
      id: `warn-${step.id}-${Date.now()}`,
      type: 'high_risk_operation',
      message: `Step "${step.title}" is classified as high risk`,
      stepId: step.id,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  if (step.requiresApproval && step.status === 'pending') {
    return {
      id: `warn-${step.id}-${Date.now()}`,
      type: 'unreviewed_change',
      message: `Step "${step.title}" requires manual review before execution`,
      stepId: step.id,
      timestamp: Date.now(),
      dismissed: false,
    };
  }

  return null;
}

/** Compute a full StepRiskAssessment for a single step */
function assessStepRisk(step: ExecutionStep): StepRiskAssessment {
  const baseRisk = stepTypeBaseRisk(step.type);
  const factors = identifyRiskFactors(step);

  // Adjust risk based on step's own riskLevel metadata
  let adjustedScore = baseRisk;
  if (step.riskLevel === 'high') adjustedScore = Math.max(adjustedScore, 60);
  else if (step.riskLevel === 'medium') adjustedScore = Math.max(adjustedScore, 35);

  // Adjust based on factor severity
  for (const factor of factors) {
    if (factor.severity === 'danger') adjustedScore = Math.min(100, adjustedScore + 15);
    else if (factor.severity === 'warning') adjustedScore = Math.min(100, adjustedScore + 8);
  }

  // Adjust if step requires approval
  if (step.requiresApproval) adjustedScore = Math.min(100, adjustedScore + 5);

  const riskLevel = scoreToRiskLevel(adjustedScore);
  const confidence = Math.max(0, Math.min(100, 100 - Math.abs(adjustedScore - baseRisk) * 2));

  return {
    stepId: step.id,
    riskLevel,
    confidence,
    factors,
    canAutoApprove: riskLevel === 'low' && !step.requiresApproval,
    requiresManualReview: riskLevel === 'high' || riskLevel === 'critical' || step.requiresApproval,
  };
}

/** Calculate the overall safety score from a collection of step assessments */
function calculateSafetyScore(stepRisks: Map<string, StepRiskAssessment>): number {
  if (stepRisks.size === 0) return 100; // No steps = perfectly safe

  let totalPenalty = 0;
  const weights: Record<StepRiskAssessment['riskLevel'], number> = {
    low: 2,
    medium: 10,
    high: 25,
    critical: 50,
  };

  stepRisks.forEach((assessment) => {
    totalPenalty += weights[assessment.riskLevel];
  });

  // Scale: 0 penalty = 100 score, max penalty with many critical steps approaches 0
  const maxPossiblePenalty = stepRisks.size * 50;
  const rawScore = Math.max(0, 100 - (totalPenalty / maxPossiblePenalty) * 100);

  // Round to integer
  return Math.round(rawScore);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useExecutionSafety(): UseExecutionSafetyReturn {
  const [stepRisks, setStepRisks] = useState<Map<string, StepRiskAssessment>>(new Map());
  const [warnings, setWarnings] = useState<SafetyWarning[]>([]);
  const isMountedRef = useRef(true);

  // Track current plan id so step updates can be correlated
  const currentPlanIdRef = useRef<string | null>(null);

  // ── Derived state ──

  const safetyScore = useMemo(() => calculateSafetyScore(stepRisks), [stepRisks]);

  const activeWarnings = useMemo(
    () => warnings.filter((w) => !w.dismissed),
    [warnings],
  );

  const hasWarnings = activeWarnings.length > 0;

  const needsApproval = useMemo(() => {
    let needed = false;
    stepRisks.forEach((assessment) => {
      if (assessment.requiresManualReview) needed = true;
    });
    return needed;
  }, [stepRisks]);

  // ── Cleanup ──

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Listen for step updates from the main process ──

  useEffect(() => {
    if (!window.vibecode?.execution) return;

    window.vibecode.execution.onStepUpdate?.((update: any) => {
      if (!isMountedRef.current) return;

      // When a step update comes in, we re-assess if we have context
      // The update object may contain step information
      if (update?.stepId && update?.type) {
        setStepRisks((prev) => {
          const next = new Map(prev);
          // If we already have an assessment for this step, update risk level
          // based on the new status (completed steps are no longer risky)
          const existing = next.get(update.stepId);
          if (existing) {
            if (update.status === 'completed' || update.status === 'cancelled') {
              // Completed/cancelled steps are no longer a concern
              next.set(update.stepId, {
                ...existing,
                riskLevel: 'low',
                confidence: 100,
                canAutoApprove: true,
                requiresManualReview: false,
              });
            } else if (update.status === 'failed') {
              // Failed steps need review
              next.set(update.stepId, {
                ...existing,
                riskLevel: 'high',
                confidence: 80,
                requiresManualReview: true,
              });
            }
          }
          return next;
        });

        // Dismiss warnings for completed/cancelled steps
        if (update.status === 'completed' || update.status === 'cancelled') {
          setWarnings((prev) =>
            prev.map((w) =>
              w.stepId === update.stepId ? { ...w, dismissed: true } : w,
            ),
          );
        }
      }
    });

    // Note: IPC on() listeners cannot be unsubscribed in the current preload bridge.
    // This is acceptable as the callback checks isMountedRef.
  }, []);

  // ── assessPlan: fetch plan data and assess all steps ──

  const assessPlan = useCallback(async (planId: string) => {
    if (!window.vibecode?.execution) return;

    currentPlanIdRef.current = planId;

    try {
      const result = await window.vibecode.execution.getPlan(planId);
      if (!result.success || !result.data?.plan) return;

      const plan = result.data.plan;
      const steps: ExecutionStep[] = plan.steps ?? [];

      const newRisks = new Map<string, StepRiskAssessment>();
      const newWarnings: SafetyWarning[] = [];

      for (const step of steps) {
        const assessment = assessStepRisk(step);
        newRisks.set(step.id, assessment);

        const warning = buildWarning(step, assessment.factors);
        if (warning) {
          newWarnings.push(warning);
        }
      }

      if (isMountedRef.current) {
        setStepRisks(newRisks);

        // Merge warnings — keep existing non-dismissed warnings, add new ones
        setWarnings((prev) => {
          const existingActive = prev.filter((w) => w.dismissed === false);
          const existingStepIds = new Set(existingActive.map((w) => w.stepId));
          const uniqueNew = newWarnings.filter((w) => !existingStepIds.has(w.stepId));
          return [...existingActive, ...uniqueNew];
        });
      }
    } catch {
      // Assessment failed silently — leave existing state intact
    }
  }, []);

  // ── assessStep: fetch and assess a single step ──

  const assessStep = useCallback(async (stepId: string) => {
    if (!window.vibecode?.execution) return;

    try {
      const result = await window.vibecode.execution.getStep(stepId);
      if (!result.success || !result.data?.step) return;

      const step: ExecutionStep = result.data.step;
      const assessment = assessStepRisk(step);

      if (isMountedRef.current) {
        setStepRisks((prev) => {
          const next = new Map(prev);
          next.set(step.id, assessment);
          return next;
        });

        const warning = buildWarning(step, assessment.factors);
        if (warning) {
          setWarnings((prev) => {
            // Replace any existing warning for this step
            const filtered = prev.filter((w) => w.stepId !== step.id);
            return [...filtered, warning];
          });
        }
      }
    } catch {
      // Assessment failed silently
    }
  }, []);

  // ── safeExecute: execute a plan with safety checks ──

  const safeExecute = useCallback(async (planId: string): Promise<SafeExecutionResult> => {
    if (!window.vibecode?.execution) {
      return {
        success: false,
        approvedSteps: 0,
        skippedSteps: 0,
        failedSteps: 0,
        rolledBack: false,
        safetyScore: 0,
      };
    }

    // First, ensure we have the latest assessment
    await assessPlan(planId);

    // Get current risk state after assessment
    let currentRisks: Map<string, StepRiskAssessment> = new Map();
    setStepRisks((prev) => {
      currentRisks = new Map(prev);
      return prev;
    });

    let approvedSteps = 0;
    let skippedSteps = 0;
    let failedSteps = 0;
    let rolledBack = false;

    // Check if any critical steps exist that should block execution
    let hasCritical = false;
    let hasUnreviewed = false;
    currentRisks.forEach((risk) => {
      if (risk.riskLevel === 'critical') hasCritical = true;
      if (risk.requiresManualReview) hasUnreviewed = true;
    });

    // Block execution if there are critical or unreviewed steps
    if (hasCritical || hasUnreviewed) {
      // Count how many steps are unsafe
      currentRisks.forEach((risk) => {
        if (risk.riskLevel === 'critical' || risk.requiresManualReview) {
          skippedSteps++;
        } else {
          approvedSteps++;
        }
      });

      return {
        success: false,
        approvedSteps,
        skippedSteps,
        failedSteps: 0,
        rolledBack: false,
        safetyScore: calculateSafetyScore(currentRisks),
      };
    }

    // All steps are safe enough — proceed with execution
    try {
      const result = await window.vibecode.execution.execute(planId);

      if (result.success && result.data?.plan) {
        const plan = result.data.plan;
        const steps: ExecutionStep[] = plan.steps ?? [];

        for (const step of steps) {
          if (step.status === 'completed') approvedSteps++;
          else if (step.status === 'failed') failedSteps++;
          else if (step.status === 'cancelled') skippedSteps++;
        }

        // If any step failed, attempt rollback
        if (failedSteps > 0) {
          try {
            const rollbackResult = await window.vibecode.execution.rollbackPlan(planId);
            rolledBack = rollbackResult.success;
          } catch {
            // Rollback failed
          }
        }

        return {
          success: failedSteps === 0,
          approvedSteps,
          skippedSteps,
          failedSteps,
          rolledBack,
          safetyScore: calculateSafetyScore(currentRisks),
        };
      }

      return {
        success: false,
        approvedSteps,
        skippedSteps,
        failedSteps: 1,
        rolledBack: false,
        safetyScore: calculateSafetyScore(currentRisks),
      };
    } catch {
      return {
        success: false,
        approvedSteps: 0,
        skippedSteps: 0,
        failedSteps: 1,
        rolledBack: false,
        safetyScore: calculateSafetyScore(currentRisks),
      };
    }
  }, [assessPlan]);

  // ── previewExecution: get a preview of what will happen ──

  const previewExecution = useCallback(async (planId: string): Promise<ExecutionPreview> => {
    const emptyPreview: ExecutionPreview = {
      planId,
      totalSteps: 0,
      safeSteps: 0,
      riskySteps: 0,
      affectedFiles: [],
      estimatedImpact: 'minimal',
      diffSummary: { additions: 0, deletions: 0, filesChanged: 0 },
      rollbackAvailable: false,
    };

    if (!window.vibecode?.execution) return emptyPreview;

    try {
      // Fetch plan details
      const planResult = await window.vibecode.execution.getPlan(planId);
      if (!planResult.success || !planResult.data?.plan) return emptyPreview;

      const plan = planResult.data.plan;
      const steps: ExecutionStep[] = plan.steps ?? [];
      const totalSteps = steps.length;

      // Assess each step for the preview
      let safeSteps = 0;
      let riskySteps = 0;
      const affectedFiles: string[] = [];

      for (const step of steps) {
        const assessment = assessStepRisk(step);
        if (assessment.riskLevel === 'low') safeSteps++;
        else riskySteps++;

        // Collect affected file paths
        const filePath = (step.params?.filePath as string) ?? (step.params?.path as string);
        if (filePath && !affectedFiles.includes(filePath)) {
          affectedFiles.push(filePath);
        }
      }

      // Fetch diffs for the plan
      let diffSummary = { additions: 0, deletions: 0, filesChanged: 0 };
      try {
        const diffResult = await window.vibecode.execution.getPlanDiffs(planId);
        if (diffResult.success && diffResult.data?.diffs) {
          const diffs: DiffResult[] = diffResult.data.diffs;
          for (const diff of diffs) {
            diffSummary.additions += diff.additions;
            diffSummary.deletions += diff.deletions;
            diffSummary.filesChanged++;
          }
        }
      } catch {
        // Diffs may not be available for unexecuted plans
      }

      // Estimate impact level
      const totalChanges = diffSummary.additions + diffSummary.deletions;
      let estimatedImpact: ExecutionPreview['estimatedImpact'] = 'minimal';
      if (riskySteps > totalSteps * 0.5 || totalChanges > 500 || affectedFiles.length > 10) {
        estimatedImpact = 'major';
      } else if (riskySteps > totalSteps * 0.25 || totalChanges > 200 || affectedFiles.length > 5) {
        estimatedImpact = 'significant';
      } else if (riskySteps > 0 || totalChanges > 50 || affectedFiles.length > 2) {
        estimatedImpact = 'moderate';
      }

      // Check rollback availability
      let rollbackAvailable = false;
      try {
        const statusResult = await window.vibecode.execution.status(planId);
        if (statusResult.success && statusResult.data) {
          const data = statusResult.data as { canRollbackAll?: boolean; checkpointCount?: number };
          rollbackAvailable = data.canRollbackAll ?? (data.checkpointCount ?? 0) > 0;
        }
      } catch {
        // Default to false
      }

      return {
        planId,
        totalSteps,
        safeSteps,
        riskySteps,
        affectedFiles,
        estimatedImpact,
        diffSummary,
        rollbackAvailable,
      };
    } catch {
      return emptyPreview;
    }
  }, []);

  // ── getRollbackInfo: get rollback snapshot info for a step ──

  const getRollbackInfo = useCallback(async (stepId: string): Promise<RollbackPreview> => {
    const emptyRollback: RollbackPreview = {
      stepId,
      canRollback: false,
      affectedFiles: [],
      snapshotTimestamp: 0,
    };

    if (!window.vibecode?.execution) return emptyRollback;

    try {
      // Fetch step details
      const stepResult = await window.vibecode.execution.getStep(stepId);
      if (!stepResult.success || !stepResult.data?.step) return emptyRollback;

      const step: ExecutionStep = stepResult.data.step;
      const filePath = (step.params?.filePath as string) ?? (step.params?.path as string);
      const affectedFiles: string[] = filePath ? [filePath] : [];

      // Try to get diff for the step to show original vs new content
      let originalContent: string | undefined;
      let newContent: string | undefined;
      let canRollback = false;
      let snapshotTimestamp = 0;

      try {
        const diffResult = await window.vibecode.execution.getDiff(stepId);
        if (diffResult.success && diffResult.data) {
          const diff = diffResult.data;
          // Reconstruct original content from diff lines
          const removedLines = diff.lines
            .filter((l) => l.type === 'remove')
            .map((l) => l.content)
            .join('\n');
          const addedLines = diff.lines
            .filter((l) => l.type === 'add')
            .map((l) => l.content)
            .join('\n');

          if (removedLines) originalContent = removedLines;
          if (addedLines) newContent = addedLines;
        }
      } catch {
        // Diff not available
      }

      // Check if rollback is possible — step must have completed successfully
      if (step.status === 'completed') {
        canRollback = true;
        snapshotTimestamp = step.result?.timestamp as number ?? Date.now();
      }

      return {
        stepId,
        canRollback,
        originalContent,
        newContent,
        affectedFiles,
        snapshotTimestamp,
      };
    } catch {
      return emptyRollback;
    }
  }, []);

  // ── dismissWarning: mark a warning as dismissed ──

  const dismissWarning = useCallback((warningId: string) => {
    setWarnings((prev) =>
      prev.map((w) =>
        w.id === warningId ? { ...w, dismissed: true } : w,
      ),
    );
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
