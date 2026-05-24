// ============================================================
// VibeCode Desktop — ARC 22: Agent Communication Protocol
// Formal inter-agent messaging with priority queues,
// structured reasoning packets, event bus, and persistence
// ============================================================

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentMessage,
  MessageType,
  MessagePriority,
  MessageStructuredData,
  AgentRole,
  ReasoningPacket,
  DelegationContract,
  VoteData,
  ContextRequest,
} from './types';

// ─── Message Queue ──────────────────────────────────────────────────────────

interface PriorityQueue {
  critical: AgentMessage[];
  high: AgentMessage[];
  normal: AgentMessage[];
  low: AgentMessage[];
}

// ─── Conversation Thread ────────────────────────────────────────────────────

interface ConversationThread {
  id: string;
  participants: Set<string>;
  messages: AgentMessage[];
  startedAt: number;
  lastActivity: number;
}

// ─── Event Types ────────────────────────────────────────────────────────────

export type BusEventType = 'message:sent' | 'message:received' | 'message:expired' | 'thread:created' | 'thread:closed';

export interface BusEvent {
  type: BusEventType;
  messageId?: string;
  threadId?: string;
  timestamp: number;
  data?: unknown;
}

export type BusEventHandler = (event: BusEvent) => void;

// ─── Configuration ──────────────────────────────────────────────────────────

const MESSAGE_RETENTION_MS = 3_600_000; // 1 hour
const MAX_QUEUE_SIZE_PER_PRIORITY = 100;
const MAX_THREADS = 50;
const MAX_MESSAGES_PER_THREAD = 200;

// ─── Agent Communication Bus ────────────────────────────────────────────────

export class AgentCommunicationBus extends EventEmitter {
  private queues: Map<string, PriorityQueue> = new Map();
  private threads: Map<string, ConversationThread> = new Map();
  private messages: Map<string, AgentMessage> = new Map();
  private messageOrder: string[] = [];
  private busEventHandlers: BusEventHandler[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanupTimer();
  }

  // ─── Message Send / Receive ───────────────────────────────────────────

  /**
   * Send a message from one agent to another (or broadcast).
   * Messages are queued by priority and delivered to the recipient's queue.
   */
  send(message: Omit<AgentMessage, 'id' | 'timestamp' | 'read'>): AgentMessage {
    const fullMessage: AgentMessage = {
      ...message,
      id: uuidv4(),
      timestamp: Date.now(),
      read: false,
    };

    // Store the message
    this.messages.set(fullMessage.id, fullMessage);
    this.messageOrder.push(fullMessage.id);

    // Deliver to recipient's queue
    if (fullMessage.to === 'broadcast') {
      this.deliverToAll(fullMessage);
    } else {
      this.deliverToAgent(fullMessage.to, fullMessage);
    }

    // Track in conversation thread
    this.trackInThread(fullMessage);

    // Emit bus event
    this.emitBusEvent('message:sent', fullMessage.id, undefined, { from: fullMessage.from, to: fullMessage.to });

    return fullMessage;
  }

  /**
   * Receive the next pending message for an agent, respecting priority order.
   */
  receive(agentId: string): AgentMessage | null {
    const queue = this.queues.get(agentId);
    if (!queue) return null;

    // Check queues in priority order
    for (const priority of ['critical', 'high', 'normal', 'low'] as MessagePriority[]) {
      const messages = queue[priority];
      if (messages.length > 0) {
        const message = messages.shift()!;
        message.read = true;
        this.emitBusEvent('message:received', message.id, undefined, { by: agentId });
        return message;
      }
    }

    return null;
  }

  /**
   * Peek at pending messages for an agent without removing them.
   */
  peek(agentId: string, limit: number = 10): AgentMessage[] {
    const queue = this.queues.get(agentId);
    if (!queue) return [];

    const all: AgentMessage[] = [];
    for (const priority of ['critical', 'high', 'normal', 'low'] as MessagePriority[]) {
      all.push(...queue[priority]);
      if (all.length >= limit) break;
    }
    return all.slice(0, limit);
  }

  /**
   * Get all unread messages for an agent.
   */
  getUnread(agentId: string): AgentMessage[] {
    const queue = this.queues.get(agentId);
    if (!queue) return [];

    const unread: AgentMessage[] = [];
    for (const priority of ['critical', 'high', 'normal', 'low'] as MessagePriority[]) {
      unread.push(...queue[priority].filter(m => !m.read));
    }
    return unread;
  }

  /**
   * Get the count of pending messages for an agent.
   */
  getPendingCount(agentId: string): number {
    const queue = this.queues.get(agentId);
    if (!queue) return 0;
    return queue.critical.length + queue.high.length + queue.normal.length + queue.low.length;
  }

  // ─── Structured Message Helpers ───────────────────────────────────────

  /**
   * Send an observation message (agent noticed something in workspace).
   */
  sendObservation(from: AgentRole, content: string, severity: 'info' | 'warning' | 'critical' = 'info'): AgentMessage {
    return this.send({
      from,
      to: 'broadcast',
      type: 'observation',
      priority: severity === 'critical' ? 'critical' : severity === 'warning' ? 'high' : 'normal',
      content,
      structuredData: {
        reasoningPacket: {
          premises: [content],
          conclusion: `Observation from ${from}: ${content}`,
          confidence: 0.8,
          evidence: [],
          assumptions: [],
          gaps: [],
        },
      },
    });
  }

  /**
   * Send a reasoning broadcast (agent shares its reasoning for transparency).
   */
  sendReflection(from: AgentRole, reasoning: ReasoningPacket): AgentMessage {
    return this.send({
      from,
      to: 'broadcast',
      type: 'reflection',
      priority: 'low',
      content: reasoning.conclusion,
      structuredData: { reasoningPacket: reasoning },
    });
  }

  /**
   * Send a delegation contract (task handoff between agents).
   */
  delegateTask(contract: DelegationContract): AgentMessage {
    return this.send({
      from: contract.fromAgent,
      to: contract.toAgent,
      type: 'delegation',
      priority: 'high',
      content: `Task delegation: ${contract.taskId}`,
      structuredData: { delegationContract: contract },
    });
  }

  /**
   * Send a vote on a proposal.
   */
  castVote(from: AgentRole, voteData: VoteData): AgentMessage {
    return this.send({
      from,
      to: 'orchestrator',
      type: 'vote',
      priority: 'high',
      content: `Vote on ${voteData.proposalId}: ${voteData.vote}`,
      structuredData: { voteData },
    });
  }

  /**
   * Request context from other agents.
   */
  requestContext(from: AgentRole, request: ContextRequest): AgentMessage {
    return this.send({
      from,
      to: 'broadcast',
      type: 'request',
      priority: request.urgency === 'high' ? 'high' : 'normal',
      content: `Context request: ${request.requestedContext.join(', ')}`,
      structuredData: { contextRequest: request },
    });
  }

  /**
   * Send a response to a specific message.
   */
  respond(originalMessageId: string, from: AgentRole | 'orchestrator', content: string, structuredData?: MessageStructuredData): AgentMessage {
    const original = this.messages.get(originalMessageId);
    if (!original) {
      throw new Error(`Cannot respond to unknown message: ${originalMessageId}`);
    }

    return this.send({
      from,
      to: original.from as AgentRole,
      type: 'response',
      priority: original.priority,
      content,
      structuredData,
      correlationId: original.id,
      inReplyTo: original.id,
    });
  }

  /**
   * Request user approval for a high-risk action.
   */
  requestApproval(from: AgentRole, actionDescription: string, riskLevel: 'low' | 'medium' | 'high'): AgentMessage {
    return this.send({
      from,
      to: 'orchestrator',
      type: 'approval_request',
      priority: riskLevel === 'high' ? 'critical' : 'high',
      content: actionDescription,
    });
  }

  // ─── Conversation Threads ─────────────────────────────────────────────

  /**
   * Get or create a conversation thread for a set of participants.
   */
  getOrCreateThread(participants: string[]): ConversationThread {
    const sortedKey = [...participants].sort().join(':');
    let thread = this.threads.get(sortedKey);

    if (!thread) {
      thread = {
        id: uuidv4(),
        participants: new Set(participants),
        messages: [],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      };
      this.threads.set(sortedKey, thread);
      this.emitBusEvent('thread:created', undefined, thread.id);
    }

    return thread;
  }

  /**
   * Get all messages in a thread.
   */
  getThreadMessages(threadId: string): AgentMessage[] {
    for (const thread of this.threads.values()) {
      if (thread.id === threadId) {
        return [...thread.messages];
      }
    }
    return [];
  }

  /**
   * Get recent messages across all threads.
   */
  getRecentMessages(limit: number = 50): AgentMessage[] {
    const recent = this.messageOrder.slice(-limit);
    return recent.map(id => this.messages.get(id)!).filter(Boolean);
  }

  /**
   * Get messages by type.
   */
  getMessagesByType(type: MessageType, limit: number = 50): AgentMessage[] {
    const filtered: AgentMessage[] = [];
    for (const msg of this.messages.values()) {
      if (msg.type === type) {
        filtered.push(msg);
      }
      if (filtered.length >= limit) break;
    }
    return filtered;
  }

  // ─── Message Replay ───────────────────────────────────────────────────

  /**
   * Replay messages for an agent since a given timestamp.
   * Useful for agents that were offline or suspended.
   */
  replayMessagesSince(agentId: string, sinceTimestamp: number): AgentMessage[] {
    const relevant: AgentMessage[] = [];
    for (const msgId of this.messageOrder) {
      const msg = this.messages.get(msgId);
      if (!msg || msg.timestamp < sinceTimestamp) continue;
      if (msg.to === agentId || msg.to === 'broadcast' || msg.from === agentId) {
        relevant.push(msg);
      }
    }
    return relevant;
  }

  // ─── Persistence ──────────────────────────────────────────────────────

  /**
   * Serialize the bus state for persistence.
   */
  serialize(): { messages: AgentMessage[]; threadKeys: string[] } {
    return {
      messages: Array.from(this.messages.values()),
      threadKeys: Array.from(this.threads.keys()),
    };
  }

  /**
   * Get statistics about the communication bus.
   */
  getStats(): {
    totalMessages: number;
    messagesByType: Record<string, number>;
    messagesByPriority: Record<string, number>;
    activeThreads: number;
    pendingByAgent: Record<string, number>;
  } {
    const messagesByType: Record<string, number> = {};
    const messagesByPriority: Record<string, number> = {};
    const pendingByAgent: Record<string, number> = {};

    for (const msg of this.messages.values()) {
      messagesByType[msg.type] = (messagesByType[msg.type] ?? 0) + 1;
      messagesByPriority[msg.priority] = (messagesByPriority[msg.priority] ?? 0) + 1;
    }

    for (const [agentId, queue] of this.queues) {
      pendingByAgent[agentId] = queue.critical.length + queue.high.length + queue.normal.length + queue.low.length;
    }

    return {
      totalMessages: this.messages.size,
      messagesByType,
      messagesByPriority,
      activeThreads: this.threads.size,
      pendingByAgent,
    };
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onBusEvent(handler: BusEventHandler): () => void {
    this.busEventHandlers.push(handler);
    return () => {
      const idx = this.busEventHandlers.indexOf(handler);
      if (idx >= 0) this.busEventHandlers.splice(idx, 1);
    };
  }

  private emitBusEvent(type: BusEventType, messageId?: string, threadId?: string, data?: unknown): void {
    const event: BusEvent = { type, messageId, threadId, timestamp: Date.now(), data };
    for (const handler of this.busEventHandlers) {
      try { handler(event); } catch (err) { console.error('[AgentCommBus] Event handler error:', err); }
    }
    this.emit(type, event);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private deliverToAgent(agentId: string, message: AgentMessage): void {
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, { critical: [], high: [], normal: [], low: [] });
    }
    const queue = this.queues.get(agentId)!;
    const priorityQueue = queue[message.priority];
    if (priorityQueue.length < MAX_QUEUE_SIZE_PER_PRIORITY) {
      priorityQueue.push(message);
    } else {
      console.warn(`[AgentCommBus] Queue full for ${agentId} priority ${message.priority}, dropping message ${message.id}`);
    }
  }

  private deliverToAll(message: AgentMessage): void {
    const allRecipients = new Set<string>();
    for (const [agentId] of this.queues) {
      allRecipients.add(agentId);
    }
    // Also ensure common agents have queues
    for (const role of ['architect', 'debug', 'research', 'security', 'performance', 'product'] as AgentRole[]) {
      allRecipients.add(role);
    }

    for (const agentId of allRecipients) {
      if (agentId !== message.from) {
        this.deliverToAgent(agentId, message);
      }
    }
  }

  private trackInThread(message: AgentMessage): void {
    const participants: string[] = [];
    if (message.from !== 'orchestrator' && message.from !== 'user') participants.push(message.from);
    if (message.to !== 'broadcast' && message.to !== 'orchestrator') participants.push(message.to);

    if (participants.length >= 2 || message.correlationId) {
      const thread = this.getOrCreateThread(participants);
      thread.messages.push(message);
      thread.lastActivity = Date.now();

      // Trim old messages
      if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
        thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD);
      }
    }

    // Trim threads if too many
    if (this.threads.size > MAX_THREADS) {
      const sorted = Array.from(this.threads.entries())
        .sort((a, b) => a[1].lastActivity - b[1].lastActivity);
      while (this.threads.size > MAX_THREADS) {
        const [key] = sorted.shift()!;
        this.threads.delete(key);
        this.emitBusEvent('thread:closed', undefined, key);
      }
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60_000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  private cleanup(): void {
    const cutoff = Date.now() - MESSAGE_RETENTION_MS;
    const toRemove: string[] = [];

    for (const [id, msg] of this.messages) {
      if (msg.timestamp < cutoff) {
        if (msg.expiresAt && msg.expiresAt > cutoff) continue; // not yet expired
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.messages.delete(id);
      this.emitBusEvent('message:expired', id);
    }

    // Clean message order
    const activeIds = new Set(this.messages.keys());
    this.messageOrder = this.messageOrder.filter(id => activeIds.has(id));
  }

  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.queues.clear();
    this.threads.clear();
    this.messages.clear();
    this.messageOrder = [];
    this.busEventHandlers = [];
    this.removeAllListeners();
  }
}
