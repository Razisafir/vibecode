// ============================================================
// VibeCode Desktop — AI Editor Overlay
// A React overlay that renders on top of the Monaco editor to
// show AI status, inline accept/reject buttons, and progress.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ─── Props ───────────────────────────────────────────────────

export interface AIEditorOverlayProps {
  /** Current AI status */
  aiStatus: 'idle' | 'thinking' | 'streaming' | 'editing' | 'error';
  /** Whether there are active diff decorations */
  hasDiffs: boolean;
  /** Number of diff changes shown */
  diffCount: number;
  /** AI operation progress (0–100) */
  progress: number;
  /** Accept all changes */
  onAcceptAll: () => void;
  /** Reject all changes */
  onRejectAll: () => void;
  /** Accept a single change by ID */
  onAcceptChange: (id: string) => void;
  /** Reject a single change by ID */
  onRejectChange: (id: string) => void;
}

// ─── Status Configuration ────────────────────────────────────

interface StatusConfig {
  label: string;
  dotColor: string;
  badgeBg: string;
  badgeBorder: string;
  animate: boolean;
}

const STATUS_CONFIG: Record<AIEditorOverlayProps['aiStatus'], StatusConfig> = {
  idle: {
    label: 'AI Ready',
    dotColor: 'bg-success',
    badgeBg: 'bg-success/10',
    badgeBorder: 'border-success/20',
    animate: false,
  },
  thinking: {
    label: 'Thinking',
    dotColor: 'bg-accent',
    badgeBg: 'bg-accent/10',
    badgeBorder: 'border-accent/20',
    animate: true,
  },
  streaming: {
    label: 'Streaming',
    dotColor: 'bg-accent',
    badgeBg: 'bg-accent/10',
    badgeBorder: 'border-accent/20',
    animate: true,
  },
  editing: {
    label: 'Editing',
    dotColor: 'bg-warning',
    badgeBg: 'bg-warning/10',
    badgeBorder: 'border-warning/20',
    animate: true,
  },
  error: {
    label: 'Error',
    dotColor: 'bg-danger',
    badgeBg: 'bg-danger/10',
    badgeBorder: 'border-danger/20',
    animate: false,
  },
};

// ─── Component ───────────────────────────────────────────────

const AIEditorOverlay: React.FC<AIEditorOverlayProps> = ({
  aiStatus,
  hasDiffs,
  diffCount,
  progress,
  onAcceptAll,
  onRejectAll,
  onAcceptChange,
  onRejectChange,
}) => {
  const [showDiffActions, setShowDiffActions] = useState(false);
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const prevStatusRef = useRef(aiStatus);

  // Show diff action bar when diffs are present
  useEffect(() => {
    if (hasDiffs) {
      setShowDiffActions(true);
    } else {
      setShowDiffActions(false);
    }
  }, [hasDiffs]);

  // Show progress bar when AI is active
  useEffect(() => {
    const isActive = aiStatus !== 'idle';
    if (isActive) {
      setIsProgressVisible(true);
    } else if (prevStatusRef.current !== 'idle') {
      // Brief delay before hiding progress on completion
      const timer = setTimeout(() => setIsProgressVisible(false), 600);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = aiStatus;
  }, [aiStatus]);

  const config = STATUS_CONFIG[aiStatus];

  const handleAcceptAll = useCallback(() => {
    onAcceptAll();
  }, [onAcceptAll]);

  const handleRejectAll = useCallback(() => {
    onRejectAll();
  }, [onRejectAll]);

  const handleAcceptChange = useCallback(
    (id: string) => () => {
      onAcceptChange(id);
    },
    [onAcceptChange],
  );

  const handleRejectChange = useCallback(
    (id: string) => () => {
      onRejectChange(id);
    },
    [onRejectChange],
  );

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* ── AI Status Indicator (Top-Right) ── */}
      <div className="absolute top-3 right-3 pointer-events-auto">
        <div
          className={`
            inline-flex items-center gap-2 px-3 py-1.5 rounded-md
            border backdrop-blur-sm
            transition-all duration-200 ease-out
            ${config.badgeBg} ${config.badgeBorder}
            ${config.animate ? 'animate-pulse-subtle' : ''}
          `}
        >
          <span
            className={`
              w-2 h-2 rounded-full flex-shrink-0
              ${config.dotColor}
              ${config.animate ? 'animate-pulse' : ''}
            `}
          />
          <span className="text-2xs font-medium text-text-secondary select-none">
            {config.label}
          </span>
        </div>
      </div>

      {/* ── AI Edit Progress Bar (Top) ── */}
      {isProgressVisible && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-bg-base/50">
          <div
            className={`
              h-full
              transition-all duration-300 ease-out
              ${aiStatus === 'error'
                ? 'bg-danger'
                : aiStatus === 'editing'
                  ? 'bg-warning'
                  : 'bg-accent'
              }
              ${aiStatus === 'streaming' || aiStatus === 'thinking'
                ? 'animate-shimmer'
                : ''
              }
            `}
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              opacity: aiStatus === 'idle' ? 0 : 1,
            }}
          />
          {/* Glow effect on the progress edge */}
          {progress > 0 && progress < 100 && aiStatus !== 'idle' && (
            <div
              className="absolute top-0 h-full w-8 blur-sm opacity-60"
              style={{
                left: `${Math.min(100, Math.max(0, progress)) - 3}%`,
                background: aiStatus === 'error'
                  ? '#ef4444'
                  : aiStatus === 'editing'
                    ? '#f59e0b'
                    : '#6366f1',
              }}
            />
          )}
        </div>
      )}

      {/* ── Inline Diff Action Bar (Top-Center, below progress) ── */}
      {showDiffActions && diffCount > 0 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto animate-slide-down">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated/95 border border-border backdrop-blur-md shadow-md">
            {/* Change count */}
            <span className="text-2xs font-medium text-text-muted select-none mr-1">
              {diffCount} change{diffCount !== 1 ? 's' : ''}
            </span>

            {/* Separator */}
            <div className="w-px h-4 bg-border" />

            {/* Accept All */}
            <button
              onClick={handleAcceptAll}
              className="
                inline-flex items-center gap-1 px-2 py-1 rounded
                text-2xs font-medium
                bg-success/10 text-success border border-success/20
                hover:bg-success/20 hover:border-success/30
                active:scale-95
                transition-all duration-150 ease-out
                cursor-pointer select-none
              "
              title="Accept all changes"
              aria-label="Accept all changes"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1.5 5L4 7.5L8.5 2.5" />
              </svg>
              Accept All
            </button>

            {/* Reject All */}
            <button
              onClick={handleRejectAll}
              className="
                inline-flex items-center gap-1 px-2 py-1 rounded
                text-2xs font-medium
                bg-danger/10 text-danger border border-danger/20
                hover:bg-danger/20 hover:border-danger/30
                active:scale-95
                transition-all duration-150 ease-out
                cursor-pointer select-none
              "
              title="Reject all changes"
              aria-label="Reject all changes"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* ── Per-Change Accept/Reject Buttons (Rendered per diff group) ── */}
      {/* These are virtual — actual per-change buttons are positioned by the
          overlay consumer using diff line positions. We render a template here
          that can be used to show inline actions next to each diff. */}
      {showDiffActions && (
        <DiffInlineActions
          diffCount={diffCount}
          onAcceptChange={handleAcceptChange}
          onRejectChange={handleRejectChange}
        />
      )}

      {/* ── AI Thinking Indicator (Bottom-Center) ── */}
      {(aiStatus === 'thinking' || aiStatus === 'streaming') && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto animate-slide-up">
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-bg-elevated/95 border border-accent/20 backdrop-blur-md shadow-md shadow-accent/5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-2xs font-medium text-text-secondary select-none">
              {aiStatus === 'thinking' ? 'AI is analyzing...' : 'AI is writing...'}
            </span>
          </div>
        </div>
      )}

      {/* ── Error Banner ── */}
      {aiStatus === 'error' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto animate-slide-up">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/10 border border-danger/30 backdrop-blur-md">
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-danger flex-shrink-0"
            >
              <circle cx="6" cy="6" r="4.5" />
              <path d="M6 3.5v3M6 8v0.5" />
            </svg>
            <span className="text-2xs font-medium text-danger select-none">
              AI encountered an error
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Diff Inline Actions Sub-component ───────────────────────

/**
 * Renders inline accept/reject action buttons for each diff change.
 * These appear as small floating buttons that can be positioned next to
 * individual diff decorations in the editor.
 */
interface DiffInlineActionsProps {
  diffCount: number;
  onAcceptChange: (id: string) => () => void;
  onRejectChange: (id: string) => () => void;
}

const DiffInlineActions: React.FC<DiffInlineActionsProps> = ({
  diffCount,
  onAcceptChange,
  onRejectChange,
}) => {
  // Generate placeholder change IDs — in production these would come
  // from the tracked changes in MonacoAIIntegration
  const changeIds = Array.from(
    { length: diffCount },
    (_, i) => `diff-change-${i}`,
  );

  return (
    <div className="absolute top-16 right-3 pointer-events-auto">
      <div className="flex flex-col gap-1.5">
        {changeIds.map((id, index) => (
          <div
            key={id}
            className="
              flex items-center gap-1 px-1.5 py-1 rounded
              bg-bg-elevated/90 border border-border
              backdrop-blur-sm
              transition-all duration-150 ease-out
              hover:border-border-emphasis
              animate-fade-in
            "
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Accept button */}
            <button
              onClick={onAcceptChange(id)}
              className="
                flex items-center justify-center
                w-5 h-5 rounded
                text-success
                hover:bg-success/15
                active:scale-90
                transition-all duration-100
                cursor-pointer
              "
              title="Accept change"
              aria-label={`Accept change ${index + 1}`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1.5 5L4 7.5L8.5 2.5" />
              </svg>
            </button>

            {/* Reject button */}
            <button
              onClick={onRejectChange(id)}
              className="
                flex items-center justify-center
                w-5 h-5 rounded
                text-danger
                hover:bg-danger/15
                active:scale-90
                transition-all duration-100
                cursor-pointer
              "
              title="Reject change"
              aria-label={`Reject change ${index + 1}`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </button>

            {/* Change label */}
            <span className="text-2xs text-text-muted select-none">
              #{index + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIEditorOverlay;
