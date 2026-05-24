import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsReaddirInternalSync,
  kernelFsStatSync,
  kernelFsWriteInternalSync,
  kernelFsAppendInternalSync,
  kernelFsMkdirInternalSync,
} from '../kernel/kernel-fs';
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

/** Configuration options for the MemoryStore */
export interface MemoryStoreOptions {
  baseDir?: string;
  maxCachedProjects?: number;   // Max projects to keep in cache (default: 10)
  maxEntriesPerProject?: number; // Max entries per project in cache (default: 500)
  maxTotalEntries?: number;     // Max total entries across all projects (default: 5000)
  maxAgeDays?: number;          // Auto-prune entries older than this with importance < 0.5 (default: 90)
}

/** Index entry for a project — lightweight metadata only */
interface ProjectIndexEntry {
  offset: number;          // Byte offset in the JSONL file (always 0 for JSONL; reserved for future use)
  count: number;           // Number of entries in the project file
  lastModified: number;    // File mtime ms
  fileSize: number;        // File size in bytes
}

/** Cached project data with LRU tracking */
interface ProjectCache {
  entries: Map<string, MemoryEntry>;  // id -> entry
  lastAccessed: number;               // Timestamp of last access
  dirty: boolean;                     // Needs flush to disk
  invertedIndex: Map<string, Set<string>>; // term -> Set<entryId>
  deletedIds: Set<string>;            // IDs deleted since last compact (tombstones)
  appendedCount: number;              // Number of entries appended since last full write
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VIBECODE_DIR = '.vibecode';
const MEMORY_DIR = 'memory';
const FILE_EXTENSION = '.jsonl';

// Type relevance weights for ranking
const TYPE_WEIGHTS: Record<MemoryEntry['type'], number> = {
  decision: 1.0,
  error: 0.9,
  success: 0.85,
  preference: 0.8,
  fact: 0.7,
  context: 0.5,
  conversation: 0.3,
};

// Defaults
const DEFAULT_MAX_CACHED_PROJECTS = 10;
const DEFAULT_MAX_ENTRIES_PER_PROJECT = 500;
const DEFAULT_MAX_TOTAL_ENTRIES = 5000;
const DEFAULT_MAX_AGE_DAYS = 90;

// Flush / compaction thresholds
const FLUSH_DELAY_MS = 2000;
const DIRTY_RATIO_COMPACT_THRESHOLD = 0.3; // Compact when >30% of entries are tombstoned
const APPEND_FLUSH_THRESHOLD = 50; // Force a compact/rewrite after this many appends
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const IDLE_PROJECT_UNLOAD_MS = 30 * 60 * 1000; // 30 minutes

// Inverted index: common stop words to skip
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'was', 'are',
  'be', 'has', 'had', 'have', 'not', 'they', 'we', 'you', 'he', 'she',
]);

// ─── MemoryStore ────────────────────────────────────────────────────────────

export class MemoryStore {
  private baseDir: string;
  private options: Required<MemoryStoreOptions>;

  // Index: lightweight project metadata, loaded on startup
  private index: Map<string, ProjectIndexEntry> = new Map();

  // Cache: per-project entry caches, loaded lazily
  private projectCaches: Map<string, ProjectCache> = new Map();

  // Dirty projects tracking (subset of projectCaches that need flush)
  private dirtyProjects: Set<string> = new Set();

  // Timers
  private flushTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  // Total entries count across all known projects (from index)
  private totalEntryCount: number = 0;

  constructor(options?: MemoryStoreOptions) {
    this.options = {
      baseDir: options?.baseDir ?? path.join(os.homedir(), VIBECODE_DIR, MEMORY_DIR),
      maxCachedProjects: options?.maxCachedProjects ?? DEFAULT_MAX_CACHED_PROJECTS,
      maxEntriesPerProject: options?.maxEntriesPerProject ?? DEFAULT_MAX_ENTRIES_PER_PROJECT,
      maxTotalEntries: options?.maxTotalEntries ?? DEFAULT_MAX_TOTAL_ENTRIES,
      maxAgeDays: options?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
    };
    this.baseDir = this.options.baseDir;

    this.ensureDirectoryExists(this.baseDir);
    this.buildIndex();
    this.startIdleTimer();
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

    // Ensure project is loaded into cache
    this.ensureProjectLoaded(memory.projectId);

    // Add to cache
    const cache = this.projectCaches.get(memory.projectId)!;
    cache.entries.set(memory.id, memory);
    cache.lastAccessed = now;

    // Update inverted index
    this.addToInvertedIndex(cache, memory);

    // Append write: write the single entry to the end of the file
    this.appendEntryToDisk(memory);
    cache.appendedCount++;

    // Mark dirty for tracking (flush will do a full rewrite only if needed)
    this.markDirty(memory.projectId);

    // Update index count
    this.totalEntryCount++;
    const idx = this.index.get(memory.projectId);
    if (idx) {
      idx.count++;
      idx.lastModified = now;
    } else {
      this.index.set(memory.projectId, { offset: 0, count: 1, lastModified: now, fileSize: 0 });
    }

    // Enforce bounds
    this.enforceProjectEntryLimit(memory.projectId);
    this.enforceTotalEntryLimit();

    this.scheduleFlush();

    return memory;
  }

  /** Retrieve a single memory by ID */
  retrieve(id: string): MemoryEntry | null {
    // Find which project this entry belongs to
    for (const [_projectId, cache] of this.projectCaches) {
      const entry = cache.entries.get(id);
      if (entry) {
        entry.lastAccessed = Date.now();
        entry.accessCount += 1;
        cache.lastAccessed = Date.now();
        // Don't mark dirty on read — access metadata changes don't need immediate flush
        // They'll be flushed when the project is evicted or on explicit flush
        return entry;
      }
    }

    // Entry not in any cached project — try loading from index lookup
    // We need to scan projects that might contain this entry
    for (const [projectId] of this.index) {
      if (this.projectCaches.has(projectId)) continue; // Already checked
      this.ensureProjectLoaded(projectId);
      const cache = this.projectCaches.get(projectId)!;
      const entry = cache.entries.get(id);
      if (entry) {
        entry.lastAccessed = Date.now();
        entry.accessCount += 1;
        cache.lastAccessed = Date.now();
        return entry;
      }
    }

    return null;
  }

  /** Search memories by query string, optionally scoped to a project */
  search(query: string, projectId?: string, limit: number = 20): MemoryEntry[] {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return [];

    const queryTerms = normalizedQuery.split(/\s+/).filter(t => !STOP_WORDS.has(t));

    let candidates: MemoryEntry[];

    if (projectId) {
      this.ensureProjectLoaded(projectId);
      const cache = this.projectCaches.get(projectId);
      if (!cache) return [];
      candidates = this.getCandidatesFromIndex(cache, queryTerms);
    } else {
      // Load all known projects lazily
      candidates = [];
      for (const [pid] of this.index) {
        this.ensureProjectLoaded(pid);
        const cache = this.projectCaches.get(pid);
        if (cache) {
          const projectCandidates = this.getCandidatesFromIndex(cache, queryTerms);
          candidates.push(...projectCandidates);
        }
      }
    }

    const now = Date.now();

    const scored = candidates.map((entry) => {
      let score = 0;
      const contentLower = entry.content.toLowerCase();
      const summaryLower = (entry.summary ?? '').toLowerCase();
      const tagsLower = entry.tags.map((t) => t.toLowerCase());

      // Term matching in content
      for (const term of queryTerms) {
        if (contentLower.includes(term)) score += 3;
        if (summaryLower.includes(term)) score += 2;
        for (const tag of tagsLower) {
          if (tag.includes(term)) score += 2;
        }
      }

      // Exact phrase bonus
      if (contentLower.includes(normalizedQuery)) score += 5;
      if (summaryLower.includes(normalizedQuery)) score += 3;

      // Type relevance
      score += (TYPE_WEIGHTS[entry.type] ?? 0) * 2;

      // Importance
      score += entry.importance * 3;

      // Recency (decays over 30 days)
      const ageMs = now - entry.timestamp;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - ageDays / 30);
      score += recencyScore * 2;

      // Access count
      score += Math.min(entry.accessCount / 10, 1);

      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Batch update access metadata — single update per search, not per result
    const results = scored.slice(0, limit);
    const accessedProjectIds = new Set<string>();
    for (const s of results) {
      s.entry.lastAccessed = now;
      s.entry.accessCount += 1;
      accessedProjectIds.add(s.entry.projectId);
    }

    // Mark projects as having been accessed (for LRU tracking)
    for (const pid of accessedProjectIds) {
      const cache = this.projectCaches.get(pid);
      if (cache) {
        cache.lastAccessed = now;
      }
    }

    // Note: Do NOT mark dirty during search — only on actual mutations

    return results.map((s) => s.entry);
  }

  /** Rank an existing set of memories by relevance to a query */
  rank(query: string, memories: MemoryEntry[]): MemoryEntry[] {
    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\s+/);

    const scored = memories.map((entry) => {
      let score = 0;

      // Recency: exponential decay with half-life of 7 days
      const ageMs = Date.now() - entry.timestamp;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore = Math.pow(0.5, ageDays / 7);
      score += recencyScore * 30;

      // Importance weight
      score += entry.importance * 25;

      // Access count (logarithmic)
      score += Math.log2(entry.accessCount + 1) * 5;

      // Type relevance
      score += (TYPE_WEIGHTS[entry.type] ?? 0) * 15;

      // Query term matching
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
    for (const [projectId, cache] of this.projectCaches) {
      const entry = cache.entries.get(id);
      if (entry) {
        cache.entries.delete(id);
        cache.deletedIds.add(id);
        this.removeFromInvertedIndex(cache, entry);

        this.markDirty(projectId);
        this.scheduleFlush();

        // Update counts
        this.totalEntryCount--;
        const idx = this.index.get(projectId);
        if (idx) idx.count--;

        return true;
      }
    }

    return false;
  }

  /** List all memories for a given project */
  list(projectId: string): MemoryEntry[] {
    this.ensureProjectLoaded(projectId);
    const cache = this.projectCaches.get(projectId);
    if (!cache) return [];

    return Array.from(cache.entries.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /** Generate a text summary of all memories for a project */
  summarize(projectId: string): string {
    this.ensureProjectLoaded(projectId);
    const cache = this.projectCaches.get(projectId);
    if (!cache) return 'No memories recorded for this project.';

    const memories = Array.from(cache.entries.values());
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
    for (const [projectId, cache] of this.projectCaches) {
      const entry = cache.entries.get(id);
      if (entry) {
        // Remove old inverted index entries
        this.removeFromInvertedIndex(cache, entry);

        // Prevent overwriting system-managed fields
        const { id: _id, timestamp: _ts, ...safeUpdates } = updates as any;

        const updated: MemoryEntry = {
          ...entry,
          ...safeUpdates,
          id: entry.id,           // preserve
          timestamp: entry.timestamp, // preserve original creation time
        };

        // Clamp importance
        if (updated.importance !== undefined) {
          updated.importance = Math.max(0, Math.min(1, updated.importance));
        }

        cache.entries.set(id, updated);
        cache.lastAccessed = Date.now();

        // Re-add to inverted index with updated content
        this.addToInvertedIndex(cache, updated);

        this.markDirty(projectId);
        this.scheduleFlush();

        return updated;
      }
    }
    return null;
  }

  /** Prune old, low-importance memories. Returns count of removed entries. */
  prune(olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    // Prune across all known projects
    for (const [projectId] of this.index) {
      this.ensureProjectLoaded(projectId);
      const cache = this.projectCaches.get(projectId);
      if (!cache) continue;

      for (const [id, entry] of cache.entries) {
        if (entry.timestamp < cutoff && entry.importance < 0.3 && entry.accessCount < 2) {
          cache.entries.delete(id);
          cache.deletedIds.add(id);
          this.removeFromInvertedIndex(cache, entry);
          this.markDirty(projectId);
          removed++;
        }
      }
    }

    if (removed > 0) {
      this.totalEntryCount -= removed;
      this.scheduleFlush();
    }

    return removed;
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

  /** Dispose of the store, flushing all pending writes and stopping timers */
  dispose(): void {
    this.flush();
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // ─── New Public API ──────────────────────────────────────────────────────

  /** Get statistics about the memory store */
  getStats(): { totalEntries: number; cachedProjects: number; cacheSizeBytes: number; indexSize: number } {
    let cacheSizeBytes = 0;
    for (const [, cache] of this.projectCaches) {
      for (const [, entry] of cache.entries) {
        // Rough estimate: JSON string length in bytes
        cacheSizeBytes += JSON.stringify(entry).length * 2; // *2 for UTF-16 overhead estimate
      }
    }

    return {
      totalEntries: this.totalEntryCount,
      cachedProjects: this.projectCaches.size,
      cacheSizeBytes,
      indexSize: this.index.size,
    };
  }

  /** Get cache statistics for telemetry integration */
  getCacheStats(): { totalEntries: number; cachedProjects: number; estimatedBytes: number; dirtyCount: number } {
    let estimatedBytes = 0;
    for (const [, cache] of this.projectCaches) {
      for (const [, entry] of cache.entries) {
        estimatedBytes += JSON.stringify(entry).length * 2;
      }
    }

    return {
      totalEntries: this.totalEntryCount,
      cachedProjects: this.projectCaches.size,
      estimatedBytes,
      dirtyCount: this.dirtyProjects.size,
    };
  }

  /** Force compaction of a specific project file — rewrites removing tombstoned entries */
  compact(projectId: string): void {
    this.ensureProjectLoaded(projectId);
    const cache = this.projectCaches.get(projectId);
    if (!cache) return;

    this.rewriteProjectFile(projectId);
    cache.deletedIds.clear();
    cache.appendedCount = 0;
    cache.dirty = false;
    this.dirtyProjects.delete(projectId);
  }

  /** Compact all project files */
  compactAll(): void {
    for (const [projectId] of this.index) {
      this.compact(projectId);
    }
  }

  /** Immediately rewrite all project files (force compact for memory reclamation) */
  forceCompact(): void {
    // First, flush any pending dirty projects
    this.flush();

    // Then, load and compact all known projects
    for (const [projectId] of this.index) {
      this.ensureProjectLoaded(projectId);
      const cache = this.projectCaches.get(projectId);
      if (!cache) continue;

      this.rewriteProjectFile(projectId);
      cache.deletedIds.clear();
      cache.appendedCount = 0;
      cache.dirty = false;
      this.dirtyProjects.delete(projectId);
    }
  }

  /** Evict a project from the in-memory cache, flushing if dirty */
  unloadProject(projectId: string): void {
    const cache = this.projectCaches.get(projectId);
    if (!cache) return;

    // Flush if dirty before evicting
    if (cache.dirty || this.dirtyProjects.has(projectId)) {
      this.flushProject(projectId);
      this.dirtyProjects.delete(projectId);
    }

    this.projectCaches.delete(projectId);
  }

  // ─── Private: Index & Lazy Loading ──────────────────────────────────────

  /** Build the lightweight index by scanning file metadata (not full content) */
  private buildIndex(): void {
    if (!kernelFsExistsInternal(this.baseDir)) return;

    const files = kernelFsReaddirInternalSync(this.baseDir).filter((f) => f.endsWith(FILE_EXTENSION));

    for (const file of files) {
      const filePath = path.join(this.baseDir, file);
      try {
        const stat = kernelFsStatSync(filePath);

        // Efficiently count lines and extract projectId from first line only
        // without parsing every entry into memory
        let lineCount = 0;
        let projectId: string | undefined;

        const content = kernelFsReadSync(filePath);
        let firstLine: string | null = null;

        // Count non-empty lines and capture the first one
        let start = 0;
        for (let i = 0; i <= content.length; i++) {
          if (i === content.length || content[i] === '\n') {
            const line = content.substring(start, i).trim();
            if (line) {
              lineCount++;
              if (firstLine === null) {
                firstLine = line;
              }
            }
            start = i + 1;
          }
        }

        // Extract projectId from first entry only
        if (firstLine) {
          try {
            const firstEntry = JSON.parse(firstLine);
            projectId = firstEntry.projectId;
          } catch {
            // Fall back to filename
          }
        }

        if (!projectId) {
          // Derive from filename: strip extension, un-sanitize
          projectId = path.basename(file, FILE_EXTENSION);
        }

        const indexEntry: ProjectIndexEntry = {
          offset: 0,
          count: lineCount,
          lastModified: stat.mtimeMs,
          fileSize: stat.size,
        };

        this.index.set(projectId, indexEntry);
        this.totalEntryCount += lineCount;

        // Free the string immediately — we don't keep entry data
      } catch {
        // Skip unreadable files
      }
    }
  }

  /** Ensure a project's entries are loaded into the cache (lazy load) */
  private ensureProjectLoaded(projectId: string): void {
    if (this.projectCaches.has(projectId)) {
      // Update LRU timestamp
      const cache = this.projectCaches.get(projectId)!;
      cache.lastAccessed = Date.now();
      return;
    }

    // Evict LRU project if we're at capacity
    this.evictLRUIfNeeded();

    // Load project entries from disk
    const filePath = this.getProjectFilePath(projectId);
    const entries = new Map<string, MemoryEntry>();
    const invertedIndex = new Map<string, Set<string>>();
    const deletedIds = new Set<string>();

    if (kernelFsExistsInternal(filePath)) {
      try {
        const content = kernelFsReadSync(filePath);
        const lines = content.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const entry: MemoryEntry = JSON.parse(line);
            if (entry.id && entry.projectId) {
              entries.set(entry.id, entry);
              this.buildInvertedIndexEntry(invertedIndex, entry);
            }
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Update index if not present
    if (!this.index.has(projectId)) {
      this.index.set(projectId, {
        offset: 0,
        count: entries.size,
        lastModified: Date.now(),
        fileSize: 0,
      });
      this.totalEntryCount += entries.size;
    }

    const cache: ProjectCache = {
      entries,
      lastAccessed: Date.now(),
      dirty: false,
      invertedIndex,
      deletedIds,
      appendedCount: 0,
    };

    this.projectCaches.set(projectId, cache);
  }

  // ─── Private: LRU Cache ─────────────────────────────────────────────────

  /** Evict the least recently used project if we exceed maxCachedProjects */
  private evictLRUIfNeeded(): void {
    while (this.projectCaches.size >= this.options.maxCachedProjects) {
      let lruProjectId: string | null = null;
      let lruTime = Infinity;

      for (const [projectId, cache] of this.projectCaches) {
        if (cache.lastAccessed < lruTime) {
          lruTime = cache.lastAccessed;
          lruProjectId = projectId;
        }
      }

      if (lruProjectId !== null) {
        this.unloadProject(lruProjectId);
      } else {
        break;
      }
    }
  }

  /** Enforce per-project entry limit — keep most important/recent entries */
  private enforceProjectEntryLimit(projectId: string): void {
    const cache = this.projectCaches.get(projectId);
    if (!cache) return;

    if (cache.entries.size <= this.options.maxEntriesPerProject) return;

    // Sort entries by a combined importance+recency score, keep top N
    const entries = Array.from(cache.entries.values());
    const now = Date.now();

    entries.sort((a, b) => {
      // Score: importance * 0.5 + recency * 0.3 + accessCount * 0.2
      const scoreA = a.importance * 0.5 +
        Math.max(0, 1 - (now - a.timestamp) / (30 * 24 * 60 * 60 * 1000)) * 0.3 +
        Math.min(a.accessCount / 10, 1) * 0.2;
      const scoreB = b.importance * 0.5 +
        Math.max(0, 1 - (now - b.timestamp) / (30 * 24 * 60 * 60 * 1000)) * 0.3 +
        Math.min(b.accessCount / 10, 1) * 0.2;
      return scoreB - scoreA;
    });

    const toKeep = new Set(entries.slice(0, this.options.maxEntriesPerProject).map(e => e.id));
    for (const [id, entry] of cache.entries) {
      if (!toKeep.has(id)) {
        cache.entries.delete(id);
        cache.deletedIds.add(id);
        this.removeFromInvertedIndex(cache, entry);
      }
    }

    this.markDirty(projectId);
  }

  /** Enforce total entry limit — prune lowest importance, oldest entries globally */
  private enforceTotalEntryLimit(): void {
    if (this.totalEntryCount <= this.options.maxTotalEntries) return;

    const excess = this.totalEntryCount - this.options.maxTotalEntries;
    // Collect all entries across cached projects, sort by pruning score
    const allEntries: MemoryEntry[] = [];
    for (const [, cache] of this.projectCaches) {
      allEntries.push(...Array.from(cache.entries.values()));
    }

    // Sort ascending by pruning score (lowest importance + oldest = prune first)
    allEntries.sort((a, b) => {
      const scoreA = a.importance * 0.6 + Math.min(a.accessCount / 10, 1) * 0.2 +
        Math.max(0, 1 - (Date.now() - a.timestamp) / (90 * 24 * 60 * 60 * 1000)) * 0.2;
      const scoreB = b.importance * 0.6 + Math.min(b.accessCount / 10, 1) * 0.2 +
        Math.max(0, 1 - (Date.now() - b.timestamp) / (90 * 24 * 60 * 60 * 1000)) * 0.2;
      return scoreA - scoreB;
    });

    const toPrune = allEntries.slice(0, excess);
    for (const entry of toPrune) {
      const cache = this.projectCaches.get(entry.projectId);
      if (cache && cache.entries.has(entry.id)) {
        cache.entries.delete(entry.id);
        cache.deletedIds.add(entry.id);
        this.removeFromInvertedIndex(cache, entry);
        this.markDirty(entry.projectId);
      }
    }

    this.totalEntryCount -= toPrune.length;
    if (toPrune.length > 0) {
      this.scheduleFlush();
    }
  }

  // ─── Private: Bounded Retention / Age-Based Pruning ─────────────────────

  /** Auto-prune entries older than maxAgeDays with importance < 0.5 */
  private autoPruneByAge(): void {
    const cutoff = Date.now() - this.options.maxAgeDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [projectId, cache] of this.projectCaches) {
      for (const [id, entry] of cache.entries) {
        if (entry.timestamp < cutoff && entry.importance < 0.5 && entry.accessCount < 3) {
          cache.entries.delete(id);
          cache.deletedIds.add(id);
          this.removeFromInvertedIndex(cache, entry);
          this.markDirty(projectId);
          removed++;
        }
      }
    }

    if (removed > 0) {
      this.totalEntryCount -= removed;
      this.scheduleFlush();
    }
  }

  // ─── Private: Inverted Index ────────────────────────────────────────────

  /** Build inverted index for a single entry */
  private buildInvertedIndexEntry(index: Map<string, Set<string>>, entry: MemoryEntry): void {
    const terms = this.extractTerms(entry);
    for (const term of terms) {
      const set = index.get(term);
      if (set) {
        set.add(entry.id);
      } else {
        index.set(term, new Set([entry.id]));
      }
    }
  }

  /** Add a single entry to a project's inverted index */
  private addToInvertedIndex(cache: ProjectCache, entry: MemoryEntry): void {
    this.buildInvertedIndexEntry(cache.invertedIndex, entry);
  }

  /** Remove a single entry from a project's inverted index */
  private removeFromInvertedIndex(cache: ProjectCache, entry: MemoryEntry): void {
    const terms = this.extractTerms(entry);
    for (const term of terms) {
      const set = cache.invertedIndex.get(term);
      if (set) {
        set.delete(entry.id);
        if (set.size === 0) {
          cache.invertedIndex.delete(term);
        }
      }
    }
  }

  /** Extract indexable terms from an entry */
  private extractTerms(entry: MemoryEntry): string[] {
    const terms: string[] = [];
    const tokenize = (text: string) => {
      return text
        .toLowerCase()
        .split(/[^a-zA-Z0-9]+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));
    };

    terms.push(...tokenize(entry.content));
    if (entry.summary) {
      terms.push(...tokenize(entry.summary));
    }
    for (const tag of entry.tags) {
      const tagLower = tag.toLowerCase();
      if (tagLower.length > 1) {
        terms.push(tagLower);
      }
    }

    // Deduplicate
    return [...new Set(terms)];
  }

  /** Get candidate entries from inverted index for query terms */
  private getCandidatesFromIndex(cache: ProjectCache, queryTerms: string[]): MemoryEntry[] {
    // If query terms match the index, use it for fast lookup
    const candidateIds = new Set<string>();

    for (const term of queryTerms) {
      // Exact match
      const exact = cache.invertedIndex.get(term);
      if (exact) {
        for (const id of exact) candidateIds.add(id);
      }

      // Prefix match for partial terms
      for (const [indexTerm, ids] of cache.invertedIndex) {
        if (indexTerm.startsWith(term) || term.startsWith(indexTerm)) {
          for (const id of ids) candidateIds.add(id);
        }
      }
    }

    // If index gave us candidates, use them; otherwise fall back to full scan
    if (candidateIds.size > 0) {
      const results: MemoryEntry[] = [];
      for (const id of candidateIds) {
        const entry = cache.entries.get(id);
        if (entry) results.push(entry);
      }
      return results;
    }

    // Fallback: full scan (should be rare with a good index)
    return Array.from(cache.entries.values());
  }

  // ─── Private: Write Optimization ────────────────────────────────────────

  /** Append a single entry to the project's JSONL file */
  private appendEntryToDisk(entry: MemoryEntry): void {
    const filePath = this.getProjectFilePath(entry.projectId);
    try {
      const line = JSON.stringify(entry) + '\n';
      kernelFsAppendInternalSync(filePath, line, 'utf-8');
    } catch (err) {
      console.error(`[MemoryStore] Failed to append entry to project ${entry.projectId}:`, err);
    }
  }

  /** Flush a project to disk — decides between append-only or full rewrite */
  private flushProject(projectId: string): void {
    const cache = this.projectCaches.get(projectId);
    if (!cache) return;

    // Determine if we need a full rewrite (compaction) or can skip
    const needsCompact = this.shouldCompact(cache);

    if (needsCompact) {
      this.rewriteProjectFile(projectId);
      cache.deletedIds.clear();
      cache.appendedCount = 0;
    }
    // If no compaction needed, new entries were already appended via appendEntryToDisk

    cache.dirty = false;
  }

  /** Check if a project cache needs compaction */
  private shouldCompact(cache: ProjectCache): boolean {
    const totalSlots = cache.entries.size + cache.deletedIds.size;
    if (totalSlots === 0) return false;

    // Compact if dirty ratio exceeds threshold
    const dirtyRatio = cache.deletedIds.size / totalSlots;
    if (dirtyRatio > DIRTY_RATIO_COMPACT_THRESHOLD) return true;

    // Compact if too many appends have accumulated (prevent unbounded file growth)
    if (cache.appendedCount > APPEND_FLUSH_THRESHOLD) return true;

    // Compact if memory pressure is high
    const mem = process.memoryUsage();
    if (mem.heapUsed / mem.heapTotal > 0.8) return true;

    return false;
  }

  /** Full rewrite of a project file — removes tombstoned entries */
  private rewriteProjectFile(projectId: string): void {
    const cache = this.projectCaches.get(projectId);
    if (!cache) return;

    const entries = Array.from(cache.entries.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    const filePath = this.getProjectFilePath(projectId);
    const lines = entries.map((e) => JSON.stringify(e));

    try {
      kernelFsWriteInternalSync(filePath, lines.join('\n') + '\n', 'utf-8');

      // Update index
      const stat = kernelFsStatSync(filePath);
      const idx = this.index.get(projectId);
      if (idx) {
        idx.count = entries.length;
        idx.lastModified = stat.mtimeMs;
        idx.fileSize = stat.size;
      }
    } catch (err) {
      console.error(`[MemoryStore] Failed to rewrite project ${projectId}:`, err);
    }
  }

  // ─── Private: Idle Pruning ──────────────────────────────────────────────

  /** Start the periodic idle check timer */
  private startIdleTimer(): void {
    this.idleTimer = setInterval(() => {
      this.performIdleMaintenance();
    }, IDLE_CHECK_INTERVAL_MS);

    // Don't prevent process exit
    if (this.idleTimer.unref) {
      this.idleTimer.unref();
    }
  }

  /** Perform idle maintenance: prune old entries, unload stale caches */
  private performIdleMaintenance(): void {
    const now = Date.now();

    // Auto-prune by age
    this.autoPruneByAge();

    // Unload project caches that haven't been accessed in 30 minutes
    const staleProjectIds: string[] = [];
    for (const [projectId, cache] of this.projectCaches) {
      if (now - cache.lastAccessed > IDLE_PROJECT_UNLOAD_MS) {
        staleProjectIds.push(projectId);
      }
    }

    for (const projectId of staleProjectIds) {
      this.unloadProject(projectId);
    }

    // Check memory pressure and be more aggressive if needed
    const mem = process.memoryUsage();
    const pressureRatio = mem.heapUsed / mem.heapTotal;

    if (pressureRatio > 0.7) {
      // High memory pressure: unload more aggressively
      const projectIds = Array.from(this.projectCaches.keys());
      // Unload half the cached projects (least recently accessed first)
      projectIds.sort((a, b) => {
        const ca = this.projectCaches.get(a)!;
        const cb = this.projectCaches.get(b)!;
        return ca.lastAccessed - cb.lastAccessed;
      });

      const toUnload = Math.ceil(projectIds.length / 2);
      for (let i = 0; i < toUnload && i < projectIds.length; i++) {
        this.unloadProject(projectIds[i]);
      }
    }

    // Enforce total entry limit
    this.enforceTotalEntryLimit();
  }

  // ─── Private: Flush Scheduling ──────────────────────────────────────────

  private markDirty(projectId: string): void {
    const cache = this.projectCaches.get(projectId);
    if (cache) cache.dirty = true;
    this.dirtyProjects.add(projectId);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, FLUSH_DELAY_MS);

    // Don't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  // ─── Private: File Helpers ──────────────────────────────────────────────

  private getProjectFilePath(projectId: string): string {
    // Sanitize projectId for use as a filename
    const safeName = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, `${safeName}${FILE_EXTENSION}`);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!kernelFsExistsInternal(dirPath)) {
      kernelFsMkdirInternalSync(dirPath);
    }
  }
}
