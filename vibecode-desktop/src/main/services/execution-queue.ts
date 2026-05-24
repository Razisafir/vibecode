import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionEngine, ExecutionPlan, ExecutionStep, ExecutionEvent } from './execution-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QueueEntry {
  id: string;
  planId: string;
  title: string;
  description: string;
  priority: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  /** Timeout in ms for each step (default: 120000) */
  stepTimeout: number;
}

export interface ExecutionHistoryEntry {
  planId: string;
  title: string;
  description: string;
  status: ExecutionPlan['status'];
  stepCount: number;
  completedSteps: number;
  failedSteps: number;
  createdAt: number;
  completedAt?: number;
  duration?: number;
  /** Summarized step results */
  stepSummaries: Array<{
    id: string;
    title: string;
    type: ExecutionStep['type'];
    status: ExecutionStep['status'];
    duration?: number;
    error?: string;
  }>;
}

export interface StepOutput {
  stepId: string;
  planId: string;
  title: string;
  type: ExecutionStep['type'];
  status: ExecutionStep['status'];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration?: number;
  truncated: boolean;
}

export type QueueEventType =
  | 'queue:added'
  | 'queue:removed'
  | 'queue:started'
  | 'queue:completed'
  | 'queue:failed'
  | 'queue:cancelled'
  | 'queue:reordered';

export interface QueueEvent {
  type: QueueEventType;
  entryId: string;
  planId: string;
  timestamp: number;
  data?: unknown;
}

export type QueueEventHandler = (event: QueueEvent) => void;

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_STEP_TIMEOUT = 120_000; // 2 minutes
const MAX_STDOUT_LENGTH = 10_000;
const TRUNCATION_MARKER = '\n[...truncated...]';

const VIBECODE_HOME = process.env.VIBECODE_HOME
  || path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.vibecode');
const HISTORY_FILE = path.join(VIBECODE_HOME, 'execution-history.json');

// ─── ExecutionQueue ────────────────────────────────────────────────────────

/**
 * Concurrent execution queue that manages plan execution with:
 * - Max concurrent plans (default: 3)
 * - Queue management (add, remove, reorder)
 * - Plan priority
 * - Execution timeout per step
 * - Stdout truncation
 * - Persistent execution history
 */
export class ExecutionQueue {
  private queue: QueueEntry[] = [];
  private running: Map<string, AbortController> = new Map();
  private executionEngine: ExecutionEngine;
  private maxConcurrent: number;
  private eventHandlers: QueueEventHandler[] = [];
  private history: ExecutionHistoryEntry[] = [];
  /** Step output buffer: stepId → StepOutput */
  private stepOutputs: Map<string, StepOutput> = new Map();

  constructor(executionEngine: ExecutionEngine, maxConcurrent: number = DEFAULT_MAX_CONCURRENT) {
    this.executionEngine = executionEngine;
    this.maxConcurrent = maxConcurrent;
    this.loadHistory();

    // Subscribe to execution engine events to track step outputs
    this.executionEngine.onEvent((event: ExecutionEvent) => {
      this.handleEngineEvent(event);
    });
  }

  // ─── Event System ──────────────────────────────────────────────────────

  onEvent(handler: QueueEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  private emitEvent(type: QueueEventType, entryId: string, planId: string, data?: unknown): void {
    const event: QueueEvent = {
      type,
      entryId,
      planId,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[ExecutionQueue] Event handler error:', err);
      }
    }
  }

  // ─── Queue Management ─────────────────────────────────────────────────

  /**
   * Add a plan to the execution queue.
   * The plan must already be created and in "approved" status.
   */
  add(
    planId: string,
    priority: number = 0,
    stepTimeout: number = DEFAULT_STEP_TIMEOUT,
  ): QueueEntry {
    const plan = this.executionEngine.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Check if already in queue
    const existing = this.queue.find((e) => e.planId === planId);
    if (existing) {
      throw new Error(`Plan ${planId} is already in the queue (entry: ${existing.id})`);
    }

    const entry: QueueEntry = {
      id: uuidv4(),
      planId,
      title: plan.title,
      description: plan.description,
      priority,
      status: 'queued',
      addedAt: Date.now(),
      stepTimeout,
    };

    // Insert in priority order (higher priority first)
    const insertIdx = this.queue.findIndex((e) => e.priority < priority);
    if (insertIdx === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(insertIdx, 0, entry);
    }

    this.emitEvent('queue:added', entry.id, planId, { priority, stepTimeout });

    // Try to start execution if slots available
    this.processQueue();

    return entry;
  }

  /**
   * Remove a plan from the queue (only if not already running).
   */
  remove(entryId: string): boolean {
    const idx = this.queue.findIndex((e) => e.id === entryId);
    if (idx === -1) return false;

    const entry = this.queue[idx];
    if (entry.status === 'running') {
      throw new Error('Cannot remove a running entry — cancel it first');
    }

    this.queue.splice(idx, 1);
    this.emitEvent('queue:removed', entryId, entry.planId);
    return true;
  }

  /**
   * Reorder an entry by changing its priority.
   */
  reorder(entryId: string, newPriority: number): QueueEntry | null {
    const entry = this.queue.find((e) => e.id === entryId);
    if (!entry) return null;
    if (entry.status === 'running') {
      throw new Error('Cannot reorder a running entry');
    }

    entry.priority = newPriority;

    // Re-sort the queue
    this.queue.sort((a, b) => b.priority - a.priority);

    this.emitEvent('queue:reordered', entryId, entry.planId, { newPriority });
    return entry;
  }

  /**
   * Cancel a running or queued entry.
   */
  cancel(entryId: string): boolean {
    const entry = this.queue.find((e) => e.id === entryId);
    if (!entry) return false;

    if (entry.status === 'running') {
      this.executionEngine.cancelPlan(entry.planId);
      entry.status = 'cancelled';
      entry.completedAt = Date.now();
      this.running.delete(entryId);
      this.emitEvent('queue:cancelled', entryId, entry.planId);
      this.processQueue();
      return true;
    }

    if (entry.status === 'queued') {
      entry.status = 'cancelled';
      entry.completedAt = Date.now();
      this.emitEvent('queue:cancelled', entryId, entry.planId);
      return true;
    }

    return false;
  }

  /**
   * Get all entries in the queue.
   */
  list(): QueueEntry[] {
    return [...this.queue];
  }

  /**
   * Get a specific entry by its ID.
   */
  getEntry(entryId: string): QueueEntry | null {
    return this.queue.find((e) => e.id === entryId) ?? null;
  }

  /**
   * Get entry by plan ID.
   */
  getEntryByPlanId(planId: string): QueueEntry | null {
    return this.queue.find((e) => e.planId === planId) ?? null;
  }

  // ─── Step Output ──────────────────────────────────────────────────────

  /**
   * Get the captured output for a step.
   */
  getStepOutput(stepId: string): StepOutput | null {
    return this.stepOutputs.get(stepId) ?? null;
  }

  // ─── Execution History ────────────────────────────────────────────────

  /**
   * Get all completed execution history entries.
   */
  getHistory(): ExecutionHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear the execution history.
   */
  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  // ─── Internal Queue Processing ────────────────────────────────────────

  /**
   * Process the queue: start next entries if slots are available.
   */
  private processQueue(): void {
    const runningCount = this.queue.filter((e) => e.status === 'running').length;
    const availableSlots = this.maxConcurrent - runningCount;

    if (availableSlots <= 0) return;

    const queued = this.queue
      .filter((e) => e.status === 'queued')
      .sort((a, b) => b.priority - a.priority);

    for (let i = 0; i < Math.min(availableSlots, queued.length); i++) {
      this.startExecution(queued[i]);
    }
  }

  /**
   * Start executing a queued entry.
   */
  private async startExecution(entry: QueueEntry): Promise<void> {
    const abortController = new AbortController();
    this.running.set(entry.id, abortController);

    entry.status = 'running';
    entry.startedAt = Date.now();
    this.emitEvent('queue:started', entry.id, entry.planId);

    try {
      // Set up step timeout monitor
      const timeoutId = setTimeout(() => {
        if (entry.status === 'running') {
          abortController.abort();
          this.executionEngine.cancelPlan(entry.planId);
        }
      }, entry.stepTimeout * this.getPlanStepCount(entry.planId));

      // Execute the plan via the engine
      const plan = await this.executionEngine.executePlan(entry.planId);

      clearTimeout(timeoutId);

      if (abortController.signal.aborted) {
        entry.status = 'cancelled';
      } else {
        entry.status = plan.status === 'completed' ? 'completed' : 'failed';
      }

      entry.completedAt = Date.now();
      this.running.delete(entry.id);

      // Save to history
      this.addHistoryEntry(plan);

      const eventType = entry.status === 'completed' ? 'queue:completed' : 'queue:failed';
      this.emitEvent(eventType, entry.id, entry.planId, {
        status: entry.status,
        planStatus: plan.status,
      });
    } catch (err) {
      entry.status = 'failed';
      entry.completedAt = Date.now();
      this.running.delete(entry.id);

      this.emitEvent('queue:failed', entry.id, entry.planId, {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Process next in queue
      this.processQueue();
    }
  }

  /**
   * Handle execution engine events — capture step outputs.
   */
  private handleEngineEvent(event: ExecutionEvent): void {
    if (event.type === 'step:completed' || event.type === 'step:failed') {
      const stepId = event.stepId;
      if (!stepId) return;

      const step = this.executionEngine.getStep(stepId);
      if (!step) return;

      // Extract stdout/stderr from command results
      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;

      if (step.type === 'command' && step.result && typeof step.result === 'object') {
        const result = step.result as Record<string, unknown>;
        stdout = typeof result.stdout === 'string' ? result.stdout : '';
        stderr = typeof result.stderr === 'string' ? result.stderr : '';
        exitCode = typeof result.exitCode === 'number' ? result.exitCode : null;
      }

      // For non-command steps, use the result/error as output
      if (step.type !== 'command') {
        if (step.result !== undefined && step.result !== null) {
          stdout = typeof step.result === 'string' ? step.result : JSON.stringify(step.result, null, 2);
        }
        if (step.error) {
          stderr = step.error;
        }
      }

      // Truncate stdout if too long
      const truncated = stdout.length > MAX_STDOUT_LENGTH;
      if (truncated) {
        stdout = stdout.substring(0, MAX_STDOUT_LENGTH) + TRUNCATION_MARKER;
      }

      // Truncate stderr if too long
      if (stderr.length > MAX_STDOUT_LENGTH) {
        stderr = stderr.substring(0, MAX_STDOUT_LENGTH) + TRUNCATION_MARKER;
      }

      const output: StepOutput = {
        stepId,
        planId: step.planId,
        title: step.title,
        type: step.type,
        status: step.status,
        stdout,
        stderr,
        exitCode,
        duration: step.completedAt && step.startedAt ? step.completedAt - step.startedAt : undefined,
        truncated,
      };

      this.stepOutputs.set(stepId, output);
    }
  }

  // ─── History Persistence ──────────────────────────────────────────────

  private addHistoryEntry(plan: ExecutionPlan): void {
    const entry: ExecutionHistoryEntry = {
      planId: plan.id,
      title: plan.title,
      description: plan.description,
      status: plan.status,
      stepCount: plan.steps.length,
      completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
      failedSteps: plan.steps.filter((s) => s.status === 'failed').length,
      createdAt: plan.createdAt,
      completedAt: plan.updatedAt,
      duration: plan.updatedAt - plan.createdAt,
      stepSummaries: plan.steps.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        status: s.status,
        duration: s.completedAt && s.startedAt ? s.completedAt - s.startedAt : undefined,
        error: s.error,
      })),
    };

    this.history.unshift(entry);

    // Keep max 100 history entries
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    this.saveHistory();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
        this.history = JSON.parse(data) as ExecutionHistoryEntry[];
      }
    } catch (err) {
      console.error('[ExecutionQueue] Failed to load history:', err);
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      const dir = path.dirname(HISTORY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ExecutionQueue] Failed to save history:', err);
    }
  }

  private getPlanStepCount(planId: string): number {
    const plan = this.executionEngine.getPlan(planId);
    return plan ? plan.steps.length : 1;
  }
}
