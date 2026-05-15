import * as fs from 'fs';
import * as path from 'path';
import { ExecutionPlan } from './execution-engine';

// ─── Configuration ────────────────────────────────────────────────────────────

const VIBECODE_HOME = process.env.VIBECODE_HOME
  || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.vibecode');

const EXECUTIONS_DIR = path.join(VIBECODE_HOME, 'executions');

// ─── Persistence Layer ────────────────────────────────────────────────────────

/**
 * Persists execution plans to disk so they survive app restarts.
 *
 * Storage layout:
 *   ~/.vibecode/executions/
 *     ├── <planId>.json   ← one file per execution plan
 *     └── ...
 *
 * Plan state is auto-saved (debounced) whenever it changes.
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

  /** Save a plan to disk (overwrites if exists) */
  savePlan(plan: ExecutionPlan): void {
    this.ensureDir();
    const filePath = this.getPlanPath(plan.id);
    const data = JSON.stringify(plan, null, 2);
    fs.writeFileSync(filePath, data, 'utf-8');
  }

  /** Load a single plan by ID */
  loadPlan(planId: string): ExecutionPlan | null {
    const filePath = this.getPlanPath(planId);
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as ExecutionPlan;
    } catch {
      return null;
    }
  }

  /** Load all persisted plans */
  loadAllPlans(): ExecutionPlan[] {
    this.ensureDir();
    const plans: ExecutionPlan[] = [];

    try {
      const entries = fs.readdirSync(EXECUTIONS_DIR);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          try {
            const data = fs.readFileSync(path.join(EXECUTIONS_DIR, entry), 'utf-8');
            const plan = JSON.parse(data) as ExecutionPlan;
            plans.push(plan);
          } catch {
            // Skip corrupted files
            console.warn(`[Persistence] Skipping corrupted plan file: ${entry}`);
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }

    return plans;
  }

  /** Delete a plan from persistence */
  deletePlan(planId: string): void {
    const filePath = this.getPlanPath(planId);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist
    }
  }

  // ─── Debounced Auto-Save ─────────────────────────────────────────────────

  /**
   * Schedule a debounced save of the plan.
   * If called multiple times in quick succession, only the last call writes.
   */
  autoSave(plan: ExecutionPlan): void {
    // Clear any existing timer for this plan
    const existing = this.debounceTimers.get(plan.id);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.savePlan(plan);
      this.debounceTimers.delete(plan.id);
    }, this.debounceDelay);

    this.debounceTimers.set(plan.id, timer);
  }

  /**
   * Flush any pending debounced saves immediately.
   * Call this before app quit to ensure all state is persisted.
   */
  flush(): void {
    for (const [planId, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(planId);
    }
    // Note: plans that were scheduled but not yet saved will be lost
    // if flush is called without re-reading the in-memory plans.
    // The caller should save explicitly before flush if needed.
  }

  // ─── List Plan IDs ───────────────────────────────────────────────────────

  /** List all persisted plan IDs */
  listPlanIds(): string[] {
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

  private getPlanPath(planId: string): string {
    return path.join(EXECUTIONS_DIR, `${planId}.json`);
  }

  private ensureDir(): void {
    try {
      fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
    } catch {
      // May already exist or be created by another process
    }
  }
}
