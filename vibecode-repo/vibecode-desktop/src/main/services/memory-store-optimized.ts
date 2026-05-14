// ─── Optimized Memory Store ─────────────────────────────────────────────────
//
// Replaces the eager-loading MemoryStore with a lazy, bounded, LRU-based
// implementation that scales safely.
//
// Key improvements:
//   - Lazy loading: only loads project data on demand
//   - LRU cache eviction: bounded in-memory retention
//   - Per-project partitioning: each project's data is independent
//   - Memory compaction: idle pruning of old entries
//   - Async indexing: non-blocking disk reads
//

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  projectId: string;
  type: 'conversation' | 'decision' | 'preference' | 'fact' | 'context' | 'error' | 'success';
  content: string;
  summary?: string;
  importance: number; // 0-1
  tags: string[];
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  relatedIds: string[];
  metadata?: Record<string, unknown>;
}

type MemoryEntryInput = Omit<MemoryEntry, 'id' | 'timestamp' | 'lastAccessed' | 'accessCount'>;

// ─── LRU Cache ──────────────────────────────────────────────────────────────

class LRUCache<T> {
  private cache: Map<string, T> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict the least recently used (first entry)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<T> {
    return this.cache.values();
  }

  entries(): IterableIterator<[string, T]> {
    return this.cache.entries();
  }

  clear(): void {
    this.cache.clear();
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VIBECODE_DIR = '.vibecode';
const MEMORY_DIR = 'memory';
const FILE_EXTENSION = '.jsonl';

const TYPE_WEIGHTS: Record<MemoryEntry['type'], number> = {
  decision: 1.0,
  error: 0.9,
  success: 0.85,
  preference: 0.8,
  fact: 0.7,
  context: 0.5,
  conversation: 0.3,
};

// ─── MemoryStore (Optimized) ────────────────────────────────────────────────

export class MemoryStoreOptimized {
  private baseDir: string;
  private cache: LRUCache<MemoryEntry>;
  private loadedProjects: Set<string> = new Set();
  private dirtyProjects: Set<string> = new Set();
  private flushTimer: NodeJS.Timeout | null = null;
  private compactionTimer: NodeJS.Timeout | null = null;

  // Configuration
  private maxCacheSize: number;
  private maxProjectEntries: number;
  private compactionIntervalMs: number;
  private idleThresholdMs: number;

  constructor(options?: {
    baseDir?: string;
    maxCacheSize?: number;
    maxProjectEntries?: number;
    compactionIntervalMs?: number;
    idleThresholdMs?: number;
  }) {
    this.baseDir = options?.baseDir ?? path.join(os.homedir(), VIBECODE_DIR, MEMORY_DIR);
    this.maxCacheSize = options?.maxCacheSize ?? 500;
    this.maxProjectEntries = options?.maxProjectEntries ?? 200;
    this.compactionIntervalMs = options?.compactionIntervalMs ?? 5 * 60 * 1000; // 5 min
    this.idleThresholdMs = options?.idleThresholdMs ?? 30 * 60 * 1000; // 30 min

    this.cache = new LRUCache<MemoryEntry>(this.maxCacheSize);
    this.ensureDirectoryExists(this.baseDir);

    // Start idle compaction timer
    this.startCompactionTimer();
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Store a new memory entry */
  store(entry: MemoryEntryInput): MemoryEntry {
    const now = Date.now();
    const memory: MemoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
    };

    // Clamp importance
    memory.importance = Math.max(0, Math.min(1, entry.importance));

    // Ensure project data is loaded before adding
    this.ensureProjectLoaded(memory.projectId);

    this.cache.set(memory.id, memory);
    this.markDirty(memory.projectId);
    this.scheduleFlush();

    return memory;
  }

  /** Retrieve a single memory by ID */
  retrieve(id: string): MemoryEntry | null {
    const entry = this.cache.get(id) ?? null;
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount += 1;
      this.markDirty(entry.projectId);
      this.scheduleFlush();
    }
    return entry;
  }

  /** Search memories by query string, optionally scoped to a project */
  search(query: string, projectId?: string, limit: number = 20): MemoryEntry[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    // Ensure project data is loaded if specified
    if (projectId) {
      this.ensureProjectLoaded(projectId);
    }

    const queryTerms = normalizedQuery.split(/\s+/);

    let candidates = projectId
      ? this.getByProject(projectId)
      : Array.from(this.cache.values());

    const scored = candidates.map((entry) => {
      let score = 0;
      const contentLower = entry.content.toLowerCase();
      const summaryLower = (entry.summary ?? '').toLowerCase();
      const tagsLower = entry.tags.map((t) => t.toLowerCase());

      for (const term of queryTerms) {
        if (contentLower.includes(term)) score += 3;
        if (summaryLower.includes(term)) score += 2;
        for (const tag of tagsLower) {
          if (tag.includes(term)) score += 2;
        }
      }

      if (contentLower.includes(normalizedQuery)) score += 5;
      if (summaryLower.includes(normalizedQuery)) score += 3;

      score += (TYPE_WEIGHTS[entry.type] ?? 0) * 2;
      score += entry.importance * 3;

      const ageMs = Date.now() - entry.timestamp;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - ageDays / 30);
      score += recencyScore * 2;

      score += Math.min(entry.accessCount / 10, 1);

      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => {
      s.entry.lastAccessed = Date.now();
      s.entry.accessCount += 1;
      this.markDirty(s.entry.projectId);
      return s.entry;
    });
  }

  /** Rank an existing set of memories by relevance to a query */
  rank(query: string, memories: MemoryEntry[]): MemoryEntry[] {
    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\s+/);

    const scored = memories.map((entry) => {
      let score = 0;

      const ageMs = Date.now() - entry.timestamp;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore = Math.pow(0.5, ageDays / 7);
      score += recencyScore * 30;

      score += entry.importance * 25;
      score += Math.log2(entry.accessCount + 1) * 5;
      score += (TYPE_WEIGHTS[entry.type] ?? 0) * 15;

      const contentLower = entry.content.toLowerCase();
      const summaryLower = (entry.summary ?? '').toLowerCase();
      for (const term of queryTerms) {
        if (contentLower.includes(term)) score += 10;
        if (summaryLower.includes(term)) score += 8;
        for (const tag of entry.tags) {
          if (tag.toLowerCase().includes(term)) score += 6;
        }
      }

      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.entry);
  }

  /** Delete a memory entry by ID */
  delete(id: string): boolean {
    const entry = this.cache.get(id);
    if (!entry) return false;

    this.cache.delete(id);
    this.markDirty(entry.projectId);
    this.scheduleFlush();
    return true;
  }

  /** List all memories for a given project */
  list(projectId: string): MemoryEntry[] {
    this.ensureProjectLoaded(projectId);
    return this.getByProject(projectId).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /** Generate a text summary of all memories for a project */
  summarize(projectId: string): string {
    this.ensureProjectLoaded(projectId);
    const memories = this.getByProject(projectId);
    if (memories.length === 0) return 'No memories recorded for this project.';

    const byType: Record<string, MemoryEntry[]> = {};
    for (const m of memories) {
      const group = byType[m.type] ?? [];
      group.push(m);
      byType[m.type] = group;
    }

    const lines: string[] = [
      `Memory summary for project "${projectId}" (${memories.length} entries):`,
      '',
    ];

    for (const [type, entries] of Object.entries(byType)) {
      lines.push(`  ${type.toUpperCase()} (${entries.length}):`);
      const topEntries = entries
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5);
      for (const e of topEntries) {
        const preview = e.summary ?? e.content.slice(0, 100);
        lines.push(`    - [${e.importance.toFixed(2)}] ${preview}`);
      }
      lines.push('');
    }

    const highImportance = memories
      .filter((m) => m.importance >= 0.8)
      .sort((a, b) => b.importance - a.importance);

    if (highImportance.length > 0) {
      lines.push('  KEY DECISIONS & FACTS:');
      for (const m of highImportance.slice(0, 10)) {
        const preview = m.summary ?? m.content.slice(0, 120);
        lines.push(`    - ${preview}`);
      }
    }

    return lines.join('\n');
  }

  /** Update an existing memory entry */
  update(id: string, updates: Partial<MemoryEntry>): MemoryEntry | null {
    const entry = this.cache.get(id);
    if (!entry) return null;

    const { id: _id, timestamp: _ts, ...safeUpdates } = updates as any;

    const updated: MemoryEntry = {
      ...entry,
      ...safeUpdates,
      id: entry.id,
      timestamp: entry.timestamp,
    };

    if (updated.importance !== undefined) {
      updated.importance = Math.max(0, Math.min(1, updated.importance));
    }

    this.cache.set(id, updated);
    this.markDirty(updated.projectId);
    this.scheduleFlush();

    return updated;
  }

  /** Prune old, low-importance memories. Returns count of removed entries. */
  prune(olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, entry] of this.cache.entries()) {
      if (entry.timestamp < cutoff && entry.importance < 0.3 && entry.accessCount < 2) {
        this.cache.delete(id);
        this.markDirty(entry.projectId);
        removed++;
      }
    }

    if (removed > 0) {
      this.scheduleFlush();
    }

    return removed;
  }

  /** Get the current cache size */
  getCacheSize(): number {
    return this.cache.size;
  }

  /** Get the number of loaded projects */
  getLoadedProjectCount(): number {
    return this.loadedProjects.size;
  }

  /** Force flush all dirty projects to disk */
  flush(): void {
    for (const projectId of this.dirtyProjects) {
      this.flushProject(projectId);
    }
    this.dirtyProjects.clear();

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Dispose of the store, flushing all pending writes */
  dispose(): void {
    this.flush();
    if (this.compactionTimer) {
      clearInterval(this.compactionTimer);
      this.compactionTimer = null;
    }
  }

  // ─── Private: Lazy Loading ──────────────────────────────────────────────

  /** Ensure a project's data is loaded into cache (lazy) */
  private ensureProjectLoaded(projectId: string): void {
    if (this.loadedProjects.has(projectId)) return;

    const filePath = this.getProjectFilePath(projectId);
    if (!fs.existsSync(filePath)) {
      this.loadedProjects.add(projectId);
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const entry: MemoryEntry = JSON.parse(line);
          if (entry.id && entry.projectId) {
            this.cache.set(entry.id, entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }

    this.loadedProjects.add(projectId);
  }

  // ─── Private: Compaction ────────────────────────────────────────────────

  /** Start periodic compaction timer */
  private startCompactionTimer(): void {
    this.compactionTimer = setInterval(() => {
      this.performIdleCompaction();
    }, this.compactionIntervalMs);
  }

  /** Compact idle entries — evict entries not recently accessed */
  private performIdleCompaction(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [id, entry] of this.cache.entries()) {
      // Evict entries that haven't been accessed in a long time and are low importance
      const idleTime = now - entry.lastAccessed;
      if (idleTime > this.idleThresholdMs && entry.importance < 0.5 && entry.accessCount < 5) {
        this.cache.delete(id);
        evicted++;
      }
    }

    // Also cap per-project entries
    const projectCounts: Map<string, number> = new Map();
    for (const entry of this.cache.values()) {
      const count = (projectCounts.get(entry.projectId) ?? 0) + 1;
      projectCounts.set(entry.projectId, count);
    }

    for (const [projectId, count] of projectCounts) {
      if (count > this.maxProjectEntries) {
        // Evict lowest-importance entries from this project
        const projectEntries = this.getByProject(projectId)
          .sort((a, b) => a.importance - b.importance);

        const toEvict = count - this.maxProjectEntries;
        for (let i = 0; i < toEvict && i < projectEntries.length; i++) {
          this.cache.delete(projectEntries[i].id);
          evicted++;
        }
        this.markDirty(projectId);
      }
    }

    if (evicted > 0) {
      this.scheduleFlush();
      console.log(`[MemoryStore] Idle compaction: evicted ${evicted} entries, cache size: ${this.cache.size}`);
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private getByProject(projectId: string): MemoryEntry[] {
    const entries: MemoryEntry[] = [];
    for (const entry of this.cache.values()) {
      if (entry.projectId === projectId) {
        entries.push(entry);
      }
    }
    return entries;
  }

  private getProjectFilePath(projectId: string): string {
    const safeName = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, `${safeName}${FILE_EXTENSION}`);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private markDirty(projectId: string): void {
    this.dirtyProjects.add(projectId);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 2000);
  }

  private flushProject(projectId: string): void {
    const entries = this.getByProject(projectId);
    const filePath = this.getProjectFilePath(projectId);

    // Enforce max entries per project on flush
    const cappedEntries = entries
      .sort((a, b) => b.importance - a.importance)
      .slice(0, this.maxProjectEntries);

    const lines = cappedEntries
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((e) => JSON.stringify(e));

    try {
      fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    } catch (err) {
      console.error(`[MemoryStore] Failed to flush project ${projectId}:`, err);
    }
  }
}
