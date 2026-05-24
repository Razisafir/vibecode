// ─── VibeCode Desktop — Terminal Intelligence Overlay ──────────────────────────
// ARC 20 P0-4: AI-aware terminal experience
//
// Shows:
//   - Command intent detection
//   - Risk warnings before execution
//   - Failure diagnosis after errors
//   - Suggested fixes with one-click apply
//   - Command recommendations
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'caution' | 'dangerous' | 'destructive';

export interface CommandAnalysis {
  command: string;
  summary: string;
  intent: string;
  risk: RiskLevel;
  riskReason?: string;
  alternatives?: string[];
  shouldIntervene: boolean;
  interventionMessage?: string;
}

export interface FailureDiagnosis {
  command: string;
  exitCode: number;
  diagnosis: string;
  suggestedFix: string;
  confidence: number;
  canAutoFix: boolean;
  autoFixCommand?: string;
}

export interface CommandRecommendation {
  command: string;
  reason: string;
  category: string;
  confidence: number;
}

export interface TerminalIntelligenceOverlayProps {
  /** Current analysis of the typed command */
  analysis?: CommandAnalysis | null;
  /** Latest failure diagnosis */
  diagnosis?: FailureDiagnosis | null;
  /** Recommended next commands */
  recommendations?: CommandRecommendation[];
  /** On apply auto-fix */
  onApplyFix?: (command: string) => void;
  /** On dismiss */
  onDismiss?: () => void;
  /** On recommendation click */
  onRecommendationClick?: (command: string) => void;
}

// ─── Risk Colors ─────────────────────────────────────────────────────────

const RISK_STYLES: Record<RiskLevel, { bg: string; border: string; text: string; icon: string }> = {
  safe: {
    bg: 'bg-success/5',
    border: 'border-success/20',
    text: 'text-success',
    icon: '✓',
  },
  caution: {
    bg: 'bg-amber-400/5',
    border: 'border-amber-400/20',
    text: 'text-amber-400',
    icon: '⚠',
  },
  dangerous: {
    bg: 'bg-error/5',
    border: 'border-error/20',
    text: 'text-error',
    icon: '⛔',
  },
  destructive: {
    bg: 'bg-error/10',
    border: 'border-error/40',
    text: 'text-error',
    icon: '🚫',
  },
};

// ─── Component ───────────────────────────────────────────────────────────

const TerminalIntelligenceOverlay: React.FC<TerminalIntelligenceOverlayProps> = ({
  analysis,
  diagnosis,
  recommendations = [],
  onApplyFix,
  onDismiss,
  onRecommendationClick,
}) => {
  const [visible, setVisible] = useState(true);

  // Auto-hide after 30 seconds if no interaction
  useEffect(() => {
    if (!analysis && !diagnosis) {
      setVisible(false);
      return;
    }
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
    }, 30000);

    return () => clearTimeout(timer);
  }, [analysis, diagnosis]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    onDismiss?.();
  }, [onDismiss]);

  if (!visible) return null;
  if (!analysis && !diagnosis && recommendations.length === 0) return null;

  return (
    <div className="terminal-intelligence space-y-2 p-2 text-xs">
      {/* ── Pre-Execution Analysis ── */}
      {analysis && (
        <div className={`rounded-md border p-2 ${RISK_STYLES[analysis.risk].bg} ${RISK_STYLES[analysis.risk].border}`}>
          {/* Risk indicator */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className={RISK_STYLES[analysis.risk].text}>
                {RISK_STYLES[analysis.risk].icon}
              </span>
              <span className={`font-medium ${RISK_STYLES[analysis.risk].text}`}>
                {analysis.risk === 'safe' ? 'Safe' :
                 analysis.risk === 'caution' ? 'Caution' :
                 analysis.risk === 'dangerous' ? 'Dangerous' :
                 'Destructive'}
              </span>
              <span className="text-text-muted">
                — {analysis.summary}
              </span>
            </div>
            <button
              className="text-text-muted hover:text-text-secondary text-[10px]"
              onClick={handleDismiss}
            >
              ✕
            </button>
          </div>

          {/* Risk reason */}
          {analysis.riskReason && (
            <p className={`text-[11px] ${RISK_STYLES[analysis.risk].text} mb-1`}>
              {analysis.riskReason}
            </p>
          )}

          {/* Intervention warning */}
          {analysis.shouldIntervene && analysis.interventionMessage && (
            <div className="rounded bg-bg-deep/50 p-1.5 text-[11px] text-text-secondary">
              {analysis.interventionMessage}
            </div>
          )}

          {/* Safer alternatives */}
          {analysis.alternatives && analysis.alternatives.length > 0 && (
            <div className="mt-1">
              <span className="text-text-muted text-[10px]">Safer alternatives:</span>
              {analysis.alternatives.map((alt, idx) => (
                <div key={idx} className="flex items-center gap-1 mt-0.5">
                  <code className="text-[11px] text-accent font-mono bg-bg-deep px-1 rounded">
                    {alt}
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Failure Diagnosis ── */}
      {diagnosis && (
        <div className="rounded-md border border-error/20 bg-error/5 p-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-error">✕</span>
              <span className="text-error font-medium">Command Failed</span>
              <span className="text-text-muted text-[10px]">
                (exit {diagnosis.exitCode})
              </span>
            </div>
            <button
              className="text-text-muted hover:text-text-secondary text-[10px]"
              onClick={handleDismiss}
            >
              ✕
            </button>
          </div>

          {/* Diagnosis */}
          <p className="text-[11px] text-text-secondary mb-1">
            {diagnosis.diagnosis}
          </p>

          {/* Suggested fix */}
          <div className="rounded bg-bg-deep/50 p-1.5">
            <span className="text-[10px] text-text-muted">Suggested fix: </span>
            <span className="text-[11px] text-text-primary">{diagnosis.suggestedFix}</span>
          </div>

          {/* Auto-fix button */}
          {diagnosis.canAutoFix && diagnosis.autoFixCommand && onApplyFix && (
            <button
              className="mt-1.5 rounded bg-accent/20 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/30 transition-colors"
              onClick={() => onApplyFix(diagnosis.autoFixCommand!)}
            >
              Apply Fix: <code className="font-mono">{diagnosis.autoFixCommand}</code>
            </button>
          )}
        </div>
      )}

      {/* ── Command Recommendations ── */}
      {recommendations.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-text-muted">Suggested next steps:</span>
          {recommendations.slice(0, 3).map((rec, idx) => (
            <button
              key={idx}
              className="flex items-center gap-1.5 w-full rounded px-1.5 py-0.5 text-[11px] hover:bg-bg-elevated transition-colors text-left"
              onClick={() => onRecommendationClick?.(rec.command)}
            >
              <span className="text-accent">→</span>
              <code className="font-mono text-text-secondary">{rec.command}</code>
              <span className="text-text-muted text-[10px] truncate">{rec.reason}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TerminalIntelligenceOverlay;
