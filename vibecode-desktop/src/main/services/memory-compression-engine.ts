// ─── VibeCode Desktop — Memory Compression Engine ────────────────────────────
// ARC 21 P0-5: Memory Compression
//
// Optimizes session memory by:
//   - Compressing long interaction histories
//   - Extracting only actionable embeddings
//   - Removing redundant context chains
//   - Building hierarchical memory layers
//
// Includes:
//   - Memory summarization cycles
//   - Semantic deduplication
//   - Importance scoring decay model
// ──────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type { SessionMemoryService, ActiveObjective, UserPattern, UnfinishedTask } from './session-memory';
import type { WorkspaceContextService } from './workspace-context-service';
import type { ExecutionStateMachine, ExecutionNode } from './execution-state-machine';
import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsWriteInternalSync,
  kernelFsMkdirInternalSync,
} from '../kernel/kernel-fs';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Memory layer — hierarchical importance */
export type MemoryLayer = 'working' | 'short_term' | 'long_term' | 'archived';

/** A compressed memory entry */
export interface CompressedMemory {
  /** Unique ID */
  id: string;
  /** Layer this memory lives in */
  layer: MemoryLayer;
  /** Compressed summary */
  summary: string;
  /** Key facts extracted */
  keyFacts: string[];
  /** Importance score (0-1, decays over time) */
  importance: number;
  /** When the original memory was created */
  originalCreatedAt: number;
  /** When this was compressed */
  compressedAt: number;
  /** Source entries that were compressed into this */
  sourceEntryCount: number;
  /** Tags for retrieval */
  tags: string[];
  /** Related file paths */
  relatedFiles: string[];
  /** Access count (how many times this was retrieved) */
  accessCount: number;
  /** Last accessed */
  lastAccessedAt: number;
}

/** Compression result */
export interface CompressionResult {
  /** Entries before compression */
  entriesBefore: number;
  /** Entries after compression */
  entriesAfter: number;
  /** Compression ratio (0-1, 1 = maximum compression) */
  compressionRatio: number;
  /** Tokens saved (estimated) */
  tokensSaved: number;
  /** Layers affected */
  layersAffected: MemoryLayer[];
  /** Duration (ms) */
  duration: number;
  /** When this compression ran */
  compressedAt: number;
}

/** Memory importance decay model */
export interface DecayConfig {
  /** Half-life for importance decay (ms) — how quickly importance drops */
  workingHalfLife: number;       // Default: 10 minutes
  shortTermHalfLife: number;     // Default: 2 hours
  longTermHalfLife: number;      // Default: 7 days
  /** Minimum importance before archival */
  archivalThreshold: number;     // Default: 0.05
  /** Minimum importance before deletion */
  deletionThreshold: number;     // Default: 0.01
  /** Boost factor when memory is accessed */
  accessBoost: number;           // Default: 0.2
}

/** Compression engine metrics */
export interface CompressionMetrics {
  /** Total compression cycles run */
  totalCycles: number;
  /** Total entries compressed */
  totalEntriesCompressed: number;
  /** Average compression ratio */
  avgCompressionRatio: number;
  /** Total tokens saved (estimated) */
  totalTokensSaved: number;
  /** Entries by layer */
  entriesByLayer: Record<MemoryLayer, number>;
  /** Last compression timestamp */
  lastCompressionAt: number;
  /** Average importance of active memories */
  avgImportance: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  workingHalfLife: 10 * 60 * 1000,      // 10 minutes
  shortTermHalfLife: 2 * 60 * 60 * 1000, // 2 hours
  longTermHalfLife: 7 * 24 * 60 * 60 * 1000, // 7 days
  archivalThreshold: 0.05,
  deletionThreshold: 0.01,
  accessBoost: 0.2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY COMPRESSION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class MemoryCompressionEngine extends EventEmitter {
  private sessionMemory: SessionMemoryService | null = null;
  private workspaceContext: WorkspaceContextService | null = null;
  private esm: ExecutionStateMachine | null = null;
  private decayConfig: DecayConfig;

  /** Compressed memories by layer */
  private memories: Map<string, CompressedMemory> = new Map();

  /** Memory index by tag for fast retrieval */
  private tagIndex: Map<string, Set<string>> = new Map();

  /** Persist path */
  private persistPath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly PERSIST_DELAY = 5000;

  /** Metrics */
  private metrics: CompressionMetrics = {
    totalCycles: 0,
    totalEntriesCompressed: 0,
    avgCompressionRatio: 0,
    totalTokensSaved: 0,
    entriesByLayer: { working: 0, short_term: 0, long_term: 0, archived: 0 },
    lastCompressionAt: 0,
    avgImportance: 0,
  };

  constructor(decayConfig?: Partial<DecayConfig>) {
    super();
    this.decayConfig = { ...DEFAULT_DECAY_CONFIG, ...decayConfig };
    this.setMaxListeners(30);

    const vibecodeHome = process.env.VIBECODE_HOME ||
      path.join(os.homedir(), '.vibecode');
    this.persistPath = path.join(vibecodeHome, 'compressed-memory.json');

    this.load();
  }

  /** Inject dependencies */
  injectDependencies(deps: {
    sessionMemory?: SessionMemoryService;
    workspaceContext?: WorkspaceContextService;
    esm?: ExecutionStateMachine;
  }): void {
    if (deps.sessionMemory) this.sessionMemory = deps.sessionMemory;
    if (deps.workspaceContext) this.workspaceContext = deps.workspaceContext;
    if (deps.esm) this.esm = deps.esm;
  }

  // ─── Compression Cycle ──────────────────────────────────────────────

  /** Run a full compression cycle */
  compress(): CompressionResult {
    const startTime = Date.now();
    const entriesBefore = this.memories.size;

    // 1. Apply importance decay
    this.applyDecay();

    // 2. Promote/demote layers based on importance
    this.rebalanceLayers();

    // 3. Compress working memory → short_term
    this.compressWorkingMemory();

    // 4. Semantic deduplication
    this.deduplicate();

    // 5. Archive low-importance memories
    this.archiveMemories();

    // 6. Delete below-threshold memories
    this.purgeMemories();

    // 7. Compress from session memory if available
    if (this.sessionMemory) {
      this.compressFromSessionMemory();
    }

    // 8. Update metrics
    const entriesAfter = this.memories.size;
    const compressionRatio = entriesBefore > 0 ? 1 - (entriesAfter / entriesBefore) : 0;
    const tokensSaved = this.estimateTokensSaved(entriesBefore, entriesAfter);

    const result: CompressionResult = {
      entriesBefore,
      entriesAfter,
      compressionRatio,
      tokensSaved,
      layersAffected: ['working', 'short_term', 'long_term'],
      duration: Date.now() - startTime,
      compressedAt: Date.now(),
    };

    this.metrics.totalCycles++;
    this.metrics.totalEntriesCompressed += entriesBefore - entriesAfter;
    this.metrics.avgCompressionRatio = this.metrics.totalCycles === 1
      ? compressionRatio
      : (this.metrics.avgCompressionRatio * 0.9 + compressionRatio * 0.1);
    this.metrics.totalTokensSaved += tokensSaved;
    this.metrics.lastCompressionAt = Date.now();
    this.updateLayerCounts();

    this.emit('compression:complete', result);
    this.schedulePersist();

    logger.info('memory-compression', `Compression cycle: ${entriesBefore} → ${entriesAfter} entries (${(compressionRatio * 100).toFixed(1)}% reduction)`);

    return result;
  }

  // ─── Importance Decay ───────────────────────────────────────────────

  /** Apply time-based importance decay to all memories */
  private applyDecay(): void {
    const now = Date.now();

    for (const [id, memory] of this.memories) {
      const age = now - memory.originalCreatedAt;
      const halfLife = this.getHalfLifeForLayer(memory.layer);
      const decayFactor = Math.pow(0.5, age / halfLife);

      // Apply decay
      memory.importance = memory.importance * decayFactor;

      // Boost if recently accessed
      if (now - memory.lastAccessedAt < halfLife * 0.1) {
        memory.importance = Math.min(1, memory.importance + this.decayConfig.accessBoost);
      }
    }
  }

  /** Get the half-life for a memory layer */
  private getHalfLifeForLayer(layer: MemoryLayer): number {
    switch (layer) {
      case 'working': return this.decayConfig.workingHalfLife;
      case 'short_term': return this.decayConfig.shortTermHalfLife;
      case 'long_term': return this.decayConfig.longTermHalfLife;
      case 'archived': return this.decayConfig.longTermHalfLife * 4;
    }
  }

  // ─── Layer Management ──────────────────────────────────────────────

  /** Rebalance memory layers based on importance scores */
  private rebalanceLayers(): void {
    for (const [id, memory] of this.memories) {
      const targetLayer = this.computeTargetLayer(memory);

      if (targetLayer !== memory.layer) {
        memory.layer = targetLayer;
        this.emit('memory:layer_change', { id, from: memory.layer, to: targetLayer });
      }
    }
  }

  /** Compute the target layer for a memory based on its importance */
  private computeTargetLayer(memory: CompressedMemory): MemoryLayer {
    if (memory.importance >= 0.6) return 'working';
    if (memory.importance >= 0.3) return 'short_term';
    if (memory.importance >= this.decayConfig.archivalThreshold) return 'long_term';
    return 'archived';
  }

  // ─── Compression ──────────────────────────────────────────────────

  /** Compress working memory entries into short-term summaries */
  private compressWorkingMemory(): void {
    const workingMemories = Array.from(this.memories.values())
      .filter(m => m.layer === 'working');

    if (workingMemories.length < 5) return; // Not enough to compress

    // Group by tags for targeted compression
    const groups = this.groupBySimilarity(workingMemories);

    for (const group of groups) {
      if (group.length < 3) continue; // Not enough for compression

      // Create a compressed summary
      const summary = this.summarizeGroup(group);
      const keyFacts = this.extractKeyFacts(group);
      const tags = [...new Set(group.flatMap(m => m.tags))];
      const relatedFiles = [...new Set(group.flatMap(m => m.relatedFiles))];

      const compressed: CompressedMemory = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        layer: 'short_term',
        summary,
        keyFacts,
        importance: Math.max(...group.map(m => m.importance)) * 0.9,
        originalCreatedAt: Math.min(...group.map(m => m.originalCreatedAt)),
        compressedAt: Date.now(),
        sourceEntryCount: group.length,
        tags,
        relatedFiles,
        accessCount: group.reduce((sum, m) => sum + m.accessCount, 0),
        lastAccessedAt: Math.max(...group.map(m => m.lastAccessedAt)),
      };

      // Remove originals and add compressed
      for (const m of group) {
        this.memories.delete(m.id);
        this.removeFromTagIndex(m);
      }

      this.memories.set(compressed.id, compressed);
      this.addToTagIndex(compressed);
    }
  }

  /** Group memories by similarity */
  private groupBySimilarity(memories: CompressedMemory[]): CompressedMemory[][] {
    const groups: CompressedMemory[][] = [];
    const assigned = new Set<string>();

    for (const memory of memories) {
      if (assigned.has(memory.id)) continue;

      const group: CompressedMemory[] = [memory];
      assigned.add(memory.id);

      // Find similar memories (by tag overlap)
      for (const other of memories) {
        if (assigned.has(other.id)) continue;

        const tagOverlap = this.computeTagOverlap(memory.tags, other.tags);
        if (tagOverlap > 0.5) {
          group.push(other);
          assigned.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /** Compute tag overlap between two sets */
  private computeTagOverlap(tagsA: string[], tagsB: string[]): number {
    if (tagsA.length === 0 || tagsB.length === 0) return 0;

    const setA = new Set(tagsA);
    const setB = new Set(tagsB);
    const intersection = new Set([...setA].filter(t => setB.has(t)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size; // Jaccard similarity
  }

  /** Summarize a group of memories */
  private summarizeGroup(group: CompressedMemory[]): string {
    // Simple concatenation + truncation
    // A real implementation would use an LLM for summarization
    const allSummaries = group.map(m => m.summary);
    const combined = allSummaries.join('; ');

    if (combined.length <= 200) return combined;

    return combined.slice(0, 197) + '...';
  }

  /** Extract key facts from a group */
  private extractKeyFacts(group: CompressedMemory[]): string[] {
    const allFacts = group.flatMap(m => m.keyFacts);
    // Deduplicate
    return [...new Set(allFacts)].slice(0, 10);
  }

  // ─── Deduplication ─────────────────────────────────────────────────

  /** Remove semantically duplicate memories */
  private deduplicate(): void {
    const allMemories = Array.from(this.memories.values());
    const toRemove: Set<string> = new Set();

    for (let i = 0; i < allMemories.length; i++) {
      if (toRemove.has(allMemories[i].id)) continue;

      for (let j = i + 1; j < allMemories.length; j++) {
        if (toRemove.has(allMemories[j].id)) continue;

        // Check for near-duplicate summaries
        if (this.isNearDuplicate(allMemories[i], allMemories[j])) {
          // Keep the one with higher importance
          const keeper = allMemories[i].importance >= allMemories[j].importance
            ? allMemories[i] : allMemories[j];
          const loser = keeper === allMemories[i] ? allMemories[j] : allMemories[i];

          // Merge info into keeper
          keeper.keyFacts = [...new Set([...keeper.keyFacts, ...loser.keyFacts])];
          keeper.tags = [...new Set([...keeper.tags, ...loser.tags])];
          keeper.relatedFiles = [...new Set([...keeper.relatedFiles, ...loser.relatedFiles])];
          keeper.sourceEntryCount += loser.sourceEntryCount;
          keeper.accessCount += loser.accessCount;

          toRemove.add(loser.id);
        }
      }
    }

    for (const id of toRemove) {
      const memory = this.memories.get(id);
      if (memory) this.removeFromTagIndex(memory);
      this.memories.delete(id);
    }
  }

  /** Check if two memories are near-duplicates */
  private isNearDuplicate(a: CompressedMemory, b: CompressedMemory): boolean {
    // Exact summary match
    if (a.summary === b.summary) return true;

    // High tag overlap + similar summary start
    const tagOverlap = this.computeTagOverlap(a.tags, b.tags);
    if (tagOverlap > 0.8 && a.summary.slice(0, 50) === b.summary.slice(0, 50)) {
      return true;
    }

    return false;
  }

  // ─── Archive & Purge ────────────────────────────────────────────────

  /** Archive low-importance memories */
  private archiveMemories(): void {
    for (const [id, memory] of this.memories) {
      if (memory.importance < this.decayConfig.archivalThreshold && memory.layer !== 'archived') {
        memory.layer = 'archived';
      }
    }
  }

  /** Delete below-threshold memories */
  private purgeMemories(): void {
    const toDelete: string[] = [];

    for (const [id, memory] of this.memories) {
      if (memory.importance < this.decayConfig.deletionThreshold && memory.layer === 'archived') {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      const memory = this.memories.get(id);
      if (memory) this.removeFromTagIndex(memory);
      this.memories.delete(id);
    }
  }

  // ─── Session Memory Integration ──────────────────────────────────────

  /** Compress data from SessionMemoryService into the compressed store */
  private compressFromSessionMemory(): void {
    if (!this.sessionMemory) return;

    const state = this.sessionMemory.getState();

    // Compress objectives
    for (const obj of state.objectives) {
      if (obj.status === 'completed' || obj.status === 'abandoned') {
        const existing = this.findMemoryByTag(`obj:${obj.id}`);
        if (!existing) {
          this.memories.set(`mem_obj_${obj.id}`, {
            id: `mem_obj_${obj.id}`,
            layer: 'long_term',
            summary: `Objective: ${obj.description} (${obj.status} at ${obj.progress}%)`,
            keyFacts: [obj.description, `Progress: ${obj.progress}%`, `Status: ${obj.status}`],
            importance: 0.3,
            originalCreatedAt: obj.createdAt,
            compressedAt: Date.now(),
            sourceEntryCount: 1,
            tags: [`obj:${obj.id}`, 'objective', obj.status],
            relatedFiles: obj.relatedFiles,
            accessCount: 0,
            lastAccessedAt: obj.lastReferencedAt,
          });
        }
      }
    }

    // Compress patterns
    for (const pattern of state.patterns) {
      if (pattern.confidence > 0.5) {
        const id = `mem_pat_${pattern.type}_${this.simpleHash(pattern.description)}`;
        if (!this.memories.has(id)) {
          this.memories.set(id, {
            id,
            layer: 'long_term',
            summary: `Pattern (${pattern.type}): ${pattern.description}`,
            keyFacts: [pattern.description, `Frequency: ${pattern.frequency}`, `Confidence: ${pattern.confidence.toFixed(2)}`],
            importance: pattern.confidence * 0.5,
            originalCreatedAt: pattern.lastObserved,
            compressedAt: Date.now(),
            sourceEntryCount: pattern.frequency,
            tags: ['pattern', pattern.type],
            relatedFiles: [],
            accessCount: 0,
            lastAccessedAt: pattern.lastObserved,
          });
        }
      }
    }
  }

  // ─── Tag Index ──────────────────────────────────────────────────────

  private addToTagIndex(memory: CompressedMemory): void {
    for (const tag of memory.tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(memory.id);
    }
  }

  private removeFromTagIndex(memory: CompressedMemory): void {
    for (const tag of memory.tags) {
      this.tagIndex.get(tag)?.delete(memory.id);
    }
  }

  /** Find a memory by tag */
  private findMemoryByTag(tag: string): CompressedMemory | null {
    const ids = this.tagIndex.get(tag);
    if (!ids || ids.size === 0) return null;
    const firstId = ids.values().next().value;
    return this.memories.get(firstId) ?? null;
  }

  // ─── Token Estimation ───────────────────────────────────────────────

  /** Estimate tokens saved by compression */
  private estimateTokensSaved(before: number, after: number): number {
    // Rough estimate: each entry ≈ 100 tokens, compressed entries ≈ 40 tokens
    const rawTokens = before * 100;
    const compressedTokens = after * 40;
    return Math.max(0, rawTokens - compressedTokens);
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  /** Simple hash for deduplication */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /** Update layer count metrics */
  private updateLayerCounts(): void {
    const counts: Record<MemoryLayer, number> = { working: 0, short_term: 0, long_term: 0, archived: 0 };
    for (const memory of this.memories.values()) {
      counts[memory.layer]++;
    }
    this.metrics.entriesByLayer = counts;

    // Compute average importance
    const allImportance = Array.from(this.memories.values()).map(m => m.importance);
    this.metrics.avgImportance = allImportance.length > 0
      ? allImportance.reduce((a, b) => a + b, 0) / allImportance.length
      : 0;
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private load(): void {
    try {
      if (!kernelFsExistsInternal(this.persistPath)) return;

      const data = JSON.parse(kernelFsReadSync(this.persistPath, 'utf-8'));

      for (const entry of data.memories ?? []) {
        this.memories.set(entry.id, entry);
        this.addToTagIndex(entry);
      }

      if (data.metrics) this.metrics = data.metrics;

      this.updateLayerCounts();
      logger.info('memory-compression', `Loaded ${this.memories.size} compressed memories`);
    } catch (err) {
      logger.warn('memory-compression', `Failed to load: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!kernelFsExistsInternal(dir)) {
        kernelFsMkdirInternalSync(dir);
      }

      const data = {
        memories: Array.from(this.memories.values()),
        metrics: this.metrics,
      };

      kernelFsWriteInternalSync(this.persistPath, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug('memory-compression', 'State persisted');
    } catch (err) {
      logger.error('memory-compression', `Failed to persist: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persist();
      this.persistTimer = null;
    }, this.PERSIST_DELAY);
  }

  /** Force persist */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist();
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /** Get all memories in a layer */
  getMemoriesByLayer(layer: MemoryLayer): CompressedMemory[] {
    return Array.from(this.memories.values()).filter(m => m.layer === layer);
  }

  /** Search memories by tag */
  searchByTag(tag: string): CompressedMemory[] {
    const ids = this.tagIndex.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.memories.get(id))
      .filter((m): m is CompressedMemory => m !== null);
  }

  /** Get relevant context for AI — returns high-importance memories */
  getRelevantContext(maxTokens: number = 500): string {
    const memories = Array.from(this.memories.values())
      .filter(m => m.layer !== 'archived')
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    const lines: string[] = ['## Compressed Memory Context'];
    for (const m of memories) {
      lines.push(`- [${m.layer}] ${m.summary}`);
      if (m.keyFacts.length > 0) {
        lines.push(`  Facts: ${m.keyFacts.slice(0, 3).join('; ')}`);
      }
    }

    return lines.join('\n');
  }

  /** Get metrics */
  getMetrics(): CompressionMetrics {
    return { ...this.metrics };
  }

  /** Get total memory count */
  getMemoryCount(): number {
    return this.memories.size;
  }

  /** Record memory access (boosts importance) */
  recordAccess(memoryId: string): void {
    const memory = this.memories.get(memoryId);
    if (!memory) return;

    memory.accessCount++;
    memory.lastAccessedAt = Date.now();
    memory.importance = Math.min(1, memory.importance + this.decayConfig.accessBoost);
  }

  /** Add a new working memory entry */
  addWorkingMemory(summary: string, keyFacts: string[], tags: string[], relatedFiles: string[] = []): CompressedMemory {
    const memory: CompressedMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      layer: 'working',
      summary,
      keyFacts,
      importance: 0.8,
      originalCreatedAt: Date.now(),
      compressedAt: Date.now(),
      sourceEntryCount: 1,
      tags,
      relatedFiles,
      accessCount: 0,
      lastAccessedAt: Date.now(),
    };

    this.memories.set(memory.id, memory);
    this.addToTagIndex(memory);
    this.schedulePersist();

    return memory;
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let memoryCompressionEngine: MemoryCompressionEngine | null = null;

export function getMemoryCompressionEngine(decayConfig?: Partial<DecayConfig>): MemoryCompressionEngine {
  if (!memoryCompressionEngine) {
    memoryCompressionEngine = new MemoryCompressionEngine(decayConfig);
  }
  return memoryCompressionEngine;
}

export function resetMemoryCompressionEngine(decayConfig?: Partial<DecayConfig>): MemoryCompressionEngine {
  memoryCompressionEngine = new MemoryCompressionEngine(decayConfig);
  return memoryCompressionEngine;
}
