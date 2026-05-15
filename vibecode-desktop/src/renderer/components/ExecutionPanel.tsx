// ─── VibeCode Desktop — Execution Panel ──────────────────────────────────────
// Container for execution timeline + status in the AI Panel
// ARC 12: Converged to use ExecutionTimeline (ESM-based) directly
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import ExecutionTimeline from './ExecutionTimeline';

interface ExecutionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width?: number;
}

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ isOpen, onToggle, width = 380 }) => {
  const [activeTab, setActiveTab] = useState<'execution' | 'terminal'>('execution');

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full border-l border-border bg-bg-surface" style={{ width: `${width}px` }}>
      {/* Tab Selector */}
      <div className="flex items-center border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-0.5 bg-bg-deep rounded-md p-0.5">
          <button
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all duration-150 ${
              activeTab === 'execution'
                ? 'bg-bg-elevated text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => setActiveTab('execution')}
          >
            Execution
          </button>
          <button
            className={`px-2.5 py-1 rounded text-[10px] font-medium transition-all duration-150 ${
              activeTab === 'terminal'
                ? 'bg-bg-elevated text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => setActiveTab('terminal')}
          >
            Terminal
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            className="btn-icon btn-ghost rounded p-1"
            onClick={onToggle}
            title="Close panel"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'execution' ? (
          <ExecutionTimeline />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevated mb-3">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-text-muted">
                <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5 7h8M5 9h6M5 11h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-text-muted">Terminal output will appear here</p>
            <p className="text-[10px] text-text-muted mt-1">Commands from AI execution steps</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionPanel;
