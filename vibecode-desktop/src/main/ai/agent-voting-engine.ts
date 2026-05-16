// ============================================================
// VibeCode Desktop — ARC 22: Agent Negotiation + Voting System
// Collaborative decision-making, weighted voting,
// contradiction detection, consensus-based execution
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  Proposal,
  ProposalStatus,
  AgentVote,
  AgentRole,
  AgentAction,
  NegotiationRound,
  AgentArgument,
  Contradiction,
  AutonomyLevel,
} from './types';
import { AgentCommunicationBus } from './agent-communication-bus';

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_VOTING_TIMEOUT_MS = 30_000;
const DEFAULT_CONSENSUS_THRESHOLD = 0.6; // 60% weighted approval
const MAX_NEGOTIATION_ROUNDS = 3;
const VOTE_WEIGHT_BASE: Record<AgentRole, number> = {
  architect: 1.2,
  debug: 1.1,
  research: 0.9,
  security: 1.3,
  performance: 1.0,
  product: 1.0,
};

// ─── Event Types ────────────────────────────────────────────────────────────

export type VotingEventType = 'proposal:created' | 'vote:cast' | 'round:started' | 'consensus:reached' | 'proposal:rejected' | 'proposal:expired' | 'contradiction:detected';

export interface VotingEvent {
  type: VotingEventType;
  proposalId: string;
  timestamp: number;
  data?: unknown;
}

// ─── Agent Voting Engine ────────────────────────────────────────────────────

export class AgentVotingEngine {
  private proposals: Map<string, Proposal> = new Map();
  private negotiationRounds: Map<string, NegotiationRound[]> = new Map();
  private communicationBus: AgentCommunicationBus;
  private handlers: ((event: VotingEvent) => void)[] = [];
  private timeoutTimers: Map<string, NodeJS.Timeout> = new Map();
  private autonomyLevel: AutonomyLevel;

  constructor(communicationBus: AgentCommunicationBus, autonomyLevel: AutonomyLevel = 'assisted') {
    this.communicationBus = communicationBus;
    this.autonomyLevel = autonomyLevel;
  }

  // ─── Proposal Lifecycle ───────────────────────────────────────────────

  /**
   * Create a new proposal for agent voting.
   */
  createProposal(
    title: string,
    description: string,
    proposedBy: AgentRole | 'user',
    actions: AgentAction[],
    riskLevel: 'low' | 'medium' | 'high' = 'medium',
    consensusThreshold: number = DEFAULT_CONSENSUS_THRESHOLD,
  ): Proposal {
    const proposal: Proposal = {
      id: uuidv4(),
      title,
      description,
      proposedBy,
      actions,
      riskLevel,
      estimatedImpact: this.estimateImpact(actions),
      votes: [],
      status: 'debating',
      createdAt: Date.now(),
      deadlineAt: Date.now() + DEFAULT_VOTING_TIMEOUT_MS,
      consensusThreshold,
    };

    this.proposals.set(proposal.id, proposal);
    this.negotiationRounds.set(proposal.id, []);

    // Broadcast proposal for voting
    this.communicationBus.send({
      from: proposedBy === 'user' ? 'orchestrator' : proposedBy,
      to: 'broadcast',
      type: 'consensus_request',
      priority: riskLevel === 'high' ? 'critical' : 'high',
      content: `Proposal: ${title} — ${description}`,
      structuredData: {
        actionProposal: actions[0], // primary action
      },
    });

    // Set voting deadline
    const timer = setTimeout(() => {
      this.finalizeProposal(proposal.id);
    }, DEFAULT_VOTING_TIMEOUT_MS);
    if (timer.unref) timer.unref();
    this.timeoutTimers.set(proposal.id, timer);

    this.emitEvent('proposal:created', proposal.id);

    return proposal;
  }

  /**
   * Cast a vote on a proposal.
   */
  castVote(proposalId: string, agentId: AgentRole, vote: 'approve' | 'reject' | 'abstain', reasoning: string, confidence: number, conditions?: string[]): Proposal | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    if (proposal.status !== 'debating') {
      throw new Error(`Cannot vote on proposal in "${proposal.status}" status`);
    }

    // Check if agent already voted
    const existingVote = proposal.votes.find(v => v.agentId === agentId);
    if (existingVote) {
      // Update existing vote
      existingVote.vote = vote;
      existingVote.reasoning = reasoning;
      existingVote.confidence = confidence;
      existingVote.conditions = conditions;
      existingVote.timestamp = Date.now();
    } else {
      // Add new vote
      const agentVote: AgentVote = {
        agentId,
        vote,
        confidence,
        reasoning,
        weight: this.calculateVoteWeight(agentId, proposal),
        timestamp: Date.now(),
        conditions,
      };
      proposal.votes.push(agentVote);
    }

    this.emitEvent('vote:cast', proposalId, { agentId, vote });

    // Check if consensus is reached
    if (this.checkConsensus(proposalId)) {
      this.finalizeProposal(proposalId);
    }

    return proposal;
  }

  /**
   * Add an argument for/against a proposal (debate phase).
   */
  addArgument(proposalId: string, agentId: AgentRole, position: 'for' | 'against' | 'neutral', points: string[], counterPoints: string[], evidence: string[]): void {
    const rounds = this.negotiationRounds.get(proposalId) ?? [];
    let currentRound = rounds[rounds.length - 1];

    if (!currentRound) {
      currentRound = { proposalId, round: 1, arguments: [], contradictions: [], timestamp: Date.now() };
      rounds.push(currentRound);
      this.emitEvent('round:started', proposalId, { round: 1 });
    }

    const argument: AgentArgument = {
      agentId,
      position,
      points,
      counterPoints,
      evidence,
    };
    currentRound.arguments.push(argument);

    // Detect contradictions
    this.detectContradictions(proposalId, currentRound);
  }

  // ─── Query Methods ────────────────────────────────────────────────────

  getProposal(proposalId: string): Proposal | null {
    return this.proposals.get(proposalId) ?? null;
  }

  getActiveProposals(): Proposal[] {
    return Array.from(this.proposals.values()).filter(p => p.status === 'debating');
  }

  getProposalVotes(proposalId: string): AgentVote[] {
    return this.proposals.get(proposalId)?.votes ?? [];
  }

  getNegotiationRounds(proposalId: string): NegotiationRound[] {
    return this.negotiationRounds.get(proposalId) ?? [];
  }

  getContradictions(proposalId: string): Contradiction[] {
    const rounds = this.negotiationRounds.get(proposalId) ?? [];
    return rounds.flatMap(r => r.contradictions);
  }

  // ─── Autonomy Control ─────────────────────────────────────────────────

  setAutonomyLevel(level: AutonomyLevel): void {
    this.autonomyLevel = level;
  }

  /**
   * Determine if a proposal can be auto-executed based on autonomy level.
   */
  canAutoExecute(proposal: Proposal): boolean {
    const { riskLevel } = proposal;

    switch (this.autonomyLevel) {
      case 'supervised':
        return false; // All proposals need user approval
      case 'assisted':
        return riskLevel === 'low' && this.hasConsensus(proposal.id);
      case 'autonomous':
        return (riskLevel === 'low' || riskLevel === 'medium') && this.hasConsensus(proposal.id);
      default:
        return false;
    }
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onVotingEvent(handler: (event: VotingEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  getStats(): {
    totalProposals: number;
    activeProposals: number;
    approvedProposals: number;
    rejectedProposals: number;
    avgConsensusTime: number;
    avgVotesPerProposal: number;
  } {
    const all = Array.from(this.proposals.values());
    const completed = all.filter(p => p.status === 'approved' || p.status === 'completed');
    const approved = all.filter(p => p.status === 'approved' || p.status === 'completed');
    const rejected = all.filter(p => p.status === 'rejected');

    return {
      totalProposals: all.length,
      activeProposals: all.filter(p => p.status === 'debating').length,
      approvedProposals: approved.length,
      rejectedProposals: rejected.length,
      avgConsensusTime: completed.length > 0
        ? completed.reduce((sum, p) => sum + (p.votes[votes.length - 1]?.timestamp ?? p.createdAt) - p.createdAt, 0) / completed.length
        : 0,
      avgVotesPerProposal: all.length > 0
        ? all.reduce((sum, p) => sum + p.votes.length, 0) / all.length
        : 0,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private calculateVoteWeight(agentId: AgentRole, proposal: Proposal): number {
    let weight = VOTE_WEIGHT_BASE[agentId] ?? 1.0;

    // Boost weight for agents whose domain matches the proposal's risk area
    if (proposal.riskLevel === 'high' && agentId === 'security') weight *= 1.5;
    if (proposal.actions.some(a => a.type === 'file_edit' || a.type === 'file_write') && agentId === 'architect') weight *= 1.3;
    if (proposal.actions.some(a => a.type === 'command') && agentId === 'debug') weight *= 1.2;

    return weight;
  }

  private checkConsensus(proposalId: string): boolean {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return false;

    const totalWeight = proposal.votes.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return false;

    const approvalWeight = proposal.votes
      .filter(v => v.vote === 'approve')
      .reduce((sum, v) => sum + v.weight, 0);

    const approvalRatio = approvalWeight / totalWeight;

    // Check for veto (any agent with confidence > 0.8 voting reject)
    const hasVeto = proposal.votes.some(v => v.vote === 'reject' && v.confidence > 0.8 && v.weight >= 1.2);

    if (hasVeto) return false;

    return approvalRatio >= proposal.consensusThreshold;
  }

  private hasConsensus(proposalId: string): boolean {
    return this.checkConsensus(proposalId);
  }

  private finalizeProposal(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'debating') return;

    // Clear timeout
    const timer = this.timeoutTimers.get(proposalId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(proposalId);
    }

    if (this.checkConsensus(proposalId)) {
      proposal.status = 'approved';
      this.emitEvent('consensus:reached', proposalId);

      // Broadcast approval
      this.communicationBus.send({
        from: 'orchestrator',
        to: 'broadcast',
        type: 'notification',
        priority: 'high',
        content: `Proposal approved: ${proposal.title}`,
      });
    } else {
      proposal.status = 'rejected';
      this.emitEvent('proposal:rejected', proposalId);

      // Broadcast rejection
      this.communicationBus.send({
        from: 'orchestrator',
        to: 'broadcast',
        type: 'notification',
        priority: 'normal',
        content: `Proposal rejected: ${proposal.title}`,
      });
    }
  }

  private detectContradictions(proposalId: string, round: NegotiationRound): void {
    const forArgs = round.arguments.filter(a => a.position === 'for');
    const againstArgs = round.arguments.filter(a => a.position === 'against');

    for (const forArg of forArgs) {
      for (const againstArg of againstArgs) {
        // Check if they contradict on specific points
        for (const point of forArg.points) {
          for (const counterPoint of againstArg.counterPoints) {
            if (this.areContradictory(point, counterPoint)) {
              const contradiction: Contradiction = {
                agentA: forArg.agentId,
                agentB: againstArg.agentId,
                pointOfContention: point,
                agentAPosition: point,
                agentBPosition: counterPoint,
              };
              round.contradictions.push(contradiction);
              this.emitEvent('contradiction:detected', proposalId, contradiction);
            }
          }
        }
      }
    }
  }

  private areContradictory(pointA: string, pointB: string): boolean {
    // Simple heuristic: if the points are about the same topic but reach opposite conclusions
    const termsA = new Set(pointA.toLowerCase().split(/\s+/));
    const termsB = new Set(pointB.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const term of termsA) {
      if (termsB.has(term) && term.length > 3) overlap++;
    }
    // If significant overlap but different positions, it's a contradiction
    const totalTerms = Math.max(termsA.size, termsB.size);
    return totalTerms > 0 && overlap / totalTerms > 0.3;
  }

  private estimateImpact(actions: AgentAction[]): string {
    const files = new Set(actions.flatMap(a => a.affectedFiles));
    const hasHighRisk = actions.some(a => a.riskLevel === 'high');
    const hasCommands = actions.some(a => a.type === 'command');

    if (hasHighRisk) return `High impact: ${files.size} files affected, includes high-risk operations`;
    if (hasCommands) return `Medium impact: ${files.size} files affected, includes command execution`;
    if (files.size > 5) return `Medium impact: ${files.size} files affected`;
    return `Low impact: ${files.size} files affected`;
  }

  private emitEvent(type: VotingEventType, proposalId: string, data?: unknown): void {
    const event: VotingEvent = { type, proposalId, timestamp: Date.now(), data };
    for (const handler of this.handlers) {
      try { handler(event); } catch (err) { console.error('[AgentVotingEngine] Event handler error:', err); }
    }
  }

  dispose(): void {
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.timeoutTimers.clear();
    this.proposals.clear();
    this.negotiationRounds.clear();
    this.handlers = [];
  }
}
