// ============================================================
// VibeCode Desktop — ARC 22: Shared Context Graph
// Cross-agent context synchronization, workspace event
// streaming, shared reasoning cache, conflict detection
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  SharedContextEntry,
  WorkspaceEvent,
  WorkspaceEventClassification,
  AgentRole,
  AgentObservation,
} from './types';
import { EventEmitter } from 'events';

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_ENTRIES = 10_000;
const MAX_EVENT_BUFFER = 500;
const EVENT_PROCESSING_BATCH_SIZE = 50;
const CONTEXT_PRUNE_INTERVAL_MS = 5 * 60_000; // 5 min
const DEFAULT_EXPIRY_MS = 30 * 60_000; // 30 min

// ─── Event Types ────────────────────────────────────────────────────────────

export type ContextGraphEventType = 'entry:added' | 'entry:updated' | 'entry:expired' | 'event:classified' | 'conflict:detected' | 'context:pruned';

export interface ContextGraphEvent {
  type: ContextGraphEventType;
  entryId?: string;
  eventId?: string;
  timestamp: number;
  data?: unknown;
}

// ─── Conflict Record ────────────────────────────────────────────────────────

interface ContextConflict {
  id: string;
  entryA: string; // entry ID
  entryB: string; // entry ID
  field: string;
  valueA: unknown;
  valueB: unknown;
  detectedAt: number;
  resolved: boolean;
  resolution?: 'keep_newer' | 'keep_higher_importance' | 'manual';
}

// ─── Subscription ───────────────────────────────────────────────────────────

interface ContextSubscription {
  id: string;
  agentId: AgentRole;
  filter: ContextFilter;
  callback: (entries: SharedContextEntry[]) => void;
}

interface ContextFilter {
  types?: string[];
  sources?: string[];
  minImportance?: number;
  since?: number;
}

// ─── Shared Context Graph ───────────────────────────────────────────────────

export class SharedContextGraph extends EventEmitter {
  private entries: Map<string, SharedContextEntry> = new Map();
  private entryOrder: string[] = [];
  private eventBuffer: WorkspaceEvent[] = [];
  private conflicts: Map<string, ContextConflict> = new Map();
  private subscriptions: Map<string, ContextSubscription> = new Map();
  private handlers: ((event: ContextGraphEvent) => void)[] = [];
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startPruneTimer();
  }

  // ─── Context Entry Management ─────────────────────────────────────────

  /**
   * Add a new entry to the shared context graph.
   * This is the primary way agents share knowledge.
   */
  addEntry(entry: Omit<SharedContextEntry, 'id' | 'timestamp' | 'version'>): SharedContextEntry {
    // Check for conflicts with existing entries
    this.detectConflicts(entry);

    const fullEntry: SharedContextEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: Date.now(),
      version: 1,
    };

    this.entries.set(fullEntry.id, fullEntry);
    this.entryOrder.push(fullEntry.id);

    // Enforce size limits
    this.enforceEntryLimit();

    // Notify subscribers
    this.notifySubscribers(fullEntry);

    // Emit event
    this.emitGraphEvent('entry:added', fullEntry.id);

    return fullEntry;
  }

  /**
   * Update an existing context entry (with version tracking).
   */
  updateEntry(entryId: string, updates: Partial<SharedContextEntry>): SharedContextEntry | null {
    const existing = this.entries.get(entryId);
    if (!existing) return null;

    const updated: SharedContextEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      timestamp: existing.timestamp,
      version: existing.version + 1,
    };

    this.entries.set(entryId, updated);
    this.emitGraphEvent('entry:updated', entryId);

    return updated;
  }

  /**
   * Get a specific context entry by ID.
   */
  getEntry(entryId: string): SharedContextEntry | null {
    return this.entries.get(entryId) ?? null;
  }

  /**
   * Query context entries matching criteria.
   */
  query(filter: ContextFilter): SharedContextEntry[] {
    let results = Array.from(this.entries.values());

    if (filter.types) {
      results = results.filter(e => filter.types!.includes(e.type));
    }
    if (filter.sources) {
      results = results.filter(e => filter.sources!.includes(e.source));
    }
    if (filter.minImportance !== undefined) {
      results = results.filter(e => e.importance >= filter.minImportance!);
    }
    if (filter.since) {
      results = results.filter(e => e.timestamp >= filter.since!);
    }

    // Sort by importance + recency
    results.sort((a, b) => {
      const scoreA = a.importance * 0.6 + this.recencyScore(a.timestamp) * 0.4;
      const scoreB = b.importance * 0.6 + this.recencyScore(b.timestamp) * 0.4;
      return scoreB - scoreA;
    });

    return results;
  }

  /**
   * Get the most relevant context for a given topic/query.
   */
  getRelevantContext(query: string, limit: number = 20): SharedContextEntry[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = Array.from(this.entries.values()).map(entry => {
      let score = 0;
      const contentLower = entry.content.toLowerCase();

      // Term matching
      for (const term of queryTerms) {
        if (contentLower.includes(term)) score += 3;
      }

      // Importance and recency
      score += entry.importance * 5;
      score += this.recencyScore(entry.timestamp) * 3;

      // Type relevance: decisions and actions are more important
      if (entry.type === 'decision') score += 2;
      if (entry.type === 'action_result') score += 1.5;

      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.entry);
  }

  /**
   * Get all entries from a specific source.
   */
  getBySource(source: AgentRole | 'workspace' | 'user'): SharedContextEntry[] {
    return Array.from(this.entries.values())
      .filter(e => e.source === source)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get context entries related to a specific entry.
   */
  getRelated(entryId: string, depth: number = 1): SharedContextEntry[] {
    const visited = new Set<string>();
    const results: SharedContextEntry[] = [];
    const queue: string[] = [entryId];

    for (let i = 0; i < depth && queue.length > 0; i++) {
      const nextQueue: string[] = [];

      for (const id of queue) {
        if (visited.has(id)) continue;
        visited.add(id);

        const entry = this.entries.get(id);
        if (!entry) continue;

        for (const relatedId of entry.relatedEntries) {
          if (!visited.has(relatedId)) {
            const related = this.entries.get(relatedId);
            if (related) {
              results.push(related);
              nextQueue.push(relatedId);
            }
          }
        }
      }

      queue.length = 0;
      queue.push(...nextQueue);
    }

    return results;
  }

  // ─── Workspace Event Streaming ────────────────────────────────────────

  /**
   * Push a workspace event into the context graph.
   * Events are classified semantically and converted to context entries.
   */
  pushWorkspaceEvent(event: WorkspaceEvent): void {
    this.eventBuffer.push(event);

    // Trim buffer if needed
    if (this.eventBuffer.length > MAX_EVENT_BUFFER) {
      this.eventBuffer = this.eventBuffer.slice(-MAX_EVENT_BUFFER);
    }

    // Convert significant events to context entries
    if (event.semanticClassification !== 'build_artifact') {
      this.addEntry({
        type: 'observation',
        source: 'workspace',
        content: this.eventToContextString(event),
        importance: this.eventImportance(event),
        relatedEntries: [],
        expiresAt: Date.now() + DEFAULT_EXPIRY_MS,
      });
    }

    this.emitGraphEvent('event:classified', undefined, event.id);
  }

  /**
   * Get recent workspace events.
   */
  getRecentEvents(limit: number = 50): WorkspaceEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  /**
   * Get events affecting a specific file path.
   */
  getEventsForPath(filePath: string): WorkspaceEvent[] {
    return this.eventBuffer.filter(e => e.path === filePath);
  }

  // ─── Agent Observation Integration ────────────────────────────────────

  /**
   * Add an agent observation to the shared context.
   */
  addObservation(observation: AgentObservation): SharedContextEntry {
    return this.addEntry({
      type: 'observation',
      source: observation.agentId,
      content: `[${observation.severity.toUpperCase()}] ${observation.type}: ${observation.content}`,
      importance: observation.severity === 'critical' ? 0.95 : observation.severity === 'warning' ? 0.7 : 0.4,
      relatedEntries: [],
      expiresAt: Date.now() + DEFAULT_EXPIRY_MS,
    });
  }

  // ─── Conflict Detection ───────────────────────────────────────────────

  /**
   * Get all unresolved conflicts.
   */
  getConflicts(): ContextConflict[] {
    return Array.from(this.conflicts.values()).filter(c => !c.resolved);
  }

  /**
   * Resolve a conflict.
   */
  resolveConflict(conflictId: string, resolution: ContextConflict['resolution']): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return false;

    conflict.resolved = true;
    conflict.resolution = resolution;

    // Apply resolution
    if (resolution === 'keep_newer') {
      const entryA = this.entries.get(conflict.entryA);
      const entryB = this.entries.get(conflict.entryB);
      if (entryA && entryB) {
        const older = entryA.timestamp < entryB.timestamp ? entryA : entryB;
        this.entries.delete(older.id);
      }
    } else if (resolution === 'keep_higher_importance') {
      const entryA = this.entries.get(conflict.entryA);
      const entryB = this.entries.get(conflict.entryB);
      if (entryA && entryB) {
        const lower = entryA.importance < entryB.importance ? entryA : entryB;
        this.entries.delete(lower.id);
      }
    }

    return true;
  }

  // ─── Subscriptions ────────────────────────────────────────────────────

  /**
   * Subscribe an agent to filtered context updates.
   */
  subscribe(agentId: AgentRole, filter: ContextFilter, callback: (entries: SharedContextEntry[]) => void): string {
    const subId = uuidv4();
    this.subscriptions.set(subId, { id: subId, agentId, filter, callback });
    return subId;
  }

  /**
   * Unsubscribe from context updates.
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  getStats(): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    entriesBySource: Record<string, number>;
    eventBufferSize: number;
    unresolvedConflicts: number;
    activeSubscriptions: number;
  } {
    const entriesByType: Record<string, number> = {};
    const entriesBySource: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      entriesByType[entry.type] = (entriesByType[entry.type] ?? 0) + 1;
      entriesBySource[entry.source] = (entriesBySource[entry.source] ?? 0) + 1;
    }

    return {
      totalEntries: this.entries.size,
      entriesByType,
      entriesBySource,
      eventBufferSize: this.eventBuffer.length,
      unresolvedConflicts: Array.from(this.conflicts.values()).filter(c => !c.resolved).length,
      activeSubscriptions: this.subscriptions.size,
    };
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onGraphEvent(handler: (event: ContextGraphEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  private emitGraphEvent(type: ContextGraphEventType, entryId?: string, eventId?: string): void {
    const event: ContextGraphEvent = { type, entryId, eventId, timestamp: Date.now() };
    for (const handler of this.handlers) {
      try { handler(event); } catch (err) { console.error('[SharedContextGraph] Event handler error:', err); }
    }
    this.emit(type, event);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private recencyScore(timestamp: number): number {
    const ageMs = Date.now() - timestamp;
    const ageMin = ageMs / 60_000;
    // Exponential decay: half-life of 15 minutes
    return Math.pow(0.5, ageMin / 15);
  }

  private enforceEntryLimit(): void {
    while (this.entries.size > MAX_ENTRIES) {
      const oldestId = this.entryOrder.shift();
      if (oldestId) {
        this.entries.delete(oldestId);
      } else {
        break;
      }
    }
  }

  private detectConflicts(newEntry: Omit<SharedContextEntry, 'id' | 'timestamp' | 'version'>): void {
    for (const [id, existing] of this.entries) {
      if (existing.source === newEntry.source && existing.type === newEntry.type) {
        // Check for overlapping content
        const overlap = this.contentOverlap(existing.content, newEntry.content);
        if (overlap > 0.7 && existing.importance !== newEntry.importance) {
          const conflict: ContextConflict = {
            id: uuidv4(),
            entryA: id,
            entryB: '__pending__', // will be filled after entry is created
            field: 'content',
            valueA: existing.content.slice(0, 100),
            valueB: newEntry.content.slice(0, 100),
            detectedAt: Date.now(),
            resolved: false,
          };
          // Store conflict - entryB will be updated after creation
          this.conflicts.set(conflict.id, conflict);
          this.emitGraphEvent('conflict:detected', id);
        }
      }
    }
  }

  private contentOverlap(a: string, b: string): number {
    const termsA = new Set(a.toLowerCase().split(/\s+/));
    const termsB = new Set(b.toLowerCase().split(/\s+/));
    let intersection = 0;
    for (const term of termsA) {
      if (termsB.has(term)) intersection++;
    }
    const union = new Set([...termsA, ...termsB]).size;
    return union > 0 ? intersection / union : 0;
  }

  private notifySubscribers(entry: SharedContextEntry): void {
    for (const sub of this.subscriptions.values()) {
      const matches = (
        (!sub.filter.types || sub.filter.types.includes(entry.type)) &&
        (!sub.filter.sources || sub.filter.sources.includes(entry.source)) &&
        (!sub.filter.minImportance || entry.importance >= sub.filter.minImportance)
      );
      if (matches) {
        try { sub.callback([entry]); } catch (err) { console.error('[SharedContextGraph] Subscriber callback error:', err); }
      }
    }
  }

  private eventToContextString(event: WorkspaceEvent): string {
    switch (event.type) {
      case 'file_modified': return `File modified: ${event.path}`;
      case 'file_created': return `File created: ${event.path}`;
      case 'file_deleted': return `File deleted: ${event.path}`;
      case 'test_run': return `Test run: ${event.metadata.success ? 'passed' : 'failed'}`;
      case 'build_result': return `Build: ${event.metadata.success ? 'success' : 'failed'}`;
      case 'error_occurred': return `Error: ${event.content ?? 'Unknown error'}`;
      case 'dependency_change': return `Dependency changed: ${event.path}`;
      case 'git_change': return `Git: ${event.metadata.action ?? 'change'} on ${event.metadata.branch ?? 'unknown branch'}`;
      default: return `Workspace event: ${event.type}`;
    }
  }

  private eventImportance(event: WorkspaceEvent): number {
    switch (event.semanticClassification) {
      case 'error_state': return 0.9;
      case 'source_change': return 0.7;
      case 'dependency_change': return 0.75;
      case 'config_change': return 0.65;
      case 'test_change': return 0.6;
      case 'version_control': return 0.5;
      case 'documentation_change': return 0.3;
      case 'build_artifact': return 0.2;
      default: return 0.5;
    }
  }

  private startPruneTimer(): void {
    this.pruneTimer = setInterval(() => {
      this.pruneExpired();
    }, CONTEXT_PRUNE_INTERVAL_MS);
    if (this.pruneTimer?.unref) this.pruneTimer.unref();
  }

  private pruneExpired(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt < now) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.entries.delete(id);
      this.emitGraphEvent('entry:expired', id);
    }

    if (toRemove.length > 0) {
      const activeIds = new Set(this.entries.keys());
      this.entryOrder = this.entryOrder.filter(id => activeIds.has(id));
      this.emitGraphEvent('context:pruned');
    }
  }

  dispose(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.entries.clear();
    this.entryOrder = [];
    this.eventBuffer = [];
    this.conflicts.clear();
    this.subscriptions.clear();
    this.handlers = [];
    this.removeAllListeners();
  }
}
