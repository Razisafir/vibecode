// ============================================================
// VibeCode Desktop — ARC 22: Base Agent Class
// Foundation for all specialized agents with independent
// memory, reasoning, capability restrictions, domain scoring
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  AgentIdentity,
  AgentRole,
  AgentStatus,
  AgentCapabilities,
  AgentMemoryScope,
  AgentMemoryEntry,
  AgentWorkingMemory,
  AgentTask,
  AgentAction,
  AgentObservation,
  AgentHypothesis,
  AutonomyLevel,
} from '../types';
import { AgentCommunicationBus } from '../agent-communication-bus';
import { SharedContextGraph } from '../shared-context-graph';
import { ProviderManager, ChatMessage } from '../../services/provider-manager';
import { MemoryStore } from '../../services/memory-store';
import { EventEmitter } from 'events';

// ─── Agent Lifecycle Event ──────────────────────────────────────────────────

export type AgentEventType = 'status:changed' | 'task:assigned' | 'task:started' | 'task:completed' | 'task:failed' | 'action:proposed' | 'observation:added' | 'reasoning:cycle';

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  timestamp: number;
  data?: unknown;
}

// ─── Base Agent ─────────────────────────────────────────────────────────────

export abstract class BaseAgent extends EventEmitter {
  protected identity: AgentIdentity;
  protected capabilities: AgentCapabilities;
  protected memory: AgentMemoryScope;
  protected status: AgentStatus = 'idle';
  protected currentTask: AgentTask | null = null;
  protected communicationBus: AgentCommunicationBus;
  protected contextGraph: SharedContextGraph;
  protected providerManager: ProviderManager;
  protected memoryStore: MemoryStore;
  protected autonomyLevel: AutonomyLevel = 'assisted';
  protected lastReasoningCycle: number = 0;
  protected reasoningCycleCount: number = 0;
  protected handlers: ((event: AgentEvent) => void)[] = [];

  constructor(
    identity: AgentIdentity,
    capabilities: AgentCapabilities,
    communicationBus: AgentCommunicationBus,
    contextGraph: SharedContextGraph,
    providerManager: ProviderManager,
    memoryStore: MemoryStore,
  ) {
    super();
    this.identity = identity;
    this.capabilities = capabilities;
    this.communicationBus = communicationBus;
    this.contextGraph = contextGraph;
    this.providerManager = providerManager;
    this.memoryStore = memoryStore;

    this.memory = {
      agentId: identity.id,
      shortTerm: [],
      longTerm: [],
      working: {
        currentTask: null,
        pendingObservations: [],
        activeHypotheses: [],
        constraints: [],
      },
    };
  }

  // ─── Abstract Methods (must be implemented by each agent) ─────────────

  /** Get the system prompt for this agent's LLM reasoning */
  abstract getSystemPrompt(): string;

  /** Process a task assigned to this agent */
  abstract processTask(task: AgentTask): Promise<AgentTask>;

  /** Handle an observation from the workspace or other agents */
  abstract handleObservation(observation: AgentObservation): void;

  /** Perform idle-time reasoning (background thinking) */
  abstract idleReasoning(): Promise<void>;

  /** Score this agent's relevance to a given task */
  abstract scoreTaskRelevance(task: AgentTask): number;

  // ─── Status Management ────────────────────────────────────────────────

  getStatus(): AgentStatus {
    return this.status;
  }

  protected setStatus(newStatus: AgentStatus): void {
    const oldStatus = this.status;
    this.status = newStatus;
    this.emitAgentEvent('status:changed', { oldStatus, newStatus });

    // Broadcast status update
    this.communicationBus.send({
      from: this.identity.role,
      to: 'orchestrator',
      type: 'status_update',
      priority: 'normal',
      content: `${this.identity.name} status: ${oldStatus} → ${newStatus}`,
    });
  }

  // ─── Task Management ──────────────────────────────────────────────────

  async assignTask(task: AgentTask): Promise<AgentTask> {
    if (this.status !== 'idle') {
      throw new Error(`${this.identity.name} is not idle (current status: ${this.status})`);
    }

    this.currentTask = task;
    this.memory.working.currentTask = task;
    this.setStatus('thinking');
    this.emitAgentEvent('task:assigned', { task });

    try {
      this.setStatus('planning');
      const result = await this.processTask(task);
      this.currentTask = result;
      this.memory.working.currentTask = result;

      if (result.status === 'completed') {
        this.setStatus('idle');
        this.emitAgentEvent('task:completed', { task: result });
      } else if (result.status === 'failed') {
        this.setStatus('idle');
        this.emitAgentEvent('task:failed', { task: result });
      }

      return result;
    } catch (err) {
      this.setStatus('error');
      this.emitAgentEvent('task:failed', { task, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  getCurrentTask(): AgentTask | null {
    return this.currentTask;
  }

  // ─── LLM Reasoning ────────────────────────────────────────────────────

  /**
   * Perform LLM reasoning with this agent's specialized system prompt.
   * This is the core thinking mechanism for each agent.
   */
  protected async reason(userMessage: string, contextEntries?: string[]): Promise<string> {
    const provider = this.providerManager.getActiveProvider();
    if (!provider) {
      throw new Error('No active AI provider configured');
    }

    const model = provider.models[0]?.id ?? 'gpt-4o';

    // Build context from shared context graph
    const relevantContext = contextEntries ??
      this.contextGraph.getRelevantContext(userMessage, 10)
        .map(e => `[${e.source}] ${e.content}`)
        .slice(0, 5);

    // Build memory context
    const memoryContext = this.memory.shortTerm
      .slice(-5)
      .map(m => m.content)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
    ];

    if (relevantContext.length > 0) {
      messages.push({
        role: 'system',
        content: `Shared context:\n${relevantContext.join('\n')}`,
      });
    }

    if (memoryContext) {
      messages.push({
        role: 'system',
        content: `Recent memory:\n${memoryContext}`,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    this.reasoningCycleCount++;
    this.lastReasoningCycle = Date.now();

    // Use the provider manager for chat completion
    let result = '';
    const chatOptions = provider.chatOptions ?? { temperature: 0.7, maxTokens: 4096, streaming: true };

    try {
      const generator = this.providerManager.chatCompletion(
        provider.id,
        model,
        messages,
        { temperature: chatOptions.temperature, maxTokens: chatOptions.maxTokens, stream: false },
      );

      for await (const chunk of generator) {
        result += chunk;
      }
    } catch (err) {
      console.error(`[${this.identity.name}] LLM reasoning failed:`, err);
      throw err;
    }

    // Store reasoning in agent memory
    this.addMemoryEntry({
      content: `Reasoning: ${userMessage.slice(0, 100)} → ${result.slice(0, 200)}`,
      type: 'decision',
      importance: 0.6,
      source: 'self',
      relatedEntries: [],
    });

    this.emitAgentEvent('reasoning:cycle', { tokensEstimate: result.length });

    return result;
  }

  // ─── Memory Management ────────────────────────────────────────────────

  protected addMemoryEntry(entry: Omit<AgentMemoryEntry, 'id' | 'timestamp'>): AgentMemoryEntry {
    const fullEntry: AgentMemoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    this.memory.shortTerm.push(fullEntry);

    // Keep short-term memory bounded
    if (this.memory.shortTerm.length > 50) {
      const removed = this.memory.shortTerm.shift();
      if (removed && removed.importance > 0.5) {
        this.memory.longTerm.push(removed);
      }
    }

    // Keep long-term memory bounded
    if (this.memory.longTerm.length > 200) {
      this.memory.longTerm.sort((a, b) => b.importance - a.importance);
      this.memory.longTerm = this.memory.longTerm.slice(0, 200);
    }

    return fullEntry;
  }

  getMemory(): AgentMemoryScope {
    return this.memory;
  }

  // ─── Action Proposals ─────────────────────────────────────────────────

  protected proposeAction(action: Omit<AgentAction, 'id' | 'agentId' | 'timestamp'>): AgentAction {
    const fullAction: AgentAction = {
      ...action,
      id: uuidv4(),
      agentId: this.identity.id,
      timestamp: Date.now(),
    };

    // Check if approval is needed
    if (action.riskLevel === 'high' || (this.autonomyLevel === 'supervised' && action.riskLevel !== 'low')) {
      fullAction.requiresApproval = true;
      this.communicationBus.requestApproval(
        this.identity.role,
        action.description,
        action.riskLevel,
      );
    }

    this.emitAgentEvent('action:proposed', { action: fullAction });
    return fullAction;
  }

  // ─── Observation Handling ─────────────────────────────────────────────

  addObservation(observation: AgentObservation): void {
    this.memory.working.pendingObservations.push(observation);
    this.handleObservation(observation);
    this.emitAgentEvent('observation:added', { observation });

    // Share with context graph
    this.contextGraph.addObservation(observation);
  }

  // ─── Hypothesis Management ────────────────────────────────────────────

  protected addHypothesis(hypothesis: AgentHypothesis): void {
    this.memory.working.activeHypotheses.push(hypothesis);
  }

  protected updateHypothesis(hypothesisId: string, confidence: number): void {
    const hypothesis = this.memory.working.activeHypotheses.find(h => h.id === hypothesisId);
    if (hypothesis) {
      hypothesis.confidence = confidence;
    }
  }

  // ─── Autonomy Control ─────────────────────────────────────────────────

  setAutonomyLevel(level: AutonomyLevel): void {
    this.autonomyLevel = level;
  }

  // ─── Identity ─────────────────────────────────────────────────────────

  getIdentity(): AgentIdentity {
    return this.identity;
  }

  getCapabilities(): AgentCapabilities {
    return this.capabilities;
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onAgentEvent(handler: (event: AgentEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  protected emitAgentEvent(type: AgentEventType, data?: unknown): void {
    const event: AgentEvent = { type, agentId: this.identity.id, timestamp: Date.now(), data };
    for (const handler of this.handlers) {
      try { handler(event); } catch (err) { console.error(`[${this.identity.name}] Event handler error:`, err); }
    }
    this.emit(type, event);
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  getStats(): {
    identity: AgentIdentity;
    status: AgentStatus;
    reasoningCycles: number;
    lastReasoningCycle: number;
    shortTermMemorySize: number;
    longTermMemorySize: number;
    currentTaskId: string | null;
    pendingObservations: number;
    activeHypotheses: number;
  } {
    return {
      identity: this.identity,
      status: this.status,
      reasoningCycles: this.reasoningCycleCount,
      lastReasoningCycle: this.lastReasoningCycle,
      shortTermMemorySize: this.memory.shortTerm.length,
      longTermMemorySize: this.memory.longTerm.length,
      currentTaskId: this.currentTask?.id ?? null,
      pendingObservations: this.memory.working.pendingObservations.length,
      activeHypotheses: this.memory.working.activeHypotheses.length,
    };
  }

  dispose(): void {
    this.setStatus('suspended');
    this.handlers = [];
    this.memory.shortTerm = [];
    this.memory.longTerm = [];
    this.removeAllListeners();
  }
}
