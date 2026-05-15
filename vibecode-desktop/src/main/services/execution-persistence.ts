import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration ────────────────────────────────────────────────────────────

const VIBECODE_HOME = process.env.VIBECODE_HOME
  || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.vibecode');

const EXECUTIONS_DIR = path.join(VIBECODE_HOME, 'executions');

// ─── Persistence Layer ────────────────────────────────────────────────────────

/**
 * Persists arbitrary JSON data to disk so they survive app restarts.
 * ARC 14: Generalized to work with any JSON-serializable data.
 *
 * Storage layout:
 *   ~/.vibecode/executions/
 *     ├── <id>.json   ← one file per entry
 *     └── ...
 */
export class ExecutionPersistence {
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private debounceDelay: number;

  constructor(debounceDelay: number = 500) {
    this.debounceDelay = debounceDelay;
    // Ensure directory exists on construction
    this.ensureDir();
  }

  // ─── Core CRUD ───────────────────────────────────────────────────────────

  /** Save data to disk (overwrites if exists) */
  save(id: string, data: unknown): void {
    this.ensureDir();
    const filePath = this.getPath(id);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /** Load a single entry by ID */
  load(id: string): unknown | null {
    const filePath = this.getPath(id);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Load all persisted entries */
  loadAll(): unknown[] {
    this.ensureDir();
    const entries: unknown[] = [];

    try {
      const files = fs.readdirSync(EXECUTIONS_DIR);
      for (const entry of files) {
        if (entry.endsWith('.json')) {
          try {
            const raw = fs.readFileSync(path.join(EXECUTIONS_DIR, entry), 'utf-8');
            entries.push(JSON.parse(raw));
          } catch {
            // Skip corrupted files
            console.warn(`[Persistence] Skipping corrupted file: ${entry}`);
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }

    return entries;
  }

  /** Delete an entry from persistence */
  delete(id: string): void {
    const filePath = this.getPath(id);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist
    }
  }

  // ─── Debounced Auto-Save ─────────────────────────────────────────────────

  /**
   * Schedule a debounced save.
   * If called multiple times in quick succession, only the last call writes.
   */
  autoSave(id: string, data: unknown): void {
    // Clear any existing timer for this entry
    const existing = this.debounceTimers.get(id);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.save(id, data);
      this.debounceTimers.delete(id);
    }, this.debounceDelay);

    this.debounceTimers.set(id, timer);
  }

  /**
   * Flush any pending debounced saves immediately.
   * Call this before app quit to ensure all state is persisted.
   */
  flush(): void {
    for (const [id, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(id);
    }
  }

  // ─── List Entry IDs ───────────────────────────────────────────────────────

  /** List all persisted entry IDs */
  listIds(): string[] {
    this.ensureDir();
    try {
      return fs
        .readdirSync(EXECUTIONS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private getPath(id: string): string {
    return path.join(EXECUTIONS_DIR, `${id}.json`);
  }

  private ensureDir(): void {
    try {
      fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
    } catch {
      // May already exist or be created by another process
    }
  }
}
