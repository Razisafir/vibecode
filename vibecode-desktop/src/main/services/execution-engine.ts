import { v4 as uuidv4 } from 'uuid';

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
  type: 'file_write' | 'file_read' | 'command' | 'code_edit' | 'analysis' | 'generation' | 'review';
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

// ─── ExecutionEngine ────────────────────────────────────────────────────────

export class ExecutionEngine {
  private plans: Map<string, ExecutionPlan> = new Map();
  private activeExecutions: Map<string, AbortController> = new Map();
  private executor: StepExecutor | null = null;

  /** Register a custom step executor function */
  setExecutor(executor: StepExecutor): void {
    this.executor = executor;
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

    const steps: ExecutionStep[] = stepInputs.map((input, index) => ({
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
    return plan;
  }

  /** Approve a plan for execution */
  approvePlan(planId: string): ExecutionPlan {
    const plan = this.getPlanOrThrow(planId);

    if (plan.status !== 'draft') {
      throw new Error(`Cannot approve plan in "${plan.status}" status — must be "draft"`);
    }

    // Check that all steps requiring approval have been explicitly approved
    // (for now, we approve them all at plan level)
    plan.status = 'approved';
    plan.updatedAt = Date.now();

    return plan;
  }

  /** Get a plan by ID */
  getPlan(planId: string): ExecutionPlan | null {
    return this.plans.get(planId) ?? null;
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

    // Touch the plan
    const plan = this.plans.get(step.planId);
    if (plan) {
      plan.updatedAt = Date.now();
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
        return step;
      }
    }

    // Execute
    step.status = 'running';
    step.startedAt = Date.now();
    plan.updatedAt = Date.now();

    try {
      if (this.executor) {
        step.result = await this.executor(step);
      } else {
        // Default executor — just marks as completed
        step.result = { executed: true, timestamp: Date.now() };
      }
      step.status = 'completed';
      step.completedAt = Date.now();
    } catch (err) {
      step.retryCount += 1;
      step.error = err instanceof Error ? err.message : String(err);

      if (step.retryCount < step.maxRetries) {
        step.status = 'pending'; // Allow retry
      } else {
        step.status = 'failed';
        step.completedAt = Date.now();
      }
    }

    plan.updatedAt = Date.now();
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

    try {
      // Topological sort of steps by dependencies
      const sortedSteps = this.topologicalSort(plan.steps);

      for (const step of sortedSteps) {
        // Check for cancellation
        if (abortController.signal.aborted) {
          plan.status = 'cancelled';
          plan.updatedAt = Date.now();
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
      } else if (hasBlocked) {
        plan.status = 'failed'; // Some steps couldn't run
      }

      plan.updatedAt = Date.now();
    } finally {
      this.activeExecutions.delete(planId);
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

    return plan;
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
}
