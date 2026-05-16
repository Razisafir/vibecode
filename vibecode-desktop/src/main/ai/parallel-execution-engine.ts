// ============================================================
// VibeCode Desktop — ARC 22: Parallel Execution Engine
// Concurrent plan execution, dependency-aware scheduling,
// workspace locking, mutation batching, rollback-safe concurrency
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  ParallelExecutionGroup,
  ParallelTask,
  LockingStrategy,
  ResourceLock,
  AgentRole,
} from './types';
import { ExecutionEngine, ExecutionPlan } from '../services/execution-engine';
import { EventEmitter } from 'events';

// ─── Event Types ────────────────────────────────────────────────────────────

export type ParallelEventType = 'group:started' | 'task:started' | 'task:completed' | 'task:failed' | 'group:completed' | 'group:failed' | 'lock:acquired' | 'lock:released' | 'lock:timeout' | 'conflict:detected';

export interface ParallelEvent {
  type: ParallelEventType;
  groupId?: string;
  taskId?: string;
  timestamp: number;
  data?: unknown;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_LOCK_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONCURRENT = 3;
const BATCH_SIZE = 5;

// ─── Parallel Execution Engine ──────────────────────────────────────────────

export class ParallelExecutionEngine extends EventEmitter {
  private executionEngine: ExecutionEngine;
  private groups: Map<string, ParallelExecutionGroup> = new Map();
  private locks: Map<string, ResourceLock> = new Map();
  private activeExecutions: Map<string, AbortController> = new Map();
  private maxConcurrent: number;
  private handlers: ((event: ParallelEvent) => void)[] = [];

  constructor(executionEngine: ExecutionEngine, maxConcurrent: number = DEFAULT_MAX_CONCURRENT) {
    super();
    this.executionEngine = executionEngine;
    this.maxConcurrent = maxConcurrent;
  }

  // ─── Execution Group Management ───────────────────────────────────────

  /**
   * Create a new parallel execution group for a set of tasks.
   * Tasks are analyzed for dependencies and scheduled accordingly.
   */
  createGroup(
    tasks: Array<{ taskId: string; agentId: AgentRole; resources: string[]; dependsOn: string[] }>,
    lockingStrategy: Partial<LockingStrategy> = {},
  ): ParallelExecutionGroup {
    const fullStrategy: LockingStrategy = {
      type: lockingStrategy.type ?? 'optimistic',
      granularity: lockingStrategy.granularity ?? 'file',
      timeout: lockingStrategy.timeout ?? DEFAULT_LOCK_TIMEOUT_MS,
      conflictResolution: lockingStrategy.conflictResolution ?? 'queue',
    };

    const group: ParallelExecutionGroup = {
      id: uuidv4(),
      tasks: tasks.map(t => ({
        taskId: t.taskId,
        agentId: t.agentId,
        lockedResources: [],
        dependsOn: t.dependsOn,
        status: t.dependsOn.length === 0 ? 'ready' : 'waiting',
      })),
      status: 'pending',
      lockingStrategy: fullStrategy,
      createdAt: Date.now(),
    };

    this.groups.set(group.id, group);
    return group;
  }

  /**
   * Start executing a parallel execution group.
   */
  async executeGroup(groupId: string): Promise<ParallelExecutionGroup> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group not found: ${groupId}`);

    if (group.status === 'running') {
      throw new Error(`Group ${groupId} is already running`);
    }

    group.status = 'running';
    this.emitParallelEvent('group:started', groupId);

    try {
      // Execute in waves based on dependencies
      let wave = 0;
      while (true) {
        const readyTasks = group.tasks.filter(t => t.status === 'ready' || t.status === 'waiting');

        // Check which tasks have their dependencies met
        const executable = readyTasks.filter(t => {
          if (t.status === 'ready') return true;
          return t.dependsOn.every(depId => {
            const dep = group.tasks.find(dt => dt.taskId === depId);
            return dep && dep.status === 'completed';
          });
        });

        if (executable.length === 0) {
          // Check if all done
          const allDone = group.tasks.every(t => t.status === 'completed' || t.status === 'failed');
          if (allDone) break;

          // Check for deadlock
          const waiting = group.tasks.filter(t => t.status === 'waiting' || t.status === 'ready');
          if (waiting.length > 0 && wave > 20) {
            // Possible deadlock - fail remaining
            for (const t of waiting) {
              t.status = 'failed';
            }
            break;
          }
          // Wait a bit for dependencies
          await new Promise(resolve => setTimeout(resolve, 100));
          wave++;
          continue;
        }

        // Execute up to maxConcurrent tasks in parallel
        const batch = executable.slice(0, this.maxConcurrent);

        // Try to acquire locks for the batch
        const lockResults = await Promise.all(
          batch.map(t => this.acquireLocksForTask(groupId, t))
        );

        // Execute tasks that got their locks
        const executionPromises = batch.map((task, idx) => {
          if (lockResults[idx]) {
            task.status = 'running';
            return this.executeTask(groupId, task);
          } else {
            // Could not acquire locks - queue for next wave
            task.status = 'waiting';
            return Promise.resolve();
          }
        });

        await Promise.allSettled(executionPromises);

        // Release locks for completed/failed tasks
        for (const task of batch) {
          if (task.status === 'completed' || task.status === 'failed') {
            this.releaseLocksForTask(groupId, task);
          }
        }

        // Update dependent task statuses
        for (const task of group.tasks) {
          if (task.status === 'waiting') {
            const allDepsMet = task.dependsOn.every(depId => {
              const dep = group.tasks.find(dt => dt.taskId === depId);
              return dep && dep.status === 'completed';
            });
            if (allDepsMet) {
              task.status = 'ready';
            }
          }
        }

        wave++;
      }

      // Determine final group status
      const allCompleted = group.tasks.every(t => t.status === 'completed');
      const anyFailed = group.tasks.some(t => t.status === 'failed');

      group.status = allCompleted ? 'completed' : anyFailed ? 'partial' : 'completed';
      group.completedAt = Date.now();

      this.emitParallelEvent(
        group.status === 'completed' ? 'group:completed' : 'group:failed',
        groupId,
      );
    } catch (err) {
      group.status = 'failed';
      group.completedAt = Date.now();
      this.emitParallelEvent('group:failed', groupId, { error: err instanceof Error ? err.message : String(err) });
    }

    return group;
  }

  /**
   * Execute a batch of independent execution plans concurrently.
   */
  async executePlansConcurrently(plans: ExecutionPlan[]): Promise<Map<string, ExecutionPlan>> {
    const results = new Map<string, ExecutionPlan>();

    // Acquire locks for each plan's affected files
    const lockable = plans.filter(p => {
      const files = this.getPlanAffectedFiles(p);
      return this.tryAcquireBatchLocks(p.id, files, 'write');
    });

    // Execute concurrently
    const promises = lockable.map(plan =>
      this.executionEngine.executePlan(plan.id)
        .then(result => {
          results.set(plan.id, result);
          this.releaseBatchLocks(plan.id);
          return result;
        })
        .catch(err => {
          results.set(plan.id, { ...plan, status: 'failed' } as ExecutionPlan);
          this.releaseBatchLocks(plan.id);
          throw err;
        })
    );

    await Promise.allSettled(promises);
    return results;
  }

  // ─── Resource Locking ─────────────────────────────────────────────────

  /**
   * Try to acquire a lock on a resource.
   */
  tryAcquireLock(resource: string, holder: string, type: 'read' | 'write' | 'exclusive', timeoutMs?: number): boolean {
    const existing = this.locks.get(resource);
    if (existing) {
      // Check compatibility
      if (existing.type === 'exclusive') return false;
      if (type === 'write' || type === 'exclusive') return false;
      if (type === 'read' && existing.type === 'read') return true; // multiple readers OK
      return false;
    }

    const lock: ResourceLock = {
      resource,
      heldBy: holder,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + (timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS),
      type,
    };

    this.locks.set(resource, lock);
    this.emitParallelEvent('lock:acquired', undefined, undefined, { resource, holder, type });
    return true;
  }

  /**
   * Release a lock on a resource.
   */
  releaseLock(resource: string, holder: string): boolean {
    const lock = this.locks.get(resource);
    if (!lock || lock.heldBy !== holder) return false;

    this.locks.delete(resource);
    this.emitParallelEvent('lock:released', undefined, undefined, { resource, holder });
    return true;
  }

  /**
   * Check if a resource is locked.
   */
  isLocked(resource: string): boolean {
    const lock = this.locks.get(resource);
    if (!lock) return false;
    // Check expiry
    if (lock.expiresAt < Date.now()) {
      this.locks.delete(resource);
      this.emitParallelEvent('lock:timeout', undefined, undefined, { resource });
      return false;
    }
    return true;
  }

  /**
   * Get all locks held by a specific holder.
   */
  getLocksByHolder(holder: string): ResourceLock[] {
    return Array.from(this.locks.values()).filter(l => l.heldBy === holder);
  }

  /**
   * Get all current locks.
   */
  getAllLocks(): ResourceLock[] {
    return Array.from(this.locks.values());
  }

  // ─── Mutation Batching ────────────────────────────────────────────────

  /**
   * Batch multiple file mutations for efficient execution.
   * Groups mutations by directory and executes them together.
   */
  async batchMutations(mutations: Array<{ filePath: string; content: string; agentId: string }>): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Group by directory for efficient writes
    const byDirectory = new Map<string, typeof mutations>();
    for (const m of mutations) {
      const dir = m.filePath.substring(0, m.filePath.lastIndexOf('/'));
      if (!byDirectory.has(dir)) byDirectory.set(dir, []);
      byDirectory.get(dir)!.push(m);
    }

    // Execute each batch
    for (const [dir, batch] of byDirectory) {
      // Acquire directory lock
      if (!this.tryAcquireLock(dir, 'batch_mutations', 'write')) {
        for (const m of batch) results.set(m.filePath, false);
        continue;
      }

      try {
        // Execute all mutations in the batch
        for (const mutation of batch) {
          try {
            // Create execution plan for the mutation
            const plan = this.executionEngine.createPlan(
              `Batch mutation: ${mutation.filePath}`,
              `Mutation by ${mutation.agentId}`,
              [{
                title: `Write ${mutation.filePath}`,
                description: `Batch write by ${mutation.agentId}`,
                type: 'file_write',
                params: { filePath: mutation.filePath, content: mutation.content },
                riskLevel: 'low' as const,
              }],
            );
            this.executionEngine.approvePlan(plan.id);
            const result = await this.executionEngine.executePlan(plan.id);
            results.set(mutation.filePath, result.status === 'completed');
          } catch {
            results.set(mutation.filePath, false);
          }
        }
      } finally {
        this.releaseLock(dir, 'batch_mutations');
      }
    }

    return results;
  }

  // ─── Query Methods ────────────────────────────────────────────────────

  getGroup(groupId: string): ParallelExecutionGroup | null {
    return this.groups.get(groupId) ?? null;
  }

  getActiveGroups(): ParallelExecutionGroup[] {
    return Array.from(this.groups.values()).filter(g => g.status === 'running');
  }

  // ─── Event Handlers ───────────────────────────────────────────────────

  onParallelEvent(handler: (event: ParallelEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  // ─── Statistics ────────────────────────────────────────────────────────

  getStats(): {
    totalGroups: number;
    activeGroups: number;
    completedGroups: number;
    activeLocks: number;
    avgGroupDuration: number;
  } {
    const all = Array.from(this.groups.values());
    const completed = all.filter(g => g.status === 'completed');

    return {
      totalGroups: all.length,
      activeGroups: all.filter(g => g.status === 'running').length,
      completedGroups: completed.length,
      activeLocks: this.locks.size,
      avgGroupDuration: completed.length > 0
        ? completed.reduce((sum, g) => sum + ((g.completedAt ?? Date.now()) - g.createdAt), 0) / completed.length
        : 0,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async acquireLocksForTask(groupId: string, task: ParallelTask): Promise<boolean> {
    // Determine which resources this task needs based on its plan
    const plan = this.executionEngine.getPlan(task.taskId);
    if (!plan) return false;

    const files = this.getPlanAffectedFiles(plan);
    task.lockedResources = files;

    for (const file of files) {
      if (!this.tryAcquireLock(file, `${groupId}:${task.taskId}`, 'write')) {
        // Release any already-acquired locks
        for (const f of task.lockedResources) {
          this.releaseLock(f, `${groupId}:${task.taskId}`);
        }
        task.lockedResources = [];
        return false;
      }
    }

    return true;
  }

  private releaseLocksForTask(groupId: string, task: ParallelTask): void {
    const holder = `${groupId}:${task.taskId}`;
    for (const resource of task.lockedResources) {
      this.releaseLock(resource, holder);
    }
    task.lockedResources = [];
  }

  private async executeTask(groupId: string, task: ParallelTask): Promise<void> {
    this.emitParallelEvent('task:started', groupId, task.taskId);

    try {
      const plan = this.executionEngine.getPlan(task.taskId);
      if (!plan) throw new Error(`Plan not found for task ${task.taskId}`);

      // Ensure plan is approved
      if (plan.status === 'draft') {
        this.executionEngine.approvePlan(plan.id);
      }

      const result = await this.executionEngine.executePlan(plan.id);
      task.status = result.status === 'completed' ? 'completed' : 'failed';

      this.emitParallelEvent(
        task.status === 'completed' ? 'task:completed' : 'task:failed',
        groupId,
        task.taskId,
      );
    } catch (err) {
      task.status = 'failed';
      this.emitParallelEvent('task:failed', groupId, task.taskId, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private tryAcquireBatchLocks(holder: string, files: string[], type: 'read' | 'write' | 'exclusive'): boolean {
    // Try to acquire all locks
    const acquired: string[] = [];
    for (const file of files) {
      if (this.tryAcquireLock(file, holder, type)) {
        acquired.push(file);
      } else {
        // Release and fail
        for (const f of acquired) this.releaseLock(f, holder);
        return false;
      }
    }
    return true;
  }

  private releaseBatchLocks(holder: string): void {
    const locks = this.getLocksByHolder(holder);
    for (const lock of locks) {
      this.releaseLock(lock.resource, holder);
    }
  }

  private getPlanAffectedFiles(plan: ExecutionPlan): string[] {
    const files: string[] = [];
    for (const step of plan.steps) {
      const filePath = step.params.filePath as string | undefined;
      if (filePath) files.push(filePath);
    }
    return [...new Set(files)];
  }

  private emitParallelEvent(type: ParallelEventType, groupId?: string, taskId?: string, data?: unknown): void {
    const event: ParallelEvent = { type, groupId, taskId, timestamp: Date.now(), data };
    for (const handler of this.handlers) {
      try { handler(event); } catch (err) { console.error('[ParallelExecEngine] Event handler error:', err); }
    }
    this.emit(type, event);
  }

  dispose(): void {
    // Release all locks
    for (const [resource, lock] of this.locks) {
      this.emitParallelEvent('lock:released', undefined, undefined, { resource, holder: lock.heldBy });
    }
    this.locks.clear();

    // Cancel active executions
    for (const [id, controller] of this.activeExecutions) {
      controller.abort();
    }
    this.activeExecutions.clear();

    this.groups.clear();
    this.handlers = [];
    this.removeAllListeners();
  }
}
