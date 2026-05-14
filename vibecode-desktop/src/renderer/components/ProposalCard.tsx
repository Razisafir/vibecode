import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { ProposalCard as ProposalCardType, ProposalCardData, ProposalStatus, RiskLevel, AffectedFile, ProposalStepData, DiffLine, DiffResult, StepOutput } from '../types';

interface ProposalCardProps {
  proposal: ProposalCardType | ProposalCardData;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onModify?: (id: string) => void;
  /** If true, show execution progress details */
  showProgress?: boolean;
}

const RISK_COLORS: Record<RiskLevel, { border: string; bg: string; text: string; dot: string; meter: string }> = {
  low: { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', meter: 'bg-success' },
  medium: { border: 'border-l-warning', bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning', meter: 'bg-warning' },
  high: { border: 'border-l-error', bg: 'bg-error/10', text: 'text-error', dot: 'bg-error', meter: 'bg-error' },
};

const TYPE_LABELS: Record<string, string> = {
  file_create: 'Create File',
  file_edit: 'Edit File',
  file_delete: 'Delete File',
  command: 'Run Command',
  code_generation: 'Generate Code',
  diff_apply: 'Apply Diff',
  analysis: 'Analysis',
  plan: 'Plan',
  multi_step: 'Multi-Step Plan',
  file_write: 'Write File',
  file_read: 'Read File',
  code_edit: 'Edit Code',
  generation: 'Generate',
  review: 'Review',
};

const ACTION_ICONS: Record<string, string> = {
  create: '+',
  edit: '~',
  delete: '×',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'text-success',
  edit: 'text-warning',
  delete: 'text-error',
};

const ACTION_BG: Record<string, string> = {
  create: 'bg-success/10',
  edit: 'bg-warning/10',
  delete: 'bg-error/10',
};

const STATUS_CONFIG: Record<
  ProposalStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  pending: {
    label: 'Pending Review',
    icon: (
      <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse-slow" />
    ),
    className: 'proposal-card-status-pending',
  },
  approved: {
    label: 'Approved',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
        <polyline points="2,7 5.5,10.5 12,3.5" />
      </svg>
    ),
    className: '',
  },
  rejected: {
    label: 'Rejected',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error">
        <path d="M3 3l8 8M11 3l-8 8" />
      </svg>
    ),
    className: '',
  },
  executing: {
    label: 'Executing',
    icon: <span className="spinner spinner-sm" />,
    className: '',
  },
  completed: {
    label: 'Completed',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
        <path d="M2 7l3.5 3.5L12 3" />
      </svg>
    ),
    className: '',
  },
  failed: {
    label: 'Failed',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error">
        <path d="M3 3l8 8M11 3l-8 8" />
      </svg>
    ),
    className: '',
  },
};

/** Step status icon for timeline */
function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      );
    case 'completed':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
          <polyline points="2,7 5.5,10.5 12,3.5" />
        </svg>
      );
    case 'failed':
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-error">
          <path d="M3 3l8 8M11 3l-8 8" />
        </svg>
      );
    case 'pending':
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-muted">
          <circle cx="7" cy="7" r="5" />
        </svg>
      );
  }
}

/** Diff line rendering component */
function DiffLineView({ line }: { line: DiffLine }) {
  const bgClass = line.type === 'add'
    ? 'bg-success/10'
    : line.type === 'remove'
      ? 'bg-error/10'
      : 'bg-transparent';

  const textClass = line.type === 'add'
    ? 'text-success'
    : line.type === 'remove'
      ? 'text-error'
      : 'text-text-secondary';

  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

  // Collapsed context indicator
  if (line.lineNumber === -1 && line.type === 'context') {
    return (
      <div className="px-2 py-0.5 text-text-muted text-[10px] italic bg-bg-hover/50 select-none">
        {line.content}
      </div>
    );
  }

  return (
    <div className={`flex font-mono text-[11px] leading-[18px] ${bgClass} hover:brightness-110 transition-colors`}>
      <span className="w-10 text-right pr-2 text-text-muted/60 select-none flex-shrink-0">
        {line.oldLineNumber ?? ''}
      </span>
      <span className="w-10 text-right pr-2 text-text-muted/60 select-none flex-shrink-0">
        {line.newLineNumber ?? ''}
      </span>
      <span className={`w-4 text-center select-none flex-shrink-0 font-bold ${textClass}`}>
        {prefix}
      </span>
      <span className={`${textClass} whitespace-pre-wrap break-all`}>
        {line.content}
      </span>
    </div>
  );
}

/** Risk meter visual component */
function RiskMeter({ level, riskLevel }: { level: RiskLevel; riskLevel: RiskLevel }) {
  const config = RISK_COLORS[level];
  const fillWidth = level === 'low' ? '33%' : level === 'medium' ? '66%' : '100%';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-hover rounded-full overflow-hidden">
        <div className={`h-full ${config.meter} rounded-full transition-all duration-300`} style={{ width: fillWidth }} />
      </div>
      <span className={`text-[10px] font-medium ${config.text}`}>
        {level.toUpperCase()}
      </span>
    </div>
  );
}

/** Format duration from ms */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Check if proposal is the enhanced ProposalCardData type */
function isProposalCardData(proposal: ProposalCardType | ProposalCardData): proposal is ProposalCardData {
  return 'affectedFiles' in proposal || 'steps' in proposal || 'estimatedImpact' in proposal;
}

const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onApprove,
  onReject,
  onModify,
  showProgress = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'steps' | 'files' | 'diff' | 'details'>('steps');
  const [riskExpanded, setRiskExpanded] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const [diffData, setDiffData] = useState<Map<string, DiffResult>>(new Map());
  const [diffLoading, setDiffLoading] = useState<Set<string>>(new Set());
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [rollbackInProgress, setRollbackInProgress] = useState(false);
  const [retryInProgress, setRetryInProgress] = useState(false);
  const [stepOutputs, setStepOutputs] = useState<Map<string, StepOutput>>(new Map());

  const riskConfig = RISK_COLORS[proposal.riskLevel];
  const statusConfig = STATUS_CONFIG[proposal.status];

  const enhanced = useMemo(() => isProposalCardData(proposal) ? proposal : null, [proposal]);

  const affectedFiles: AffectedFile[] = enhanced?.affectedFiles ?? [];
  const steps: ProposalStepData[] = enhanced?.steps ?? [];
  const estimatedImpact = enhanced?.estimatedImpact;
  const canRollback = enhanced?.canRollback ?? false;
  const planId = enhanced?.planId;

  const handleApprove = useCallback(() => {
    onApprove?.(proposal.id);
  }, [onApprove, proposal.id]);

  const handleReject = useCallback(() => {
    onReject?.(proposal.id);
  }, [onReject, proposal.id]);

  const handleModify = useCallback(() => {
    onModify?.(proposal.id);
  }, [onModify, proposal.id]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleRiskExpand = useCallback(() => {
    setRiskExpanded((prev) => !prev);
  }, []);

  const toggleDiffExpand = useCallback(async (stepKey: string, step?: ProposalStepData) => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(stepKey)) {
        next.delete(stepKey);
        return next;
      }
      next.add(stepKey);
      return next;
    });

    // Load diff on demand if not already loaded
    if (!diffData.has(stepKey) && !diffLoading.has(stepKey) && step && planId) {
      setDiffLoading((prev) => new Set(prev).add(stepKey));

      try {
        // Try loading the plan diffs first
        const result = await window.vibecode.execution.getPlanDiffs(planId);
        if (result.success && result.data) {
          const diffsMap = new Map(diffData);
          for (const diff of result.data.diffs) {
            diffsMap.set(diff.filePath, diff);
          }
          setDiffData(diffsMap);
        }
      } catch (e) {
        // Silently handle - diff may not be available yet
      } finally {
        setDiffLoading((prev) => {
          const next = new Set(prev);
          next.delete(stepKey);
          return next;
        });
      }
    }
  }, [diffData, diffLoading, planId]);

  const handleRollback = useCallback(async () => {
    if (!planId) return;
    setRollbackInProgress(true);
    try {
      await window.vibecode.execution.rollbackPlan(planId);
    } catch (e) {
      // Error handling
    } finally {
      setRollbackInProgress(false);
      setShowRollbackConfirm(false);
    }
  }, [planId]);

  const handleRetry = useCallback(async () => {
    if (!planId) return;
    setRetryInProgress(true);
    try {
      // Find failed steps and retry them
      const statusResult = await window.vibecode.execution.status(planId);
      if (statusResult.success && statusResult.data) {
        const planData = statusResult.data as { steps: Array<{ id: string; status: string }> };
        const failedStep = planData.steps.find((s) => s.status === 'failed');
        if (failedStep) {
          await window.vibecode.execution.retry(failedStep.id);
        }
      }
    } catch (e) {
      // Error handling
    } finally {
      setRetryInProgress(false);
    }
  }, [planId]);

  const loadStepOutput = useCallback(async (stepId: string) => {
    try {
      const result = await window.vibecode.execution.getStepOutput(stepId);
      if (result.success && result.data) {
        setStepOutputs((prev) => {
          const next = new Map(prev);
          next.set(stepId, result.data!);
          return next;
        });
      }
    } catch {
      // Output may not be available
    }
  }, []);

  // Subscribe to step updates for live execution status
  useEffect(() => {
    if (!planId || proposal.status !== 'executing') return;

    const unsubscribe = window.vibecode.execution.onStepUpdate?.(() => {
      // Could refresh status here if needed
    });

    return () => {
      // Cleanup if needed
    };
  }, [planId, proposal.status]);

  const hasDetails = proposal.details && Object.keys(proposal.details).length > 0;
  const hasRichContent = affectedFiles.length > 0 || steps.length > 0 || hasDetails;

  // Determine which tabs to show
  const fileSteps = steps.filter((s) =>
    ['file_write', 'file_edit', 'code_generation', 'diff_apply', 'code_edit'].includes(s.type)
  );
  const hasDiffContent = fileSteps.length > 0;

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Calculate file size display
  const getFileActionFromStepType = (type: string): 'create' | 'edit' | 'delete' => {
    if (type === 'file_write' || type === 'code_generation') return 'create';
    if (type === 'file_edit' || type === 'diff_apply' || type === 'code_edit') return 'edit';
    return 'edit';
  };

  // Risk explanation text
  const riskExplanation: Record<RiskLevel, string> = {
    low: 'This proposal makes minimal changes with low risk of unintended side effects.',
    medium: 'This proposal modifies existing files or runs commands. Review the changes carefully before approving.',
    high: 'This proposal involves significant changes that could affect multiple files or run destructive commands. Exercise caution.',
  };

  return (
    <div className={`proposal-card ${riskConfig.border} ${statusConfig.className}`}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Type Badge & Risk Level */}
          <div className="mb-2 flex items-center gap-2">
            <span className="badge bg-bg-hover text-text-secondary">
              {TYPE_LABELS[proposal.type] || proposal.type}
            </span>
            <span className={`badge ${riskConfig.bg} ${riskConfig.text}`}>
              {proposal.riskLevel} risk
            </span>
            {canRollback && (
              <span className="badge bg-info/10 text-info">
                rollbackable
              </span>
            )}
          </div>

          {/* Title */}
          <h4 className="text-sm font-medium text-text-primary truncate">
            {proposal.title}
          </h4>

          {/* Description */}
          <p className="mt-1 text-xs text-text-secondary line-clamp-2">
            {proposal.description}
          </p>

          {/* Estimated Impact */}
          {estimatedImpact && (
            <p className="mt-1 text-xs text-text-muted italic">
              Impact: {estimatedImpact}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {statusConfig.icon}
          <span className="text-xs text-text-muted">{statusConfig.label}</span>
        </div>
      </div>

      {/* Risk Meter */}
      <div className="mt-2">
        <button
          className="w-full text-left"
          onClick={toggleRiskExpand}
        >
          <RiskMeter level={proposal.riskLevel} riskLevel={proposal.riskLevel} />
        </button>
        {riskExpanded && (
          <div className={`mt-1.5 p-2 rounded text-xs ${riskConfig.bg}`}>
            <p className={riskConfig.text}>{riskExplanation[proposal.riskLevel]}</p>
            {affectedFiles.length > 0 && (
              <p className="mt-1 text-text-muted">
                Affects {affectedFiles.filter((f) => f.action === 'create').length} new,{' '}
                {affectedFiles.filter((f) => f.action === 'edit').length} modified,{' '}
                {affectedFiles.filter((f) => f.action === 'delete').length} deleted files
              </p>
            )}
          </div>
        )}
      </div>

      {/* Quick Summary Bar — show affected files count & steps count */}
      {(affectedFiles.length > 0 || steps.length > 0) && !isExpanded && (
        <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
          {affectedFiles.length > 0 && (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2h8v8H2z" />
                <path d="M5 2v8M2 5h8" />
              </svg>
              {affectedFiles.length} file{affectedFiles.length !== 1 ? 's' : ''}
            </span>
          )}
          {steps.length > 0 && (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6h8M6 2v8" />
              </svg>
              {steps.length} step{steps.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Expand Toggle */}
      {hasRichContent && (
        <button
          className="mt-2 flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
          onClick={toggleExpand}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
          >
            <polyline points="4,2 8,6 4,10" />
          </svg>
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
      )}

      {/* Expandable Content */}
      {hasRichContent && (
        <div className={`proposal-details ${isExpanded ? 'expanded' : ''}`}>
          {/* Tab Navigation — now includes Diff tab */}
          <div className="flex border-b border-border mb-2 gap-1 overflow-x-auto">
            {steps.length > 0 && (
              <button
                className={`px-2 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                  activeTab === 'steps' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setActiveTab('steps')}
              >
                Steps ({steps.length})
              </button>
            )}
            {affectedFiles.length > 0 && (
              <button
                className={`px-2 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                  activeTab === 'files' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setActiveTab('files')}
              >
                Files ({affectedFiles.length})
              </button>
            )}
            {hasDiffContent && (
              <button
                className={`px-2 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                  activeTab === 'diff' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setActiveTab('diff')}
              >
                Diff Preview
              </button>
            )}
            {hasDetails && (
              <button
                className={`px-2 py-1 text-xs rounded-t transition-colors whitespace-nowrap ${
                  activeTab === 'details' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
                onClick={() => setActiveTab('details')}
              >
                Details
              </button>
            )}
          </div>

          <div className="rounded-md bg-bg-primary p-3 font-mono text-xs text-text-secondary max-h-96 overflow-y-auto scrollbar-custom">
            {/* Steps Tab — With Execution Timeline when executing/completed/failed */}
            {activeTab === 'steps' && steps.length > 0 && (
              <div className="space-y-0">
                {/* Execution Timeline (for executing/completed/failed) */}
                {(proposal.status === 'executing' || proposal.status === 'completed' || proposal.status === 'failed') ? (
                  <div className="space-y-0">
                    {steps.map((step, index) => {
                      const stepRisk = RISK_COLORS[step.riskLevel];
                      // Derive step status from proposal status for display
                      let stepStatus = 'pending';
                      if (proposal.status === 'completed') {
                        stepStatus = index < steps.length ? 'completed' : 'pending';
                      } else if (proposal.status === 'failed') {
                        if (index < steps.length - 1) stepStatus = 'completed';
                        else stepStatus = 'failed';
                      } else if (proposal.status === 'executing') {
                        if (index < steps.length - 1) stepStatus = 'completed';
                        else stepStatus = 'running';
                      }

                      return (
                        <div key={index} className="flex items-start gap-3 py-1.5 group">
                          {/* Timeline connector */}
                          <div className="flex flex-col items-center flex-shrink-0">
                            <StepStatusIcon status={stepStatus} />
                            {index < steps.length - 1 && (
                              <div className={`w-px h-full min-h-[12px] ${
                                stepStatus === 'completed' ? 'bg-success/30' : 'bg-border'
                              }`} />
                            )}
                          </div>
                          {/* Step content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-text-primary truncate text-xs">{step.title}</span>
                              <span className={`badge text-[9px] px-1.5 py-0 ${stepRisk.bg} ${stepRisk.text}`}>
                                {step.riskLevel}
                              </span>
                              <span className="text-[10px] text-text-muted">
                                {TYPE_LABELS[step.type] || step.type}
                              </span>
                            </div>
                            <p className="text-text-muted mt-0.5 text-[11px]">{step.description}</p>
                            {/* Show step output for command steps when completed */}
                            {stepStatus === 'completed' && step.type === 'command' && (
                              <button
                                className="text-[10px] text-accent hover:underline mt-0.5"
                                onClick={() => loadStepOutput(`${planId}-${index}`)}
                              >
                                View output
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Default step list for pending/approved proposals */
                  <div className="space-y-2">
                    {steps.map((step, index) => {
                      const stepRisk = RISK_COLORS[step.riskLevel];
                      return (
                        <div key={index} className="flex items-start gap-2 py-1 border-b border-border/50 last:border-0">
                          <span className="flex-shrink-0 w-5 h-5 rounded bg-bg-tertiary flex items-center justify-center text-text-muted text-[10px]">
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-text-primary truncate">{step.title}</span>
                              <span className={`badge text-[9px] px-1.5 py-0 ${stepRisk.bg} ${stepRisk.text}`}>
                                {step.riskLevel}
                              </span>
                            </div>
                            <p className="text-text-muted mt-0.5">{step.description}</p>
                            <span className="text-text-muted text-[10px]">{TYPE_LABELS[step.type] || step.type}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Files Tab — Enhanced with action icons and expandable diffs */}
            {activeTab === 'files' && affectedFiles.length > 0 && (
              <div className="space-y-1">
                {affectedFiles.map((file, index) => {
                  const stepKey = file.path;
                  const isDiffExpanded = expandedDiffs.has(stepKey);
                  const fileDiff = diffData.get(stepKey);

                  return (
                    <div key={index}>
                      <div
                        className="flex items-center gap-2 py-1 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                        onClick={() => toggleDiffExpand(stepKey)}
                      >
                        <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${ACTION_COLORS[file.action]} ${ACTION_BG[file.action]}`}>
                          {ACTION_ICONS[file.action]}
                        </span>
                        <span className="text-text-primary truncate flex-1 text-xs">{file.path}</span>
                        <span className={`text-[10px] ${ACTION_COLORS[file.action]}`}>{file.action}</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={`text-text-muted transition-transform ${isDiffExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="3,1 7,5 3,9" />
                        </svg>
                      </div>

                      {/* Expanded diff view for this file */}
                      {isDiffExpanded && (
                        <div className="ml-2 mt-1 mb-2 border border-border rounded overflow-hidden">
                          {diffLoading.has(stepKey) ? (
                            <div className="p-2 text-text-muted text-[10px]">Loading diff...</div>
                          ) : fileDiff ? (
                            <>
                              <div className="px-2 py-1 bg-bg-hover text-[10px] flex items-center gap-2">
                                <span className="text-text-primary font-medium">{fileDiff.filePath}</span>
                                <span className="text-success">+{fileDiff.additions}</span>
                                <span className="text-error">-{fileDiff.deletions}</span>
                              </div>
                              <div className="overflow-x-auto max-h-48">
                                {fileDiff.lines.map((line, i) => (
                                  <DiffLineView key={i} line={line} />
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="p-2 text-text-muted text-[10px]">
                              No diff available — file may not exist yet or content is not available
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Diff Preview Tab */}
            {activeTab === 'diff' && hasDiffContent && (
              <div className="space-y-3">
                {fileSteps.map((step, index) => {
                  const filePath = (step.params.filePath as string) || (step.params.path as string) || `Step ${index + 1}`;
                  const stepKey = filePath;
                  const isDiffExpanded = expandedDiffs.has(`diff-${stepKey}`);
                  const fileDiff = diffData.get(stepKey);

                  return (
                    <div key={index} className="border border-border rounded overflow-hidden">
                      {/* File header — click to expand */}
                      <button
                        className="w-full px-2 py-1.5 bg-bg-hover flex items-center gap-2 hover:bg-bg-hover/80 transition-colors text-left"
                        onClick={() => toggleDiffExpand(`diff-${stepKey}`, step)}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className={`text-text-muted transition-transform flex-shrink-0 ${isDiffExpanded ? 'rotate-90' : ''}`}
                        >
                          <polyline points="3,1 7,5 3,9" />
                        </svg>
                        <span className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold ${ACTION_COLORS[getFileActionFromStepType(step.type)]} ${ACTION_BG[getFileActionFromStepType(step.type)]}`}>
                          {ACTION_ICONS[getFileActionFromStepType(step.type)]}
                        </span>
                        <span className="text-text-primary truncate text-xs font-medium flex-1">{filePath}</span>
                        <span className="text-[10px] text-text-muted">{TYPE_LABELS[step.type] || step.type}</span>
                      </button>

                      {/* Expanded diff content */}
                      {isDiffExpanded && (
                        <div>
                          {diffLoading.has(`diff-${stepKey}`) ? (
                            <div className="p-3 text-text-muted text-[10px] flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                              Loading diff...
                            </div>
                          ) : fileDiff ? (
                            <>
                              <div className="px-2 py-1 bg-bg-tertiary text-[10px] flex items-center gap-3 border-b border-border">
                                <span className="text-text-primary font-medium">{fileDiff.filePath}</span>
                                <span className="text-success">+{fileDiff.additions} additions</span>
                                <span className="text-error">-{fileDiff.deletions} deletions</span>
                              </div>
                              <div className="overflow-x-auto max-h-64">
                                {fileDiff.lines.map((line, i) => (
                                  <DiffLineView key={i} line={line} />
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="p-3 text-text-muted text-[10px]">
                              Diff not available. The file may not exist yet or content could not be read.
                              <br />
                              <span className="text-text-secondary">Step type: {step.type}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Summary */}
                <div className="text-[10px] text-text-muted pt-1 border-t border-border/50">
                  {fileSteps.length} file step{fileSteps.length !== 1 ? 's' : ''} with diff preview available.
                  Click each file to expand its diff.
                </div>
              </div>
            )}

            {/* Details Tab (legacy + extra data) */}
            {activeTab === 'details' && hasDetails && (
              <div className="space-y-1">
                {Object.entries(proposal.details).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-text-muted">{key}:</span>
                    <span className="text-text-primary">
                      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step Output Display */}
          {stepOutputs.size > 0 && (
            <div className="mt-2 space-y-1">
              {Array.from(stepOutputs.entries()).map(([stepId, output]) => (
                <div key={stepId} className="rounded border border-border overflow-hidden">
                  <div className="px-2 py-1 bg-bg-hover text-[10px] flex items-center gap-2">
                    <span className="text-text-primary font-medium">{output.title}</span>
                    <span className="text-text-muted">{output.type}</span>
                    {output.duration && (
                      <span className="text-text-muted">{formatDuration(output.duration)}</span>
                    )}
                  </div>
                  {output.stdout && (
                    <pre className="p-2 text-[10px] font-mono text-text-secondary bg-bg-primary max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {output.stdout}
                    </pre>
                  )}
                  {output.stderr && (
                    <pre className="p-2 text-[10px] font-mono text-error bg-error/5 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {output.stderr}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons (only for pending proposals) */}
      {proposal.status === 'pending' && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <button
            className="btn btn-primary btn-sm rounded-md"
            onClick={handleApprove}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="2,6 5,9 10,3" />
            </svg>
            Approve & Execute
          </button>
          <button
            className="btn btn-secondary btn-sm rounded-md"
            onClick={handleModify}
          >
            Modify
          </button>
          <button
            className="btn btn-ghost btn-sm rounded-md text-error hover:bg-error/10"
            onClick={handleReject}
          >
            Reject
          </button>
        </div>
      )}

      {/* Execution Progress (for executing/completed/failed status) */}
      {showProgress && (proposal.status === 'executing' || proposal.status === 'completed' || proposal.status === 'failed') && enhanced && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-center gap-2">
            {proposal.status === 'executing' && (
              <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, ((steps.length > 0 ? 1 : 0) / Math.max(steps.length, 1)) * 100)}%` }}
                />
              </div>
            )}
            {proposal.status === 'completed' && (
              <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div className="h-full bg-success rounded-full w-full" />
              </div>
            )}
            {proposal.status === 'failed' && (
              <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                <div className="h-full bg-error rounded-full" style={{ width: `${Math.min(100, ((steps.length > 0 ? steps.length - 1 : 0) / Math.max(steps.length, 1)) * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rollback Button (for completed/failed with canRollback) */}
      {(proposal.status === 'completed' || proposal.status === 'failed') && canRollback && planId && (
        <div className="mt-2 border-t border-border pt-2">
          {!showRollbackConfirm ? (
            <button
              className="btn btn-ghost btn-sm rounded-md text-warning hover:bg-warning/10"
              onClick={() => setShowRollbackConfirm(true)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4h7a3 3 0 0 1 0 6H6" />
                <polyline points="3,2 1,4 3,6" />
              </svg>
              Rollback Changes
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-warning">Are you sure?</span>
              <button
                className="btn btn-sm rounded-md bg-warning/10 text-warning hover:bg-warning/20"
                onClick={handleRollback}
                disabled={rollbackInProgress}
              >
                {rollbackInProgress ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-warning border-t-transparent animate-spin" />
                    Rolling back...
                  </>
                ) : (
                  'Confirm Rollback'
                )}
              </button>
              <button
                className="btn btn-ghost btn-sm rounded-md text-text-muted"
                onClick={() => setShowRollbackConfirm(false)}
                disabled={rollbackInProgress}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Retry Failed Execution Button */}
      {proposal.status === 'failed' && planId && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            className="btn btn-ghost btn-sm rounded-md text-accent hover:bg-accent/10"
            onClick={handleRetry}
            disabled={retryInProgress}
          >
            {retryInProgress ? (
              <>
                <span className="inline-block h-3 w-3 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 6a5 5 0 0 1 9.3-2.5" />
                  <path d="M11 6a5 5 0 0 1-9.3 2.5" />
                  <polyline points="10,1 11,4 8,4" />
                </svg>
                Retry Failed Step
              </>
            )}
          </button>
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-2 text-xs text-text-muted">
        {formatTime(proposal.timestamp)}
      </div>
    </div>
  );
};

export default ProposalCard;
