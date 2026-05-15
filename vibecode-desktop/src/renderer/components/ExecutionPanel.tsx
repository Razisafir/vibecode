import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { ExecutionTimeline, ExecutionTimelineEntry, ExecutionStatus } from '../types';
import ExecutionTimelineComponent from './ExecutionTimeline';

// ─── Execution Panel ─────────────────────────────────────────────────────────
// Container for execution timeline + status in the AI Panel

interface ExecutionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  width?: number;
}

// ─── Mock Data Generator (for development) ───────────────────────────────────

function generateMockTimeline(): ExecutionTimeline {
  const entries: ExecutionTimelineEntry[] = [
    {
      id: 'e1', planId: 'plan-1', stepId: 's1',
      title: 'Initialize project structure', description: 'Creating directories and config files',
      status: 'completed', type: 'file_create', riskLevel: 'low',
      startedAt: Date.now() - 300000, completedAt: Date.now() - 298000, duration: 2000,
      progress: 100, canRollback: true, requiresApproval: false, confidence: 95,
    },
    {
      id: 'e2', planId: 'plan-1', stepId: 's2',
      title: 'Install dependencies', description: 'Running npm install for core packages',
      status: 'completed', type: 'command', riskLevel: 'low',
      startedAt: Date.now() - 297000, completedAt: Date.now() - 290000, duration: 7000,
      progress: 100, canRollback: true, requiresApproval: false, confidence: 90,
      output: 'added 342 packages in 6.8s',
    },
    {
      id: 'e3', planId: 'plan-1', stepId: 's3',
      title: 'Create TypeScript config', description: 'Setting up tsconfig.json with strict mode',
      status: 'completed', type: 'file_create', riskLevel: 'low',
      startedAt: Date.now() - 289000, completedAt: Date.now() - 288500, duration: 500,
      progress: 100, canRollback: true, requiresApproval: false, confidence: 98,
    },
    {
      id: 'e4', planId: 'plan-1', stepId: 's4',
      title: 'Define data models', description: 'Creating Prisma schema with User and Post models',
      status: 'completed', type: 'code_generation', riskLevel: 'medium',
      startedAt: Date.now() - 288000, completedAt: Date.now() - 286000, duration: 2000,
      progress: 100, canRollback: true, requiresApproval: true, confidence: 88,
      diffPreview: {
        filePath: 'prisma/schema.prisma',
        additions: 24,
        deletions: 0,
        lines: [
          { type: 'context', content: '// Prisma Schema', lineNumber: 1 },
          { type: 'add', content: 'model User {', lineNumber: 2 },
          { type: 'add', content: '  id        String   @id @default(cuid())', lineNumber: 3 },
          { type: 'add', content: '  email     String   @unique', lineNumber: 4 },
          { type: 'add', content: '  name      String?', lineNumber: 5 },
          { type: 'add', content: '  posts     Post[]', lineNumber: 6 },
          { type: 'add', content: '}', lineNumber: 7 },
        ],
      },
    },
    {
      id: 'e5', planId: 'plan-1', stepId: 's5',
      title: 'Build API routes', description: 'Creating REST endpoints for users and posts',
      status: 'executing', type: 'code_generation', riskLevel: 'medium',
      startedAt: Date.now() - 285000, progress: 65,
      canRollback: false, requiresApproval: true, confidence: 82,
      output: 'Generating /api/users route...',
    },
    {
      id: 'e6', planId: 'plan-1', stepId: 's6',
      title: 'Build UI components', description: 'Creating React components for the interface',
      status: 'pending', type: 'code_generation', riskLevel: 'medium',
      progress: 0, canRollback: false, requiresApproval: true, confidence: 75,
    },
    {
      id: 'e7', planId: 'plan-1', stepId: 's7',
      title: 'Integration testing', description: 'End-to-end feature validation',
      status: 'pending', type: 'command', riskLevel: 'low',
      progress: 0, canRollback: false, requiresApproval: false, confidence: 80,
    },
  ];

  return {
    planId: 'plan-1',
    title: 'Build Next.js E-commerce App',
    entries,
    overallProgress: Math.round((4.65 / entries.length) * 100),
    startedAt: Date.now() - 300000,
    status: 'executing',
    checkpointCount: 3,
    canRollbackAll: true,
  };
}

// ─── Execution Panel Component ───────────────────────────────────────────────

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ isOpen, onToggle, width = 380 }) => {
  const [timeline, setTimeline] = useState<ExecutionTimeline>(generateMockTimeline);
  const [activeTab, setActiveTab] = useState<'execution' | 'terminal'>('execution');

  const handleApproveStep = useCallback((stepId: string) => {
    setTimeline(prev => ({
      ...prev,
      entries: prev.entries.map(e =>
        e.stepId === stepId ? { ...e, status: 'approved' as ExecutionStatus, requiresApproval: false } : e
      ),
    }));
  }, []);

  const handleRollbackStep = useCallback((stepId: string) => {
    setTimeline(prev => ({
      ...prev,
      entries: prev.entries.map(e =>
        e.stepId === stepId ? { ...e, status: 'pending' as ExecutionStatus, progress: 0, startedAt: undefined, completedAt: undefined, duration: undefined } : e
      ),
    }));
  }, []);

  const handleRetryStep = useCallback((stepId: string) => {
    setTimeline(prev => ({
      ...prev,
      entries: prev.entries.map(e =>
        e.stepId === stepId ? { ...e, status: 'executing' as ExecutionStatus, progress: 0, error: undefined, startedAt: Date.now() } : e
      ),
    }));
  }, []);

  const handleRollbackAll = useCallback(() => {
    setTimeline(prev => ({
      ...prev,
      entries: prev.entries.map(e => ({
        ...e,
        status: 'pending' as ExecutionStatus,
        progress: 0,
        startedAt: undefined,
        completedAt: undefined,
        duration: undefined,
        error: undefined,
        output: undefined,
      })),
      overallProgress: 0,
      checkpointCount: 0,
    }));
  }, []);

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
          {timeline.status === 'executing' && (
            <div className="flex items-center gap-1 text-[10px] text-accent">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Running
            </div>
          )}
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
          <ExecutionTimelineComponent
            timeline={timeline}
            onApproveStep={handleApproveStep}
            onRollbackStep={handleRollbackStep}
            onRetryStep={handleRetryStep}
            onRollbackAll={handleRollbackAll}
          />
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
