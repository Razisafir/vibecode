import { useState } from 'react';
import type { CrashInfo, ActivePlanInfo } from '../types';

interface CrashRecoveryModalProps {
  crashInfo: CrashInfo | null;
  onRestore: () => void;
  onStartFresh: () => void;
}

/**
 * Modal that appears on startup after a crash.
 * Shows what was happening and offers recovery options.
 */
export default function CrashRecoveryModal({ crashInfo, onRestore, onStartFresh }: CrashRecoveryModalProps) {
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = () => {
    setIsRestoring(true);
    onRestore();
  };

  const formatTimestamp = (ts: number): string => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return 'Unknown time';
    }
  };

  const formatReason = (reason: string): string => {
    switch (reason) {
      case 'crashed':
        return 'The application crashed unexpectedly';
      case 'oom':
        return 'The application ran out of memory';
      case 'killed':
        return 'The application was terminated by the system';
      default:
        return reason || 'An unexpected error occurred';
    }
  };

  const hasActivePlans = crashInfo?.activePlans && crashInfo.activePlans.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 text-warning">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Session Recovery
            </h2>
            <p className="text-sm text-text-tertiary">
              VibeCode recovered from an unexpected close
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Crash reason */}
          <div className="rounded-lg bg-bg-primary p-4">
            <p className="text-sm font-medium text-text-secondary">
              What happened:
            </p>
            <p className="mt-1 text-sm text-text-primary">
              {crashInfo ? formatReason(crashInfo.reason) : 'An unexpected error occurred'}
            </p>
            {crashInfo?.timestamp && (
              <p className="mt-2 text-xs text-text-tertiary">
                Last activity: {formatTimestamp(crashInfo.timestamp)}
              </p>
            )}
          </div>

          {/* Active executions */}
          {hasActivePlans && (
            <div className="rounded-lg bg-bg-primary p-4">
              <p className="text-sm font-medium text-text-secondary">
                Active executions at time of crash:
              </p>
              <ul className="mt-2 space-y-2">
                {crashInfo!.activePlans.map((plan: ActivePlanInfo) => (
                  <li
                    key={plan.planId}
                    className="flex items-center gap-2 text-sm text-text-primary"
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-warning" />
                    <span className="font-mono text-xs text-text-tertiary">
                      {plan.planId.slice(0, 8)}
                    </span>
                    <span className="text-text-secondary">—</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        plan.status === 'executing'
                          ? 'bg-accent/10 text-accent'
                          : plan.status === 'planning'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-bg-tertiary text-text-tertiary'
                      }`}
                    >
                      {plan.status}
                    </span>
                    <span className="text-text-tertiary">
                      step {plan.currentStepIndex + 1}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Unsaved changes notice */}
          {crashInfo?.unsavedChanges && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-warning">
                Your session had unsaved changes. Restoring will recover your
                open files, conversation history, and execution state.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onStartFresh}
            disabled={isRestoring}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
          >
            Start Fresh
          </button>
          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {isRestoring ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Restoring...
              </span>
            ) : (
              'Restore Session'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
