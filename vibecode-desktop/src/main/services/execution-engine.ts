import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { createExecutorRegistry } from './executors/index';
import { ExecutionPersistence } from './execution-persistence';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: ExecutionStep[];
  status: 'draft' | 'approved' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export interface ExecutionStep {
  id: string;
  planId: string;
  title: string;
  description: string;
  type: 'file_write' | 'file_read' | 'file_edit' | 'command' | 'code_edit' | 'code_generation' | 'diff_apply' | 'analysis' | 'generation' | 'review';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';
  dependsOn: string[];
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface StepInput {
  title: string;
  description: string;
  type: ExecutionStep['type'];
  dependsOn?: string[];
  params?: Record<string, unknown>;
  maxRetries?: number;
  riskLevel?: ExecutionStep['riskLevel'];
  requiresApproval?: boolean;
}

// ─── Execution Step Executor Function Type ──────────────────────────────────

export type StepExecutor = (step: ExecutionStep) => Promise<unknown>;

// ─── Rollback Snapshot ──────────────────────────────────────────────────────

export interface RollbackSnapshot {
  stepId: string;
  planId: string;
  stepType: ExecutionStep['type'];
  timestamp: number;
  /** For file operations: the original file content before modification */
  originalContent?: string;
  /** For file operations: the absolute path of the file that was modified */
  filePath?: string;
  /** For file operations: whether the file existed before the step */
  fileExisted?: boolean;
  /** For command operations: the command that was run */
  command?: string;
  /** For command operations: the output that was produced */
  commandOutput?: string;
}

// ─── Event Types ────────────────────────────────────────────────────────────

export type ExecutionEventType =
  | 'step:started'
  | 'step:completed'
  | 'step:failed'
  | 'step:blocked'
  | 'plan:started'
  | 'plan:completed'
  | 'plan:failed'
  | 'plan:cancelled';

export interface ExecutionEvent {
  type: ExecutionEventType;
  planId: string;
  stepId?: string;
  timestamp: number;
  data?: unknown;
}

export type ExecutionEventHandler = (event: ExecutionEvent) => void;

// ─── ExecutionEngine ────────────────────────────────────────────────────────

export class ExecutionEngine {
  private plans: Map<string, ExecutionPlan> = new Map();
  private activeExecutions: Map<string, AbortController> = new Map();

  /** Registry mapping step types to their real executors */
  private executorRegistry: Map<string, StepExecutor>;

  /** Persistence layer for saving/loading plans */
  private persistence: ExecutionPersistence;

  /** Rollback snapshots for completed steps */
  private rollbackSnapshots: Map<string, RollbackSnapshot> = new Map();

  /** Event listeners */
  private eventHandlers: ExecutionEventHandler[] = [];

  /** Workspace root path for resolving relative file paths */
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);

    // Initialize executor registry with real executors
    this.executorRegistry = createExecutorRegistry(this.workspaceRoot);

    // Initialize persistence
    this.persistence = new ExecutionPersistence();

    // Load persisted plans
    this.loadPersistedPlans();
  }

  // ─── Event System ──────────────────────────────────────────────────────

  /** Subscribe to execution events */
  onEvent(handler: ExecutionEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  private emitEvent(type: ExecutionEventType, planId: string, stepId?: string, data?: unknown): void {
    const event: ExecutionEvent = {
      type,
      planId,
      stepId,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('[ExecutionEngine] Event handler error:', err);
      }
    }
  }

  // ─── Plan Management ────────────────────────────────────────────────────

  /** Create a new execution plan */
  createPlan(
    title: string,
    description: string,
    stepInputs: StepInput[]
  ): ExecutionPlan {
    const now = Date.now();
    const planId = uuidv4();

    const steps: ExecutionStep[] = stepInputs.map((input) => ({
      id: uuidv4(),
      planId,
      title: input.title,
      description: input.description,
      type: input.type,
      status: 'pending' as const,
      dependsOn: input.dependsOn ?? [],
      params: input.params ?? {},
      result: undefined,
      error: undefined,
      retryCount: 0,
      maxRetries: input.maxRetries ?? 3,
      riskLevel: input.riskLevel ?? 'low',
      requiresApproval: input.requiresApproval ?? false,
      startedAt: undefined,
      completedAt: undefined,
    }));

    const plan: ExecutionPlan = {
      id: planId,
      title,
      description,
      steps,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(planId, plan);
    this.persistence.autoSave(plan);
    return plan;
  }

  /** Approve a plan for execution */
  approvePlan(planId: string): ExecutionPlan {
    const plan = this.getPlanOrThrow(planId);

    if (plan.status !== 'draft') {
      throw new Error(`Cannot approve plan in "${plan.status}" status — must be "draft"`);
    }

    plan.status = 'approved';
    plan.updatedAt = Date.now();
    this.persistence.autoSave(plan);

    return plan;
  }

  /** Get a plan by ID */
  getPlan(planId: string): ExecutionPlan | null {
    return this.plans.get(planId) ?? null;
  }

  /** Get all plans (in-memory) */
  getAllPlans(): ExecutionPlan[] {
    return Array.from(this.plans.values());
  }

  /** Get a step by its ID */
  getStep(stepId: string): ExecutionStep | null {
    for (const plan of this.plans.values()) {
      const step = plan.steps.find((s) => s.id === stepId);
      if (step) return step;
    }
    return null;
  }

  /** Update a step's properties */
  updateStep(stepId: string, updates: Partial<ExecutionStep>): ExecutionStep | null {
    const step = this.getStep(stepId);
    if (!step) return null;

    // Prevent overwriting immutable fields
    const { id: _id, planId: _pid, ...safeUpdates } = updates as any;

    Object.assign(step, safeUpdates);

    // Touch the plan and persist
    const plan = this.plans.get(step.planId);
    if (plan) {
      plan.updatedAt = Date.now();
      this.persistence.autoSave(plan);
    }

    return step;
  }

  // ─── Execution ─────────────────────────────────────────────────────────

  /** Execute a single step by ID */
  async executeStep(stepId: string): Promise<ExecutionStep> {
    const step = this.getStep(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    if (step.status === 'running') {
      throw new Error(`Step is already running: ${stepId}`);
    }

    // Check dependencies
    const plan = this.getPlanOrThrow(step.planId);
    for (const depId of step.dependsOn) {
      const dep = plan.steps.find((s) => s.id === depId);
      if (dep && dep.status !== 'completed') {
        step.status = 'blocked';
        step.error = `Blocked by unmet dependency: ${dep.title} (${depId})`;
        plan.updatedAt = Date.now();
        this.emitEvent('step:blocked', step.planId, stepId);
        this.persistence.autoSave(plan);
        return step;
      }
    }

    // Create rollback snapshot before executing
    await this.createRollbackSnapshot(step);

    // Execute
    step.status = 'running';
    step.startedAt = Date.now();
    plan.updatedAt = Date.now();
    this.emitEvent('step:started', step.planId, stepId);
    this.persistence.autoSave(plan);

    try {
      // Look up the executor from the registry
      const executor = this.executorRegistry.get(step.type);
      if (!executor) {
        throw new Error(
          `No executor registered for step type "${step.type}". ` +
          `Cannot execute step "${step.title}" (${stepId}).`
        );
      }

      step.result = await executor(step);
      step.status = 'completed';
      step.completedAt = Date.now();
      this.emitEvent('step:completed', step.planId, stepId, step.result);
    } catch (err) {
      step.retryCount += 1;
      step.error = err instanceof Error ? err.message : String(err);

      if (step.retryCount < step.maxRetries) {
        step.status = 'pending'; // Allow retry
      } else {
        step.status = 'failed';
        step.completedAt = Date.now();
        this.emitEvent('step:failed', step.planId, stepId, step.error);
      }
    }

    plan.updatedAt = Date.now();
    this.persistence.autoSave(plan);
    return step;
  }

  /** Execute all steps in a plan in dependency order */
  async executePlan(planId: string): Promise<ExecutionPlan> {
    const plan = this.getPlanOrThrow(planId);

    if (plan.status !== 'approved') {
      throw new Error(`Plan must be "approved" before execution — current status: "${plan.status}"`);
    }

    // Set up abort controller for cancellation
    const abortController = new AbortController();
    this.activeExecutions.set(planId, abortController);

    plan.status = 'running';
    plan.updatedAt = Date.now();
    this.emitEvent('plan:started', planId);
    this.persistence.autoSave(plan);

    try {
      // Topological sort of steps by dependencies
      const sortedSteps = this.topologicalSort(plan.steps);

      for (const step of sortedSteps) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          plan.status = 'cancelled';
          plan.updatedAt = Date.now();
          this.emitEvent('plan:cancelled', planId);
          return plan;
        }

        // Skip already-completed steps
        if (step.status === 'completed' || step.status === 'skipped') {
          continue;
        }

        await this.executeStep(step.id);

        // If step failed and isn't retryable, the plan fails
        if (step.status === 'failed') {
          plan.status = 'failed';
          plan.updatedAt = Date.now();
          this.emitEvent('plan:failed', planId, step.id);
          return plan;
        }

        // If step is blocked, continue to others
        if (step.status === 'blocked') {
          continue;
        }
      }

      // Check if all steps completed
      const allDone = plan.steps.every(
        (s) => s.status === 'completed' || s.status === 'skipped'
      );
      const hasBlocked = plan.steps.some((s) => s.status === 'blocked');

      if (allDone) {
        plan.status = 'completed';
        this.emitEvent('plan:completed', planId);
      } else if (hasBlocked) {
        plan.status = 'failed'; // Some steps couldn't run
        this.emitEvent('plan:failed', planId);
      }

      plan.updatedAt = Date.now();
    } finally {
      this.activeExecutions.delete(planId);
      this.persistence.autoSave(plan);
    }

    return plan;
  }

  /** Cancel a running plan */
  cancelPlan(planId: string): void {
    const controller = this.activeExecutions.get(planId);
    if (controller) {
      controller.abort();
    }

    const plan = this.plans.get(planId);
    if (plan && (plan.status === 'running' || plan.status === 'approved')) {
      plan.status = 'cancelled';
      plan.updatedAt = Date.now();

      // Cancel running steps
      for (const step of plan.steps) {
        if (step.status === 'running') {
          step.status = 'pending';
          step.error = 'Plan cancelled';
        }
      }

      this.emitEvent('plan:cancelled', planId);
      this.persistence.autoSave(plan);
    }
  }

  /** Retry a failed step */
  async retryStep(stepId: string): Promise<ExecutionStep> {
    const step = this.getStep(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    if (step.status !== 'failed' && step.status !== 'blocked') {
      throw new Error(`Can only retry failed or blocked steps — current status: "${step.status}"`);
    }

    step.status = 'pending';
    step.error = undefined;
    step.retryCount = 0; // Reset retry count for manual retry

    return this.executeStep(stepId);
  }

  /** Detect steps that are blocked due to unmet dependencies */
  detectBlockers(planId: string): ExecutionStep[] {
    const plan = this.plans.get(planId);
    if (!plan) return [];

    const blockers: ExecutionStep[] = [];

    for (const step of plan.steps) {
      if (step.status !== 'pending') continue;

      for (const depId of step.dependsOn) {
        const dep = plan.steps.find((s) => s.id === depId);
        if (dep && (dep.status === 'failed' || dep.status === 'blocked')) {
          blockers.push(step);
          break;
        }
      }
    }

    return blockers;
  }

  /** Create a proposal card for user approval */
  propose(
    title: string,
    description: string,
    steps: StepInput[]
  ): ExecutionPlan {
    const plan = this.createPlan(title, description, steps);

    // Auto-flag high-risk steps as requiring approval
    for (const step of plan.steps) {
      if (step.riskLevel === 'high') {
        step.requiresApproval = true;
      }
    }

    this.persistence.autoSave(plan);
    return plan;
  }

  // ─── Rollback Support ──────────────────────────────────────────────────

  /** Roll back a single step by restoring the snapshot */
  async rollbackStep(stepId: string): Promise<void> {
    const snapshot = this.rollbackSnapshots.get(stepId);
    if (!snapshot) {
      throw new Error(`No rollback snapshot found for step ${stepId}`);
    }

    // Restore based on step type
    if (snapshot.filePath && snapshot.fileExisted === false) {
      // File was created by this step — delete it
      try {
        await fs.promises.unlink(snapshot.filePath);
      } catch {
        // File may already be gone
      }
    } else if (snapshot.filePath && snapshot.originalContent !== undefined) {
      // File was modified — restore original content
      await fs.promises.writeFile(snapshot.filePath, snapshot.originalContent, 'utf-8');
    }

    // Update step status
    const step = this.getStep(stepId);
    if (step) {
      step.status = 'pending';
      step.result = undefined;
      step.error = undefined;
      step.startedAt = undefined;
      step.completedAt = undefined;

      const plan = this.plans.get(step.planId);
      if (plan) {
        plan.updatedAt = Date.now();
        this.persistence.autoSave(plan);
      }
    }

    // Remove the snapshot
    this.rollbackSnapshots.delete(stepId);
  }

  /** Roll back an entire plan by reversing all completed steps in reverse order */
  async rollbackPlan(planId: string): Promise<void> {
    const plan = this.getPlanOrThrow(planId);

    // Get completed steps in reverse order
    const completedSteps = plan.steps
      .filter((s) => s.status === 'completed')
      .reverse();

    for (const step of completedSteps) {
      try {
        await this.rollbackStep(step.id);
      } catch (err) {
        console.error(
          `[ExecutionEngine] Failed to rollback step ${step.id} (${step.title}):`,
          err
        );
        // Continue rolling back other steps even if one fails
      }
    }

    // Update plan status
    plan.status = 'draft';
    plan.updatedAt = Date.now();
    this.persistence.autoSave(plan);
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  /** Delete a plan from both memory and disk */
  deletePlan(planId: string): void {
    this.plans.delete(planId);
    this.persistence.deletePlan(planId);

    // Clean up any rollback snapshots for this plan
    for (const [stepId, snapshot] of this.rollbackSnapshots) {
      if (snapshot.planId === planId) {
        this.rollbackSnapshots.delete(stepId);
      }
    }
  }

  /** Get the persistence instance (for flush on app quit) */
  getPersistence(): ExecutionPersistence {
    return this.persistence;
  }

  /** Get the workspace root path */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private getPlanOrThrow(planId: string): ExecutionPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    return plan;
  }

  /** Topological sort of execution steps based on dependency graph */
  private topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const result: ExecutionStep[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const step = stepMap.get(id);
      if (!step) return;

      for (const depId of step.dependsOn) {
        visit(depId);
      }

      result.push(step);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return result;
  }

  /**
   * Create a rollback snapshot for a step before execution.
   * For file operations, this captures the original file content.
   * For command operations, this records the command string.
   */
  private async createRollbackSnapshot(step: ExecutionStep): Promise<void> {
    const snapshot: RollbackSnapshot = {
      stepId: step.id,
      planId: step.planId,
      stepType: step.type,
      timestamp: Date.now(),
    };

    const filePaths: string[] = [];

    // Determine which file paths are involved based on step type
    switch (step.type) {
      case 'file_write':
      case 'file_read':
      case 'file_edit':
      case 'code_generation':
      case 'diff_apply':
      case 'code_edit': {
        const relPath = step.params.filePath as string | undefined;
        if (relPath) {
          filePaths.push(path.resolve(this.workspaceRoot, relPath));
        }
        break;
      }
      case 'command': {
        snapshot.command = step.params.command as string;
        break;
      }
    }

    // For file operations, capture the current state of the file
    if (filePaths.length > 0) {
      const absPath = filePaths[0];
      snapshot.filePath = absPath;

      try {
        await fs.promises.access(absPath, fs.constants.F_OK);
        snapshot.fileExisted = true;
        snapshot.originalContent = await fs.promises.readFile(absPath, 'utf-8');
      } catch {
        snapshot.fileExisted = false;
        snapshot.originalContent = undefined;
      }
    }

    this.rollbackSnapshots.set(step.id, snapshot);

    // Also persist the snapshot to disk for crash recovery
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
      const rollbackDir = path.join(homeDir, '.vibecode', 'rollbacks');
      await fs.promises.mkdir(rollbackDir, { recursive: true });
      const snapshotPath = path.join(rollbackDir, `${step.id}.json`);
      await fs.promises.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ExecutionEngine] Failed to persist rollback snapshot:', err);
      // Non-fatal: in-memory snapshot still exists for this session
    }
  }

  /** Load persisted plans from disk into memory */
  private loadPersistedPlans(): void {
    try {
      const plans = this.persistence.loadAllPlans();
      for (const plan of plans) {
        this.plans.set(plan.id, plan);

        // Also load rollback snapshots for any running/completed plans
        this.loadRollbackSnapshots(plan);
      }

      if (plans.length > 0) {
        console.log(`[ExecutionEngine] Loaded ${plans.length} persisted plan(s)`);
      }
    } catch (err) {
      console.error('[ExecutionEngine] Failed to load persisted plans:', err);
    }
  }

  /** Load rollback snapshots from disk for a plan */
  private async loadRollbackSnapshots(plan: ExecutionPlan): Promise<void> {
    for (const step of plan.steps) {
      if (step.status === 'completed') {
        try {
          const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
          const snapshotPath = path.join(homeDir, '.vibecode', 'rollbacks', `${step.id}.json`);
          const data = await fs.promises.readFile(snapshotPath, 'utf-8');
          const snapshot = JSON.parse(data) as RollbackSnapshot;
          this.rollbackSnapshots.set(step.id, snapshot);
        } catch {
          // Snapshot may not exist or be corrupted — that's OK
        }
      }
    }
  }
}
