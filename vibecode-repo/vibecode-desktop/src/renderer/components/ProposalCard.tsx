import React, { useState, useCallback } from 'react';
import type { ProposalCard as ProposalCardType, ProposalStatus, RiskLevel } from '../types';

interface ProposalCardProps {
  proposal: ProposalCardType;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onModify?: (id: string) => void;
  onRollback?: (planId: string) => void;
  isExecuting?: boolean;
}

const RISK_COLORS: Record<RiskLevel, { border: string; bg: string; text: string }> = {
  low: { border: 'border-l-success', bg: 'bg-success/10', text: 'text-success' },
  medium: { border: 'border-l-warning', bg: 'bg-warning/10', text: 'text-warning' },
  high: { border: 'border-l-error', bg: 'bg-error/10', text: 'text-error' },
};

const TYPE_LABELS: Record<string, string> = {
  file_create: 'Create File',
  file_edit: 'Edit File',
  file_write: 'Write File',
  file_read: 'Read File',
  code_generation: 'Generate Code',
  diff_apply: 'Apply Diff',
  command: 'Run Command',
  analysis: 'Analysis',
  plan: 'Execution Plan',
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

const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onApprove,
  onReject,
  onModify,
  onRollback,
  isExecuting = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true); // Default expanded for real proposals
  const riskConfig = RISK_COLORS[proposal.riskLevel];
  const statusConfig = STATUS_CONFIG[proposal.status];

  const handleApprove = useCallback(() => {
    onApprove?.(proposal.id);
  }, [onApprove, proposal.id]);

  const handleReject = useCallback(() => {
    onReject?.(proposal.id);
  }, [onReject, proposal.id]);

  const handleModify = useCallback(() => {
    onModify?.(proposal.id);
  }, [onModify, proposal.id]);

  const handleRollback = useCallback(() => {
    if (proposal.planId) {
      onRollback?.(proposal.planId);
    }
  }, [onRollback, proposal.planId]);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const hasDetails = proposal.details && Object.keys(proposal.details).length > 0;
  const hasAffectedPaths = proposal.affectedPaths && proposal.affectedPaths.length > 0;
  const hasStepDetails = proposal.details?.steps && Array.isArray(proposal.details.steps);

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
            {proposal.stepCount && (
              <span className="badge bg-bg-hover text-text-muted">
                {proposal.stepCount} step{proposal.stepCount !== 1 ? 's' : ''}
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
        </div>

        {/* Status */}
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {statusConfig.icon}
          <span className="text-xs text-text-muted">{statusConfig.label}</span>
        </div>
      </div>

      {/* Affected Files */}
      {hasAffectedPaths && (
        <div className="mt-2">
          <span className="text-xs text-text-muted">Affected files:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {proposal.affectedPaths!.map((p) => (
              <span key={p} className="rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-xs text-accent">
                {p.split('/').pop() || p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Expand Toggle */}
      {(hasDetails || hasAffectedPaths) && (
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
          {isExpanded ? 'Hide details' : 'Show execution details'}
        </button>
      )}

      {/* Expandable Details */}
      {isExpanded && hasDetails && (
        <div className="proposal-details expanded">
          <div className="mt-2 rounded-md bg-bg-primary p-3">
            {/* Execution Steps */}
            {hasStepDetails && (
              <div className="mb-2">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Execution Steps</span>
                <div className="mt-1 space-y-1">
                  {(proposal.details.steps as Array<{ title: string; type: string; riskLevel: string }>).map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        step.riskLevel === 'high' ? 'bg-error' :
                        step.riskLevel === 'medium' ? 'bg-warning' : 'bg-success'
                      }`} />
                      <span className="text-text-secondary">{TYPE_LABELS[step.type] || step.type}:</span>
                      <span className="text-text-primary">{step.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other Details */}
            {Object.entries(proposal.details)
              .filter(([key]) => key !== 'steps')
              .map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <span className="text-text-muted">{key}:</span>
                  <span className="text-text-primary">
                    {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        {proposal.status === 'pending' && !isExecuting && (
          <>
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
          </>
        )}

        {proposal.status === 'executing' && (
          <div className="flex items-center gap-2 text-xs text-accent">
            <span className="spinner spinner-sm" />
            <span>Executing...</span>
          </div>
        )}

        {proposal.status === 'completed' && proposal.planId && (
          <button
            className="btn btn-ghost btn-sm rounded-md text-warning hover:bg-warning/10"
            onClick={handleRollback}
          >
            Rollback
          </button>
        )}

        {proposal.status === 'failed' && proposal.planId && (
          <button
            className="btn btn-ghost btn-sm rounded-md text-error hover:bg-error/10"
            onClick={handleRollback}
          >
            Rollback Changes
          </button>
        )}
      </div>

      {/* Timestamp */}
      <div className="mt-2 text-xs text-text-muted">
        {formatTime(proposal.timestamp)}
      </div>
    </div>
  );
};

export default ProposalCard;
