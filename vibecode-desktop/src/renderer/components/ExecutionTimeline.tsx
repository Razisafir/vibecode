import React, { useState, useCallback, useMemo } from 'react';
import type { ExecutionTimelineEntry, ExecutionTimeline as ExecutionTimelineType, RiskLevel, ExecutionStatus } from '../types';

// ─── Status Icon Component ──────────────────────────────────────────────────

const StatusIcon: React.FC<{ status: ExecutionStatus; size?: number }> = ({ status, size = 14 }) => {
  switch (status) {
    case 'completed':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className="text-success">
          <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15" />
          <path d="M4.5 7l2 2 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'executing':
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox="0 0 14 14" className="text-accent animate-spin" style={{ animationDuration: '1.5s' }}>
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.2" />
            <path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      );
    case 'failed':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className="text-danger">
          <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15" />
          <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'cancelled':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className="text-text-muted">
          <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.1" />
          <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
        </svg>
      );
    case 'approved':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className="text-accent">
          <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.12" />
          <path d="M4.5 7l2 2 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className="text-text-muted">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
        </svg>
      );
  }
};

// ─── Risk Badge ──────────────────────────────────────────────────────────────

const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => {
  const styles: Record<RiskLevel, { bg: string; text: string; label: string }> = {
    low: { bg: 'rgba(34, 197, 94, 0.12)', text: '#22c55e', label: 'Low' },
    medium: { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', label: 'Medium' },
    high: { bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444', label: 'High' },
  };
  const s = styles[level];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
};

// ─── Confidence Meter ────────────────────────────────────────────────────────

const ConfidenceMeter: React.FC<{ value: number }> = ({ value }) => {
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 rounded-full bg-bg-deep overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono" style={{ color }}>{value}%</span>
    </div>
  );
};

// ─── Step Duration Display ──────────────────────────────────────────────────

const DurationDisplay: React.FC<{ startedAt?: number; completedAt?: number; duration?: number }> = ({
  startedAt, completedAt, duration
}) => {
  if (!startedAt) return null;
  const ms = duration || (completedAt ? completedAt - startedAt : Date.now() - startedAt);
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return <span className="text-[10px] text-text-muted font-mono">{seconds}s</span>;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return <span className="text-[10px] text-text-muted font-mono">{minutes}m {remainSec}s</span>;
};

// ─── Progress Bar ────────────────────────────────────────────────────────────

const ProgressBar: React.FC<{ value: number; status: ExecutionStatus }> = ({ value, status }) => {
  const isActive = status === 'executing';
  return (
    <div className="h-1 rounded-full bg-bg-deep overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${isActive ? 'animate-pulse' : ''}`}
        style={{
          width: `${value}%`,
          backgroundColor: isActive ? 'var(--accent)' : status === 'completed' ? 'var(--success)' : status === 'failed' ? 'var(--danger)' : 'var(--accent)',
        }}
      />
    </div>
  );
};

// ─── Timeline Step Card ──────────────────────────────────────────────────────

interface StepCardProps {
  entry: ExecutionTimelineEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove?: (stepId: string) => void;
  onRollback?: (stepId: string) => void;
  onRetry?: (stepId: string) => void;
}

const TimelineStepCard: React.FC<StepCardProps> = ({
  entry, isExpanded, onToggle, onApprove, onRollback, onRetry
}) => {
  const isActive = entry.status === 'executing';
  const isCompleted = entry.status === 'completed';
  const isFailed = entry.status === 'failed';
  const needsApproval = entry.requiresApproval && entry.status === 'pending';

  return (
    <div
      className={`group relative rounded-lg border transition-all duration-200 ${
        isActive
          ? 'border-accent/40 bg-accent/5 shadow-glow'
          : isFailed
          ? 'border-danger/30 bg-danger/5'
          : isCompleted
          ? 'border-success/20 bg-success/3'
          : needsApproval
          ? 'border-warning/30 bg-warning/5'
          : 'border-border bg-bg-elevated/40 hover:bg-bg-elevated/80 hover:border-border-emphasis'
      }`}
    >
      {/* Step Header */}
      <button
        className="w-full flex items-start gap-3 p-3 text-left"
        onClick={onToggle}
      >
        <div className="flex-shrink-0 mt-0.5">
          <StatusIcon status={entry.status} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-medium truncate ${
              isCompleted ? 'text-text-secondary' : 'text-text-primary'
            }`}>
              {entry.title}
            </span>
            <RiskBadge level={entry.riskLevel} />
          </div>
          <p className="text-[10px] text-text-muted truncate">{entry.description}</p>
          {isActive && (
            <div className="mt-2">
              <ProgressBar value={entry.progress} status={entry.status} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <DurationDisplay
            startedAt={entry.startedAt}
            completedAt={entry.completedAt}
            duration={entry.duration}
          />
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`text-text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <polyline points="3,4.5 6,7.5 9,4.5" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          {/* Confidence */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-muted">AI Confidence</span>
            <ConfidenceMeter value={entry.confidence} />
          </div>

          {/* Output */}
          {entry.output && (
            <div className="rounded-md bg-bg-deep border border-border p-2">
              <pre className="text-[11px] text-text-secondary font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {entry.output}
              </pre>
            </div>
          )}

          {/* Error */}
          {entry.error && (
            <div className="rounded-md bg-danger/10 border border-danger/20 p-2">
              <pre className="text-[11px] text-danger font-mono whitespace-pre-wrap break-words">
                {entry.error}
              </pre>
            </div>
          )}

          {/* Diff Preview */}
          {entry.diffPreview && entry.diffPreview.lines.length > 0 && (
            <div className="rounded-md bg-bg-deep border border-border overflow-hidden">
              <div className="px-2 py-1.5 border-b border-border flex items-center justify-between">
                <span className="text-[10px] font-mono text-text-muted">{entry.diffPreview.filePath}</span>
                <span className="text-[10px] text-success">+{entry.diffPreview.additions}</span>
                <span className="text-[10px] text-danger ml-1">-{entry.diffPreview.deletions}</span>
              </div>
              <div className="p-2 max-h-40 overflow-y-auto">
                {entry.diffPreview.lines.slice(0, 20).map((line, i) => (
                  <div
                    key={i}
                    className={`text-[11px] font-mono leading-5 ${
                      line.type === 'add'
                        ? 'text-success bg-success/10'
                        : line.type === 'remove'
                        ? 'text-danger bg-danger/10'
                        : 'text-text-muted'
                    }`}
                  >
                    <span className="inline-block w-8 text-right mr-2 opacity-40 select-none">
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                    </span>
                    {line.content}
                  </div>
                ))}
                {entry.diffPreview.lines.length > 20 && (
                  <div className="text-[10px] text-text-muted text-center py-1">
                    +{entry.diffPreview.lines.length - 20} more lines
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {needsApproval && onApprove && (
              <button
                className="btn btn-sm rounded-md bg-accent/15 text-accent hover:bg-accent/25 border border-accent/30"
                onClick={() => onApprove(entry.stepId)}
              >
                Approve
              </button>
            )}
            {isFailed && onRetry && (
              <button
                className="btn btn-sm rounded-md bg-warning/15 text-warning hover:bg-warning/25 border border-warning/30"
                onClick={() => onRetry(entry.stepId)}
              >
                Retry
              </button>
            )}
            {entry.canRollback && (isCompleted || isFailed) && onRollback && (
              <button
                className="btn btn-sm rounded-md bg-bg-hover text-text-secondary hover:text-text-primary border border-border"
                onClick={() => onRollback(entry.stepId)}
              >
                Rollback
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main ExecutionTimeline Component ────────────────────────────────────────

interface ExecutionTimelineProps {
  timeline: ExecutionTimelineType;
  onApproveStep?: (stepId: string) => void;
  onRollbackStep?: (stepId: string) => void;
  onRetryStep?: (stepId: string) => void;
  onRollbackAll?: () => void;
}

const ExecutionTimelineComponent: React.FC<ExecutionTimelineProps> = ({
  timeline,
  onApproveStep,
  onRollbackStep,
  onRetryStep,
  onRollbackAll,
}) => {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const handleToggle = useCallback((stepId: string) => {
    setExpandedStep(prev => prev === stepId ? null : stepId);
  }, []);

  // Group entries by status for quick stats
  const stats = useMemo(() => {
    const entries = timeline.entries;
    return {
      total: entries.length,
      completed: entries.filter(e => e.status === 'completed').length,
      executing: entries.filter(e => e.status === 'executing').length,
      failed: entries.filter(e => e.status === 'failed').length,
      pending: entries.filter(e => e.status === 'pending').length,
      needsApproval: entries.filter(e => e.requiresApproval && e.status === 'pending').length,
    };
  }, [timeline.entries]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusIcon status={timeline.status} size={16} />
            <h3 className="text-sm font-semibold text-text-primary">{timeline.title}</h3>
          </div>
          {timeline.canRollbackAll && onRollbackAll && (
            <button
              className="btn btn-ghost btn-sm text-[10px] text-text-muted hover:text-danger"
              onClick={onRollbackAll}
            >
              Rollback All
            </button>
          )}
        </div>

        {/* Overall Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-bg-deep overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${timeline.overallProgress}%`,
                backgroundColor: timeline.overallProgress >= 100 ? 'var(--success)' : 'var(--accent)',
              }}
            />
          </div>
          <span className="text-[10px] font-mono text-text-muted w-8 text-right">
            {timeline.overallProgress}%
          </span>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-3 mt-2">
          {stats.completed > 0 && (
            <span className="text-[10px] text-success">{stats.completed} done</span>
          )}
          {stats.executing > 0 && (
            <span className="text-[10px] text-accent flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {stats.executing} running
            </span>
          )}
          {stats.failed > 0 && (
            <span className="text-[10px] text-danger">{stats.failed} failed</span>
          )}
          {stats.needsApproval > 0 && (
            <span className="text-[10px] text-warning">{stats.needsApproval} need approval</span>
          )}
          <span className="text-[10px] text-text-muted ml-auto">
            {timeline.checkpointCount} checkpoints
          </span>
        </div>
      </div>

      {/* Timeline Steps */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {timeline.entries.map((entry, index) => (
          <div key={entry.id} className="relative">
            {/* Timeline Connector */}
            {index < timeline.entries.length - 1 && (
              <div
                className="absolute left-[18px] top-[38px] w-px h-[calc(100%-8px)]"
                style={{
                  backgroundColor: entry.status === 'completed' ? 'rgba(34, 197, 94, 0.2)' : 'var(--border)',
                }}
              />
            )}
            <TimelineStepCard
              entry={entry}
              isExpanded={expandedStep === entry.id}
              onToggle={() => handleToggle(entry.id)}
              onApprove={onApproveStep}
              onRollback={onRollbackStep}
              onRetry={onRetryStep}
            />
          </div>
        ))}

        {timeline.entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-accent">
                <path d="M10 3L3 7l7 4 7-4-7-4z" fill="currentColor" opacity="0.3" />
                <path d="M3 10l7 4 7-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M3 14l7 4 7-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-text-muted">No execution steps yet.</p>
            <p className="text-[10px] text-text-muted mt-1">Start by asking the AI to build something.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionTimelineComponent;
