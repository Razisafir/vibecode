// ============================================================
// VibeCode Desktop — useProposals React Hook
// Connects the renderer to the proposal system via IPC
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ProposalCardData,
  ProposalUpdateEvent,
} from '../types';

interface UseProposalsReturn {
  proposals: ProposalCardData[];
  isLoading: boolean;
  approve: (planId: string) => Promise<void>;
  reject: (planId: string, reason?: string) => Promise<void>;
  modify: (planId: string, modifications: any) => Promise<void>;
  refresh: () => Promise<void>;
  generateFromResponse: (response: string, context?: { workspaceRoot?: string; projectId?: string }) => Promise<ProposalCardData[]>;
}

export function useProposals(): UseProposalsReturn {
  const [proposals, setProposals] = useState<ProposalCardData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load pending proposals on mount
  useEffect(() => {
    refresh();
  }, []);

  // Listen for proposal updates from main process
  useEffect(() => {
    if (!window.vibecode?.proposal) return;

    window.vibecode.proposal.onUpdate((_update: ProposalUpdateEvent) => {
      // When any proposal is updated, refresh the list
      refresh();
    });
  }, []);

  /**
   * Refresh the proposals list from the main process.
   */
  const refresh = useCallback(async () => {
    if (!window.vibecode?.proposal) return;

    try {
      const result = await window.vibecode.proposal.list();
      if (result.success && result.data?.proposals && isMountedRef.current) {
        setProposals(result.data.proposals);
      }
    } catch {
      // Best effort
    }
  }, []);

  /**
   * Approve a proposal and start execution.
   */
  const approve = useCallback(async (planId: string) => {
    if (!window.vibecode?.proposal) return;

    setIsLoading(true);
    try {
      const result = await window.vibecode.proposal.approveAndExecute(planId);
      if (result.success) {
        // Update local state immediately
        setProposals((prev) =>
          prev.map((p) =>
            p.planId === planId ? { ...p, status: 'executing' as const } : p
          )
        );
      }
    } catch {
      // Error handling — refresh will correct state
    } finally {
      if (isMountedRef.current) setIsLoading(false);
      await refresh();
    }
  }, []);

  /**
   * Reject a proposal.
   */
  const reject = useCallback(async (planId: string, reason?: string) => {
    if (!window.vibecode?.proposal) return;

    try {
      const result = await window.vibecode.proposal.reject(planId, reason);
      if (result.success) {
        // Remove from local list immediately
        setProposals((prev) =>
          prev.map((p) =>
            p.planId === planId ? { ...p, status: 'rejected' as const } : p
          )
        );
      }
    } catch {
      // Error handling
    } finally {
      await refresh();
    }
  }, []);

  /**
   * Modify a proposal's steps or metadata.
   */
  const modify = useCallback(async (planId: string, modifications: any) => {
    if (!window.vibecode?.proposal) return;

    try {
      const result = await window.vibecode.proposal.modify(planId, modifications);
      if (result.success) {
        await refresh();
      }
    } catch {
      // Error handling
    }
  }, []);

  /**
   * Send an LLM response to the proposal generator and get back proposals.
   * Returns the newly generated proposals.
   */
  const generateFromResponse = useCallback(
    async (
      response: string,
      context?: { workspaceRoot?: string; projectId?: string }
    ): Promise<ProposalCardData[]> => {
      if (!window.vibecode?.proposal) return [];

      try {
        const result = await window.vibecode.proposal.generateFromResponse(response, context);
        if (result.success && result.data?.proposals) {
          const newProposals = result.data.proposals;

          // Add to local state
          setProposals((prev) => {
            // Avoid duplicates
            const existingIds = new Set(prev.map((p) => p.id));
            const unique = newProposals.filter((p) => !existingIds.has(p.id));
            return [...prev, ...unique];
          });

          return newProposals;
        }
      } catch {
        // Best effort
      }

      return [];
    },
    []
  );

  return {
    proposals,
    isLoading,
    approve,
    reject,
    modify,
    refresh,
    generateFromResponse,
  };
}
