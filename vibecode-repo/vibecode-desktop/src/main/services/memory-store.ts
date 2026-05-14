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

// ─── MemoryStore ────────────────────────────────────────────────────────────

export class MemoryStore {
  private baseDir: string;
  private cache: Map<string, MemoryEntry> = new Map();
  private dirtyProjects: Set<string> = new Set();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), VIBECODE_DIR, MEMORY_DIR);
    this.ensureDirectoryExists(this.baseDir);
    this.loadAllIntoCache();
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

    const queryTerms = normalizedQuery.split(/\s+/);

    let candidates = projectId
      ? this.getByProject(projectId)
      : Array.from(this.cache.values());

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
      const ageMs = Date.now() - entry.timestamp;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - ageDays / 30);
      score += recencyScore * 2;

      // Access count
      score += Math.min(entry.accessCount / 10, 1);

      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => {
      // Update access metadata
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
    const entry = this.cache.get(id);
    if (!entry) return false;

    this.cache.delete(id);
    this.markDirty(entry.projectId);
    this.scheduleFlush();
    return true;
  }

  /** List all memories for a given project */
  list(projectId: string): MemoryEntry[] {
    return this.getByProject(projectId).sort(
      (a, b) => b.timestamp - a.timestamp
    );
  }

  /** Generate a text summary of all memories for a project */
  summarize(projectId: string): string {
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

    this.cache.set(id, updated);
    this.markDirty(updated.projectId);
    this.scheduleFlush();

    return updated;
  }

  /** Prune old, low-importance memories. Returns count of removed entries. */
  prune(olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, entry] of this.cache) {
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
    // Sanitize projectId for use as a filename
    const safeName = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, `${safeName}${FILE_EXTENSION}`);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private loadAllIntoCache(): void {
    if (!fs.existsSync(this.baseDir)) return;

    const files = fs.readdirSync(this.baseDir).filter((f) => f.endsWith(FILE_EXTENSION));

    for (const file of files) {
      const filePath = path.join(this.baseDir, file);
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
    }
  }

  private markDirty(projectId: string): void {
    this.dirtyProjects.add(projectId);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, 2000); // Batch writes every 2 seconds
  }

  private flushProject(projectId: string): void {
    const entries = this.getByProject(projectId);
    const filePath = this.getProjectFilePath(projectId);

    const lines = entries
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((e) => JSON.stringify(e));

    try {
      fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    } catch (err) {
      console.error(`[MemoryStore] Failed to flush project ${projectId}:`, err);
    }
  }
}
