// ============================================================
// VibeCode Desktop — ARC 22: useAgentTeam Hook
// React hook for accessing multi-agent team state
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentTeamState {
  isRunning: boolean;
  autonomyLevel: 'supervised' | 'assisted' | 'autonomous';
  agents: Array<{
    identity: { id: string; role: string; name: string; avatar: string };
    status: string;
    currentTask: any | null;
    confidence: number;
  }>;
  activeTasks: any[];
  proposals: any[];
  recentMessages: any[];
  goals: any[];
  metrics: {
    totalAgents: number;
    activeAgents: number;
    pendingTasks: number;
    activeProposals: number;
    avgConfidence: number;
    executionSuccessRate: number;
  } | null;
  loading: boolean;
  error: string | null;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAgentTeam(pollIntervalMs: number = 3000): AgentTeamState & {
  startTeam: () => Promise<void>;
  stopTeam: () => Promise<void>;
  setAutonomy: (level: 'supervised' | 'assisted' | 'autonomous') => Promise<void>;
  submitTask: (task: any) => Promise<any>;
  voteOnProposal: (proposalId: string, vote: 'approve' | 'reject', reasoning: string) => Promise<void>;
  createGoal: (title: string, description: string, type: string, priority?: number) => Promise<any>;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<AgentTeamState>({
    isRunning: false,
    autonomyLevel: 'assisted',
    agents: [],
    activeTasks: [],
    proposals: [],
    recentMessages: [],
    goals: [],
    metrics: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const result = await window.vibecode.agent.getDashboard();
      if (result.success && result.data) {
        const data = result.data;
        setState(prev => ({
          ...prev,
          isRunning: data.agents?.length > 0,
          autonomyLevel: data.autonomyLevel ?? 'assisted',
          agents: data.agents ?? [],
          activeTasks: data.activeTasks ?? [],
          proposals: data.activeProposals ?? [],
          recentMessages: data.recentMessages ?? [],
          goals: data.activeGoals ?? [],
          metrics: data.systemMetrics ?? null,
          loading: false,
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: false,
          error: result.error ?? 'Unknown error',
        }));
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  // Subscribe to real-time events
  useEffect(() => {
    try {
      window.vibecode.agent.onOrchestratorEvent(() => refresh());
      window.vibecode.agent.onVotingEvent(() => refresh());
      window.vibecode.agent.onOrganizationEvent(() => refresh());
    } catch {
      // Agent API may not be available yet
    }
  }, [refresh]);

  const startTeam = useCallback(async () => {
    await window.vibecode.agent.start();
    setState(prev => ({ ...prev, isRunning: true }));
    await refresh();
  }, [refresh]);

  const stopTeam = useCallback(async () => {
    await window.vibecode.agent.stop();
    setState(prev => ({ ...prev, isRunning: false }));
    await refresh();
  }, [refresh]);

  const setAutonomy = useCallback(async (level: 'supervised' | 'assisted' | 'autonomous') => {
    await window.vibecode.agent.setAutonomy(level);
    setState(prev => ({ ...prev, autonomyLevel: level }));
    await refresh();
  }, [refresh]);

  const submitTask = useCallback(async (task: any) => {
    const result = await window.vibecode.agent.submitTask(task);
    await refresh();
    return result;
  }, [refresh]);

  const voteOnProposal = useCallback(async (proposalId: string, vote: 'approve' | 'reject', reasoning: string) => {
    await window.vibecode.agent.vote(proposalId, 'user', vote, reasoning, 1.0);
    await refresh();
  }, [refresh]);

  const createGoal = useCallback(async (title: string, description: string, type: string, priority?: number) => {
    const result = await window.vibecode.agent.createGoal(title, description, type, priority);
    await refresh();
    return result;
  }, [refresh]);

  return {
    ...state,
    startTeam,
    stopTeam,
    setAutonomy,
    submitTask,
    voteOnProposal,
    createGoal,
    refresh,
  };
}

export default useAgentTeam;
