// ─── VibeCode Desktop — Agent Status Component ────────────────────────────────
// ARC 20 P0-2/P0-6: Shows the AI agent's current lifecycle state
// with product-friendly terminology (no "kernels" or "gateways").
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────

export type AgentLifecycleState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'executing'
  | 'validating'
  | 'retrying'
  | 'reflecting'
  | 'completed'
  | 'blocked'
  | 'failed';

export interface AgentStepInfo {
  title: string;
  state: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  progress?: number;
}

export interface AgentStatusProps {
  /** Current lifecycle state */
  state: AgentLifecycleState;
  /** Current goal */
  goal?: string;
  /** Steps progress */
  steps?: AgentStepInfo[];
  /** Current step index */
  currentStepIndex?: number;
  /** On cancel */
  onCancel?: () => void;
  /** On approve (when blocked) */
  onApprove?: () => void;
  /** On reject (when blocked) */
  onReject?: () => void;
  /** Compact mode (for status bar) */
  compact?: boolean;
}

// ─── Product-friendly state labels ───────────────────────────────────────

const STATE_LABELS: Record<AgentLifecycleState, string> = {
  idle: 'Ready',
  thinking: 'Thinking...',
  planning: 'Making a plan',
  executing: 'Working on it',
  validating: 'Checking results',
  retrying: 'Trying a different approach',
  reflecting: 'Reviewing work',
  completed: 'Done',
  blocked: 'Needs your input',
  failed: 'Something went wrong',
};

const STATE_ICONS: Record<AgentLifecycleState, string> = {
  idle: '●',
  thinking: '◐',
  planning: '📋',
  executing: '⚡',
  validating: '✓',
  retrying: '↻',
  reflecting: '🔍',
  completed: '✅',
  blocked: '⚠',
  failed: '✕',
};

const STATE_COLORS: Record<AgentLifecycleState, string> = {
  idle: 'text-text-muted',
  thinking: 'text-accent',
  planning: 'text-blue-400',
  executing: 'text-accent',
  validating: 'text-blue-400',
  retrying: 'text-amber-400',
  reflecting: 'text-text-secondary',
  completed: 'text-success',
  blocked: 'text-amber-400',
  failed: 'text-error',
};

// ─── Component ───────────────────────────────────────────────────────────

const AgentStatus: React.FC<AgentStatusProps> = ({
  state,
  goal,
  steps = [],
  currentStepIndex,
  onCancel,
  onApprove,
  onReject,
  compact = false,
}) => {
  const [elapsed, setElapsed] = useState(0);

  // Track elapsed time while active
  useEffect(() => {
    if (state === 'idle' || state === 'completed' || state === 'failed') {
      setElapsed(0);
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [state]);

  const isActive = !['idle', 'completed', 'failed'].includes(state);
  const completedSteps = steps.filter(s => s.state === 'completed').length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // ─── Compact mode (status bar) ──────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {isActive && (
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${
            state === 'executing' ? 'bg-accent animate-pulse' :
            state === 'blocked' ? 'bg-amber-400' :
            'bg-blue-400 animate-pulse'
          }`} />
        )}
        <span className={`text-[10px] font-mono ${STATE_COLORS[state]}`}>
          {STATE_LABELS[state]}
        </span>
        {isActive && elapsed > 0 && (
          <span className="text-[10px] text-text-muted font-mono">
            {elapsed}s
          </span>
        )}
        {totalSteps > 0 && (
          <span className="text-[10px] text-text-muted font-mono">
            {completedSteps}/{totalSteps}
          </span>
        )}
      </div>
    );
  }

  // ─── Full mode (panel) ──────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-base ${STATE_COLORS[state]} ${
            isActive ? 'animate-pulse' : ''
          }`}>
            {STATE_ICONS[state]}
          </span>
          <span className={`text-sm font-semibold ${STATE_COLORS[state]}`}>
            {STATE_LABELS[state]}
          </span>
          {isActive && elapsed > 0 && (
            <span className="text-xs text-text-muted font-mono">
              {elapsed}s
            </span>
          )}
        </div>

        {isActive && onCancel && (
          <button
            className="rounded px-2 py-0.5 text-xs text-error hover:bg-error/10 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>

      {/* Goal */}
      {goal && (
        <p className="text-xs text-text-secondary">{goal}</p>
      )}

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>{completedSteps} of {totalSteps} steps</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-bg-deep overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps list */}
      {steps.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className={
                step.state === 'completed' ? 'text-success' :
                step.state === 'executing' ? 'text-accent animate-pulse' :
                step.state === 'failed' ? 'text-error' :
                step.state === 'skipped' ? 'text-text-muted' :
                'text-text-muted'
              }>
                {step.state === 'completed' ? '✓' :
                 step.state === 'executing' ? '●' :
                 step.state === 'failed' ? '✕' :
                 step.state === 'skipped' ? '—' :
                 '○'}
              </span>
              <span className={
                step.state === 'completed' ? 'text-text-secondary line-through' :
                step.state === 'executing' ? 'text-text-primary font-medium' :
                step.state === 'failed' ? 'text-error' :
                'text-text-muted'
              }>
                {step.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Blocked: approval buttons */}
      {state === 'blocked' && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button
            className="rounded-md bg-success/20 px-3 py-1.5 text-xs text-success hover:bg-success/30 transition-colors"
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            className="rounded-md bg-error/20 px-3 py-1.5 text-xs text-error hover:bg-error/30 transition-colors"
            onClick={onReject}
          >
            Reject
          </button>
        </div>
      )}

      {/* Failed: retry suggestion */}
      {state === 'failed' && (
        <div className="rounded-md bg-error/5 border border-error/20 p-2">
          <p className="text-xs text-error">
            The task couldn't be completed. You can try again or take a different approach.
          </p>
        </div>
      )}
    </div>
  );
};

export default AgentStatus;
