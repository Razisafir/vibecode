// ─── VibeCode Desktop — Execution Timeline ──────────────────────────────────
// Single source of truth view for all execution state.
// Shows the full execution graph as a live timeline.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useExecutionStateMachine } from '../hooks/useExecutionStateMachine';
import type { ExecutionNode, NodeState, RiskLevel } from '../hooks/useExecutionStateMachine';

// ─── State Badge ──────────────────────────────────────────────────────────

const STATE_STYLES: Record<NodeState, { bg: string; text: string; label: string }> = {
  planned:     { bg: 'bg-gray-700',   text: 'text-gray-300',   label: 'Planned' },
  queued:      { bg: 'bg-blue-900',   text: 'text-blue-300',   label: 'Queued' },
  approved:    { bg: 'bg-cyan-900',   text: 'text-cyan-300',   label: 'Approved' },
  executing:   { bg: 'bg-amber-900',  text: 'text-amber-300',  label: 'Executing' },
  completed:   { bg: 'bg-emerald-900',text: 'text-emerald-300', label: 'Completed' },
  failed:      { bg: 'bg-red-900',    text: 'text-red-300',    label: 'Failed' },
  rolled_back: { bg: 'bg-purple-900', text: 'text-purple-300', label: 'Rolled Back' },
  cancelled:   { bg: 'bg-gray-800',   text: 'text-gray-400',   label: 'Cancelled' },
};

const RISK_STYLES: Record<RiskLevel, string> = {
  low:      'text-emerald-400',
  medium:   'text-amber-400',
  high:     'text-orange-400',
  critical: 'text-red-400',
};

const TYPE_ICONS: Record<string, string> = {
  ai_reasoning:     '🧠',
  monaco_edit:      '✏️',
  terminal_command: '⌨️',
  file_mutation:    '📄',
  safety_check:     '🛡️',
  rollback:         '↩️',
  plan:             '📋',
  step:             '⚡',
};

function StateBadge({ state }: { state: NodeState }) {
  const style = STATE_STYLES[state];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function SafetyMeter({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
        {score}
      </span>
    </div>
  );
}

// ─── Timeline Node ───────────────────────────────────────────────────────

function TimelineNode({
  node,
  isExpanded,
  onToggle,
  onApprove,
  onExecute,
  onRollback,
  onRetry,
  onCancel,
  children,
}: {
  node: ExecutionNode;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: (id: string) => void;
  onExecute: (id: string) => void;
  onRollback: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  children?: React.ReactNode;
}) {
  const icon = TYPE_ICONS[node.type] || '•';
  const hasChildren = node.childIds.length > 0;
  const duration = node.completedAt && node.startedAt
    ? `${((node.completedAt - node.startedAt) / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="group">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
          hover:bg-gray-800/60 transition-colors ${isExpanded ? 'bg-gray-800/40' : ''}`}
        onClick={onToggle}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <span className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        ) : (
          <span className="w-3" />
        )}

        {/* Icon */}
        <span className="text-sm">{icon}</span>

        {/* Title + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-200 truncate">{node.title}</span>
            <StateBadge state={node.state} />
          </div>
          {node.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{node.description}</p>
          )}
        </div>

        {/* Safety score */}
        <SafetyMeter score={node.safetyScore} />

        {/* Duration */}
        {duration && (
          <span className="text-xs text-gray-500">{duration}</span>
        )}

        {/* Risk level */}
        <span className={`text-xs font-medium ${RISK_STYLES[node.riskLevel]}`}>
          {node.riskLevel}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {node.type === 'plan' && node.state === 'planned' && (
            <button
              onClick={(e) => { e.stopPropagation(); onApprove(node.id); }}
              className="px-2 py-0.5 text-xs bg-cyan-900/50 text-cyan-300 rounded hover:bg-cyan-800/50"
            >
              Approve
            </button>
          )}
          {node.type === 'plan' && node.state === 'approved' && (
            <button
              onClick={(e) => { e.stopPropagation(); onExecute(node.id); }}
              className="px-2 py-0.5 text-xs bg-amber-900/50 text-amber-300 rounded hover:bg-amber-800/50"
            >
              Execute
            </button>
          )}
          {(node.state === 'completed') && (
            <button
              onClick={(e) => { e.stopPropagation(); onRollback(node.id); }}
              className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-300 rounded hover:bg-purple-800/50"
            >
              Undo
            </button>
          )}
          {node.state === 'failed' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(node.id); }}
              className="px-2 py-0.5 text-xs bg-orange-900/50 text-orange-300 rounded hover:bg-orange-800/50"
            >
              Retry
            </button>
          )}
          {node.state === 'executing' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(node.id); }}
              className="px-2 py-0.5 text-xs bg-red-900/50 text-red-300 rounded hover:bg-red-800/50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="ml-6 border-l border-gray-700/50 pl-2 mt-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function ExecutionTimeline() {
  const {
    nodes,
    rootIds,
    isLoading,
    getChildren,
    getPlans,
    getPlanProgress,
    approvePlan,
    executePlan,
    rollbackPlan,
    rollbackStep,
    retryStep,
    cancelPlan,
    onEvent,
    loadGraph,
  } = useExecutionStateMachine();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Auto-expand plans that are executing
  useEffect(() => {
    const unsub = onEvent((event) => {
      if (event.newState === 'executing' || event.type === 'node:created') {
        setExpandedIds(prev => {
          const next = new Set(prev);
          const node = nodes.get(event.nodeId);
          if (node?.type === 'plan') next.add(event.nodeId);
          if (node?.parentId) next.add(node.parentId);
          return next;
        });
      }
    });
    return unsub;
  }, [onEvent, nodes]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredRootIds = useMemo(() => {
    if (filter === 'all') return rootIds;

    return rootIds.filter(id => {
      const node = nodes.get(id);
      if (!node) return false;

      if (filter === 'active') {
        return ['planned', 'queued', 'approved', 'executing'].includes(node.state);
      }
      if (filter === 'completed') {
        return ['completed', 'failed', 'rolled_back', 'cancelled'].includes(node.state);
      }
      return true;
    });
  }, [rootIds, nodes, filter]);

  // Stats
  const plans = getPlans();
  const activePlans = plans.filter(p => ['planned', 'approved', 'executing'].includes(p.state));
  const totalSteps = plans.reduce((sum, p) => sum + getChildren(p.id).length, 0);
  const completedSteps = plans.reduce((sum, p) => sum + getPlanProgress(p.id).completed, 0);

  const handleApprove = async (id: string) => {
    await approvePlan(id);
  };

  const handleExecute = async (id: string) => {
    await executePlan(id);
  };

  const handleRollback = async (id: string) => {
    const node = nodes.get(id);
    if (node?.type === 'plan') {
      await rollbackPlan(id);
    } else {
      await rollbackStep(id);
    }
  };

  const handleRetry = async (id: string) => {
    await retryStep(id);
  };

  const handleCancel = async (id: string) => {
    await cancelPlan(id);
  };

  // Render a node and its children recursively
  const renderNode = (nodeId: string): React.ReactNode => {
    const node = nodes.get(nodeId);
    if (!node) return null;

    const children = getChildren(nodeId);
    const isExpanded = expandedIds.has(nodeId);

    return (
      <TimelineNode
        key={nodeId}
        node={node}
        isExpanded={isExpanded}
        onToggle={() => toggleExpand(nodeId)}
        onApprove={handleApprove}
        onExecute={handleExecute}
        onRollback={handleRollback}
        onRetry={handleRetry}
        onCancel={handleCancel}
      >
        {children.map(child => renderNode(child.id))}
      </TimelineNode>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Execution Timeline</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {activePlans.length} active · {completedSteps}/{totalSteps} steps completed
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {(['all', 'active', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-xs ${
                  filter === f ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={loadGraph}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 rounded border border-gray-700 hover:border-gray-600"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            Loading execution graph...
          </div>
        ) : filteredRootIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <span className="text-2xl mb-2">📋</span>
            <span className="text-sm">No execution history yet</span>
            <span className="text-xs text-gray-600 mt-1">Ask AI to make changes and they'll appear here</span>
          </div>
        ) : (
          filteredRootIds.map(id => renderNode(id))
        )}
      </div>
    </div>
  );
}
