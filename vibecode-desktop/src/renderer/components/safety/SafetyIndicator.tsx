// ============================================================
// VibeCode Desktop — SafetyIndicator Component
// Visual indicator for current execution safety status
// ============================================================

import React, { useState, useMemo } from 'react';
import type { SafetyWarning } from '../../hooks/useExecutionSafety';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SafetyIndicatorProps {
  safetyScore: number;
  warnings: SafetyWarning[];
  hasActivePlan: boolean;
  onClick?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type SafetyTier = 'safe' | 'caution' | 'danger';

function getSafetyTier(score: number): SafetyTier {
  if (score > 80) return 'safe';
  if (score >= 40) return 'caution';
  return 'danger';
}

const TIER_CONFIG: Record<SafetyTier, { icon: React.ReactNode; label: string; colorClass: string; bgClass: string; borderClass: string; ringClass: string }> = {
  safe: {
    label: 'Safe',
    colorClass: 'text-[var(--success)]',
    bgClass: 'bg-[var(--success-muted)]',
    borderClass: 'border-[rgba(34,197,94,0.3)]',
    ringClass: 'ring-[rgba(34,197,94,0.2)]',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--success)]" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 1L1.5 3.5v3.5c0 3.1 2.35 6 5.5 6.65 3.15-.65 5.5-3.55 5.5-6.65V3.5L7 1z" />
        <polyline points="4.5,7 6.5,9 9.5,5.5" />
      </svg>
    ),
  },
  caution: {
    label: 'Caution',
    colorClass: 'text-[var(--warning)]',
    bgClass: 'bg-[var(--warning-muted)]',
    borderClass: 'border-[rgba(245,158,11,0.3)]',
    ringClass: 'ring-[rgba(245,158,11,0.2)]',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--warning)]" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 1.5L1 12h12L7 1.5z" />
        <line x1="7" y1="5.5" x2="7" y2="8.5" />
        <circle cx="7" cy="10" r="0.25" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  danger: {
    label: 'Danger',
    colorClass: 'text-[var(--danger)]',
    bgClass: 'bg-[var(--danger-muted)]',
    borderClass: 'border-[rgba(239,68,68,0.3)]',
    ringClass: 'ring-[rgba(239,68,68,0.2)]',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--danger)]" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5.5" />
        <line x1="5" y1="5" x2="9" y2="9" />
        <line x1="9" y1="5" x2="5" y2="9" />
      </svg>
    ),
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

const SafetyIndicator: React.FC<SafetyIndicatorProps> = ({
  safetyScore,
  warnings,
  hasActivePlan,
  onClick,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const tier = getSafetyTier(safetyScore);
  const config = TIER_CONFIG[tier];

  const activeWarnings = useMemo(
    () => warnings.filter((w) => !w.dismissed),
    [warnings],
  );

  const warningCount = activeWarnings.length;

  // Don't render anything if there's no active plan
  if (!hasActivePlan) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-[var(--text-muted)] cursor-default select-none"
        aria-label="No active execution plan"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-40">
          <path
            d="M6 .5L1.5 3.25v3.5c0 2.8 1.9 5.4 4.5 6 2.6-.6 4.5-3.2 4.5-6v-3.5L6 .5z"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
        <span>No plan</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className={`
          flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold
          transition-all duration-150 select-none cursor-pointer
          border ${config.borderClass}
          ${config.bgClass}
          ${config.colorClass}
          hover:brightness-110
          active:scale-95
        `}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onClick={onClick}
        aria-label={`Safety score: ${safetyScore}/100 — ${config.label}${warningCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''}`}
        type="button"
      >
        {config.icon}
        <span>{safetyScore}</span>
        {warningCount > 0 && (
          <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold bg-current/20 text-current leading-none">
            {warningCount > 9 ? '9+' : warningCount}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={`
            absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
            w-56 rounded-md border shadow-lg
            bg-[var(--bg-elevated)] border-[var(--border)]
            animate-fade-in
          `}
          role="tooltip"
        >
          {/* Tooltip header */}
          <div className={`flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] ${config.bgClass} rounded-t-md`}>
            {config.icon}
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-semibold ${config.colorClass}`}>
                {config.label}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                Safety score: {safetyScore}/100
              </div>
            </div>
            {/* Score bar */}
            <div className="w-12 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden flex-shrink-0">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  tier === 'safe'
                    ? 'bg-[var(--success)]'
                    : tier === 'caution'
                      ? 'bg-[var(--warning)]'
                      : 'bg-[var(--danger)]'
                }`}
                style={{ width: `${safetyScore}%` }}
              />
            </div>
          </div>

          {/* Tooltip body — warnings list */}
          <div className="px-3 py-2 max-h-48 overflow-y-auto scrollbar-custom">
            {activeWarnings.length === 0 ? (
              <p className="text-[10px] text-[var(--text-muted)]">
                No active warnings. All steps look safe.
              </p>
            ) : (
              <div className="space-y-1.5">
                {activeWarnings.slice(0, 5).map((warning) => (
                  <div
                    key={warning.id}
                    className="flex items-start gap-1.5 text-[10px]"
                  >
                    <span className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                      warning.type === 'destructive_action' || warning.type === 'high_risk_operation'
                        ? 'bg-[var(--danger)]'
                        : warning.type === 'dependency_conflict' || warning.type === 'config_modification'
                          ? 'bg-[var(--warning)]'
                          : 'bg-[var(--text-muted)]'
                    }`} />
                    <span className="text-[var(--text-secondary)] leading-tight">
                      {warning.message}
                    </span>
                  </div>
                ))}
                {activeWarnings.length > 5 && (
                  <p className="text-[10px] text-[var(--text-muted)] italic">
                    +{activeWarnings.length - 5} more warning{activeWarnings.length - 5 !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tooltip footer */}
          <div className="px-3 py-1.5 border-t border-[var(--border)] rounded-b-md">
            <p className="text-[9px] text-[var(--text-muted)]">
              Click for full safety details
            </p>
          </div>

          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 rotate-45 border-r border-b border-[var(--border)] bg-[var(--bg-elevated)]" />
          </div>
        </div>
      )}
    </div>
  );
};

export default SafetyIndicator;
