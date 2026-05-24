// ─── VibeCode Desktop — Execution State Machine Hook ────────────────────────
// React hook that provides the single source of truth for execution state
// in the renderer. All execution UI components should read from this hook.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types (mirrors main process) ──────────────────────────────────────────

export type ExecutionNodeType =
  | 'ai_reasoning'
  | 'monaco_edit'
  | 'terminal_command'
  | 'file_mutation'
  | 'safety_check'
  | 'rollback'
  | 'plan'
  | 'step';

export type NodeState =
  | 'planned'
  | 'queued'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type UnifiedStepType =
  | 'file_write'
  | 'file_read'
  | 'file_edit'
  | 'file_delete'
  | 'command'
  | 'code_generation'
  | 'diff_apply'
  | 'analysis'
  | 'test'
  | 'ai_suggestion';

export interface ExecutionNode {
  id: string;
  type: ExecutionNodeType;
  state: NodeState;
  title: string;
  description: string;
  parentId: string | null;
  childIds: string[];
  dependsOn: string[];
  sourceIds: string[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;
  data: Record<string, unknown>;
  riskLevel: RiskLevel;
  safetyScore: number;
  requiresApproval: boolean;
  result?: { success: boolean; data?: Record<string, unknown>; duration?: number };
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface StateMachineEvent {
  type: string;
  nodeId: string;
  previousState?: NodeState;
  newState?: NodeState;
  timestamp: number;
}

export interface PlanProgress {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────

export function useExecutionStateMachine() {
  const [nodes, setNodes] = useState<Map<string, ExecutionNode>>(new Map());
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [lastEvent, setLastEvent] = useState<StateMachineEvent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const eventListenersRef = useRef<((event: StateMachineEvent) => void)[]>([]);

  // Subscribe to push events from main process
  useEffect(() => {
    const api = window.vibecode as any;

    if (api?.sm?.onEvent) {
      api.sm.onEvent((event: StateMachineEvent) => {
        setLastEvent(event);

        // Notify local listeners
        for (const listener of eventListenersRef.current) {
          try {
            listener(event);
          } catch {
            // Listener error — ignore
          }
        }
      });
    }

    // Load initial graph
    loadGraph();
  }, []);

  const loadGraph = useCallback(async () => {
    const api = window.vibecode as any;
    if (!api?.sm?.getGraph) return;

    setIsLoading(true);
    try {
      const result = await api.sm.getGraph();
      if (result.success && result.data) {
        const nodeMap = new Map<string, ExecutionNode>();
        for (const node of result.data.nodes) {
          nodeMap.set(node.id, node);
        }
        setNodes(nodeMap);
        setRootIds(result.data.rootIds);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getNode = useCallback((id: string): ExecutionNode | null => {
    return nodes.get(id) ?? null;
  }, [nodes]);

  const getNodesByType = useCallback((type: ExecutionNodeType): ExecutionNode[] => {
    return Array.from(nodes.values()).filter(n => n.type === type);
  }, [nodes]);

  const getPlans = useCallback((): ExecutionNode[] => {
    return Array.from(nodes.values()).filter(n => n.type === 'plan');
  }, [nodes]);

  const getChildren = useCallback((parentId: string): ExecutionNode[] => {
    const parent = nodes.get(parentId);
    if (!parent) return [];
    return parent.childIds
      .map(id => nodes.get(id))
      .filter((n): n is ExecutionNode => n !== null);
  }, [nodes]);

  const getTimeline = useCallback((): ExecutionNode[] => {
    return Array.from(nodes.values()).sort((a, b) => a.createdAt - b.createdAt);
  }, [nodes]);

  const getPlanProgress = useCallback((planId: string): PlanProgress => {
    const children = getChildren(planId);
    return {
      total: children.length,
      completed: children.filter(c => c.state === 'completed').length,
      failed: children.filter(c => c.state === 'failed').length,
      running: children.filter(c => c.state === 'executing').length,
      pending: children.filter(c => c.state === 'planned' || c.state === 'approved').length,
    };
  }, [getChildren]);

  // ── Actions ──────────────────────────────────────────────────────────

  const createPlan = useCallback(async (params: {
    title: string;
    description: string;
    steps: Array<{
      title: string;
      description: string;
      type: UnifiedStepType;
      params: Record<string, unknown>;
      riskLevel?: RiskLevel;
      requiresApproval?: boolean;
      dependsOn?: number[];
    }>;
    proposalId?: string;
    chatMessageId?: string;
    providerId?: string;
    model?: string;
  }): Promise<ExecutionNode | null> => {
    const api = window.vibecode as any;
    if (!api?.sm?.createPlan) return null;

    const result = await api.sm.createPlan(params);
    if (result.success && result.data?.node) {
      const node = result.data.node as ExecutionNode;
      setNodes(prev => new Map(prev).set(node.id, node));
      if (!node.parentId) {
        setRootIds(prev => [...prev, node.id]);
      }
      return node;
    }
    return null;
  }, []);

  const approvePlan = useCallback(async (planId: string): Promise<ExecutionNode | null> => {
    const api = window.vibecode as any;
    if (!api?.sm?.approvePlan) return null;

    const result = await api.sm.approvePlan(planId);
    if (result.success && result.data?.node) {
      const node = result.data.node as ExecutionNode;
      setNodes(prev => new Map(prev).set(node.id, node));
      return node;
    }
    return null;
  }, []);

  const executePlan = useCallback(async (planId: string): Promise<ExecutionNode | null> => {
    const api = window.vibecode as any;
    if (!api?.sm?.executePlan) return null;

    const result = await api.sm.executePlan(planId);
    if (result.success && result.data?.node) {
      // Reload the full graph to get all step state updates
      await loadGraph();
      return result.data.node as ExecutionNode;
    }
    return null;
  }, [loadGraph]);

  const cancelPlan = useCallback(async (planId: string): Promise<void> => {
    const api = window.vibecode as any;
    if (!api?.sm?.cancelPlan) return;

    await api.sm.cancelPlan(planId);
    await loadGraph();
  }, [loadGraph]);

  const retryStep = useCallback(async (stepId: string): Promise<ExecutionNode | null> => {
    const api = window.vibecode as any;
    if (!api?.sm?.retryStep) return null;

    const result = await api.sm.retryStep(stepId);
    if (result.success) {
      await loadGraph();
      return result.data?.node ?? null;
    }
    return null;
  }, [loadGraph]);

  const rollbackStep = useCallback(async (stepId: string): Promise<ExecutionNode | null> => {
    const api = window.vibecode as any;
    if (!api?.sm?.rollbackStep) return null;

    const result = await api.sm.rollbackStep(stepId);
    if (result.success) {
      await loadGraph();
      return result.data?.node ?? null;
    }
    return null;
  }, [loadGraph]);

  const rollbackPlan = useCallback(async (planId: string): Promise<ExecutionNode | null> => {
    const api = window.vibecode as any;
    if (!api?.sm?.rollbackPlan) return null;

    const result = await api.sm.rollbackPlan(planId);
    if (result.success) {
      await loadGraph();
      return result.data?.node ?? null;
    }
    return null;
  }, [loadGraph]);

  const runSafetyCheck = useCallback(async (targetNodeIds: string[], approvalRequired?: boolean) => {
    const api = window.vibecode as any;
    if (!api?.sm?.runSafetyCheck) return null;

    const result = await api.sm.runSafetyCheck({ targetNodeIds, approvalRequired });
    if (result.success && result.data?.node) {
      const node = result.data.node as ExecutionNode;
      setNodes(prev => new Map(prev).set(node.id, node));
      return node;
    }
    return null;
  }, []);

  const deleteNode = useCallback(async (nodeId: string): Promise<void> => {
    const api = window.vibecode as any;
    if (!api?.sm?.deleteNode) return;

    await api.sm.deleteNode(nodeId);
    await loadGraph();
  }, [loadGraph]);

  // ── Event Subscription ───────────────────────────────────────────────

  const onEvent = useCallback((listener: (event: StateMachineEvent) => void): (() => void) => {
    eventListenersRef.current.push(listener);
    return () => {
      const idx = eventListenersRef.current.indexOf(listener);
      if (idx >= 0) eventListenersRef.current.splice(idx, 1);
    };
  }, []);

  return {
    // State
    nodes,
    rootIds,
    lastEvent,
    isLoading,

    // Queries
    getNode,
    getNodesByType,
    getPlans,
    getChildren,
    getTimeline,
    getPlanProgress,

    // Actions
    createPlan,
    approvePlan,
    executePlan,
    cancelPlan,
    retryStep,
    rollbackStep,
    rollbackPlan,
    runSafetyCheck,
    deleteNode,

    // Events
    onEvent,

    // Reload
    loadGraph,
  };
}
