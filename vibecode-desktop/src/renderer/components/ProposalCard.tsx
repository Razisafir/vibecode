import React, { useState, useCallback, useMemo } from 'react';
import type { ProposalCard as ProposalCardType, ProposalCardData, ProposalStatus, RiskLevel, AffectedFile, ProposalStepData } from '../types';

interface ProposalCardProps {
  proposal: ProposalCardType | ProposalCardData;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onModify?: (id: string) => void;
  /** If true, show execution progress details */
  showProgress?: boolean;
}

const RISK_COLORS: Record<RiskLevel, { border: string; bg: string; text: string; dot: string }> = {
  low: { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  medium: { border: 'border-l-warning', bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  high: { border: 'border-l-error', bg: 'bg-error/10', text: 'text-error', dot: 'bg-error' },
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
  const [activeTab, setActiveTab] = useState<'steps' | 'files' | 'details'>('steps');
  const riskConfig = RISK_COLORS[proposal.riskLevel];
  const statusConfig = STATUS_CONFIG[proposal.status];

  const enhanced = useMemo(() => isProposalCardData(proposal) ? proposal : null, [proposal]);

  const affectedFiles: AffectedFile[] = enhanced?.affectedFiles ?? [];
  const steps: ProposalStepData[] = enhanced?.steps ?? [];
  const estimatedImpact = enhanced?.estimatedImpact;
  const canRollback = enhanced?.canRollback ?? false;

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

  const hasDetails = proposal.details && Object.keys(proposal.details).length > 0;
  const hasRichContent = affectedFiles.length > 0 || steps.length > 0 || hasDetails;

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          {/* Tab Navigation */}
          {(affectedFiles.length > 0 || hasDetails) && steps.length > 0 && (
            <div className="flex border-b border-border mb-2 gap-1">
              {steps.length > 0 && (
                <button
                  className={`px-2 py-1 text-xs rounded-t transition-colors ${
                    activeTab === 'steps' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                  }`}
                  onClick={() => setActiveTab('steps')}
                >
                  Steps ({steps.length})
                </button>
              )}
              {affectedFiles.length > 0 && (
                <button
                  className={`px-2 py-1 text-xs rounded-t transition-colors ${
                    activeTab === 'files' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                  }`}
                  onClick={() => setActiveTab('files')}
                >
                  Files ({affectedFiles.length})
                </button>
              )}
              {hasDetails && (
                <button
                  className={`px-2 py-1 text-xs rounded-t transition-colors ${
                    activeTab === 'details' ? 'bg-bg-primary text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-secondary'
                  }`}
                  onClick={() => setActiveTab('details')}
                >
                  Details
                </button>
              )}
            </div>
          )}

          <div className="rounded-md bg-bg-primary p-3 font-mono text-xs text-text-secondary max-h-64 overflow-y-auto scrollbar-custom">
            {/* Steps Tab */}
            {(activeTab === 'steps' || (steps.length > 0 && affectedFiles.length === 0 && !hasDetails)) && steps.length > 0 && (
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

            {/* Files Tab */}
            {(activeTab === 'files' || (affectedFiles.length > 0 && steps.length === 0 && !hasDetails)) && affectedFiles.length > 0 && (
              <div className="space-y-1">
                {affectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 py-0.5">
                    <span className={`flex-shrink-0 w-4 text-center font-bold ${ACTION_COLORS[file.action]}`}>
                      {ACTION_ICONS[file.action]}
                    </span>
                    <span className="text-text-primary truncate flex-1">{file.path}</span>
                    <span className="text-text-muted text-[10px]">{file.action}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Details Tab (legacy + extra data) */}
            {(activeTab === 'details' || (!steps.length && !affectedFiles.length && hasDetails)) && hasDetails && (
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
          </div>
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
