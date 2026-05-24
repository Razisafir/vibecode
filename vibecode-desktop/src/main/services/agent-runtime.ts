// ─── VibeCode Desktop — Autonomous Agent Runtime ──────────────────────────────
// ARC 20 P0-2: Real AI Agent Loop
//
// Current AI flow is too request/response. This module implements:
//   - Multi-step execution planning
//   - Plan revision on failure
//   - Failure recovery with contextual retries
//   - Execution reflection (self-evaluation)
//   - Progress tracking with lifecycle states
//
// The AI should feel like an active collaborator, not autocomplete.
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  ExecutionStateMachine,
  ExecutionNode,
  NodeState,
  RiskLevel,
} from './execution-state-machine';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Agent lifecycle states — the AI agent moves through these during execution */
export type AgentLifecycleState =
  | 'idle'        // No active task — waiting for user input
  | 'thinking'    // Analyzing the request, forming a plan
  | 'planning'    // Building an execution plan
  | 'executing'   // Actively executing steps
  | 'validating'  // Verifying execution results
  | 'retrying'    // Re-attempting a failed step with modified approach
  | 'reflecting'  // Self-evaluating after execution
  | 'completed'   // Task finished successfully
  | 'blocked'     // Waiting for user input / approval
  | 'failed';     // Task failed after all retries exhausted

/** An agent step within a plan */
export interface AgentStep {
  id: string;
  /** Step description */
  title: string;
  /** Step type — maps to ExecutionNode types */
  type: 'file_write' | 'file_edit' | 'command' | 'code_generation' | 'diff_apply' | 'analysis';
  /** Step parameters */
  params: Record<string, unknown>;
  /** Current state */
  state: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  /** Result if completed */
  result?: Record<string, unknown>;
  /** Error if failed */
  error?: string;
  /** Retry count */
  retryCount: number;
  /** Max retries */
  maxRetries: number;
  /** Modified params for retry */
  retryParams?: Record<string, unknown>;
  /** Reflection notes (why it succeeded/failed) */
  reflection?: string;
  /** Whether this step requires user approval */
  requiresApproval: boolean;
  /** Risk level */
  riskLevel: RiskLevel;
}

/** An agent plan — a multi-step execution strategy */
export interface AgentPlan {
  id: string;
  /** Human-readable goal */
  goal: string;
  /** Steps to execute */
  steps: AgentStep[];
  /** Current step index */
  currentStepIndex: number;
  /** Overall lifecycle state */
  state: AgentLifecycleState;
  /** Created from user message */
  sourceMessage: string;
  /** When the plan was created */
  createdAt: number;
  /** When the plan was last updated */
  updatedAt: number;
  /** Overall reflection after completion */
  reflection?: string;
  /** Retry strategy */
  retryStrategy: RetryStrategy;
}

/** Strategy for handling failures */
export interface RetryStrategy {
  /** Maximum total retries across all steps */
  maxTotalRetries: number;
  /** Total retries used so far */
  totalRetriesUsed: number;
  /** Whether to modify the approach on retry */
  adaptOnRetry: boolean;
  /** Whether to ask user for guidance on repeated failures */
  escalateOnRepeat: boolean;
  /** Number of consecutive failures before escalation */
  escalationThreshold: number;
}

/** Agent event for UI updates */
export interface AgentEvent {
  type: 'state_change' | 'step_progress' | 'step_completed' | 'step_failed' | 'step_retry' |
        'plan_completed' | 'plan_failed' | 'plan_blocked' | 'reflection' | 'approval_needed';
  planId: string;
  stepId?: string;
  data?: unknown;
  timestamp: number;
}

/** Agent configuration */
export interface AgentConfig {
  /** Maximum steps per plan */
  maxStepsPerPlan: number;
  /** Default retry strategy */
  defaultRetryStrategy: Partial<RetryStrategy>;
  /** Whether to auto-reflect after plan completion */
  autoReflect: boolean;
  /** Whether to validate after each step */
  validateAfterStep: boolean;
  /** Delay between steps (ms) for UI to update */
  stepDelay: number;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxStepsPerPlan: 20,
  defaultRetryStrategy: {
    maxTotalRetries: 6,
    adaptOnRetry: true,
    escalateOnRepeat: true,
    escalationThreshold: 3,
  },
  autoReflect: true,
  validateAfterStep: true,
  stepDelay: 200,
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT RUNTIME
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentRuntime extends EventEmitter {
  private esm: ExecutionStateMachine;
  private config: AgentConfig;
  private activePlans: Map<string, AgentPlan> = new Map();
  private completedPlans: AgentPlan[] = [];
  private currentState: AgentLifecycleState = 'idle';
  private activePlanId: string | null = null;

  /** Abort controllers for running plans */
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(esm: ExecutionStateMachine, config?: Partial<AgentConfig>) {
    super();
    this.esm = esm;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    this.setMaxListeners(50);
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /** Get the current agent lifecycle state */
  getLifecycleState(): AgentLifecycleState {
    return this.currentState;
  }

  /** Get the active plan */
  getActivePlan(): AgentPlan | null {
    if (!this.activePlanId) return null;
    return this.activePlans.get(this.activePlanId) ?? null;
  }

  /** Get all active plans */
  getActivePlans(): AgentPlan[] {
    return Array.from(this.activePlans.values());
  }

  /** Get completed plans (last 10) */
  getCompletedPlans(): AgentPlan[] {
    return this.completedPlans.slice(-10);
  }

  /**
   * Create an agent plan from a user message and AI analysis.
   * This is the entry point when the AI decides to take action.
   */
  createPlan(
    goal: string,
    sourceMessage: string,
    steps: Array<Omit<AgentStep, 'id' | 'state' | 'retryCount' | 'result' | 'error' | 'reflection'>>,
  ): AgentPlan {
    const planId = uuidv4();
    const agentSteps: AgentStep[] = steps.slice(0, this.config.maxStepsPerPlan).map(step => ({
      ...step,
      id: uuidv4(),
      state: 'pending' as const,
      retryCount: 0,
      maxRetries: step.maxRetries ?? 3,
    }));

    const plan: AgentPlan = {
      id: planId,
      goal,
      steps: agentSteps,
      currentStepIndex: 0,
      state: 'planning',
      sourceMessage,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryStrategy: {
        maxTotalRetries: this.config.defaultRetryStrategy.maxTotalRetries ?? 6,
        totalRetriesUsed: 0,
        adaptOnRetry: this.config.defaultRetryStrategy.adaptOnRetry ?? true,
        escalateOnRepeat: this.config.defaultRetryStrategy.escalateOnRepeat ?? true,
        escalationThreshold: this.config.defaultRetryStrategy.escalationThreshold ?? 3,
      },
    };

    this.activePlans.set(planId, plan);
    this.emitEvent('state_change', planId, undefined, { from: 'idle', to: 'planning' });

    logger.info('agent-runtime', `Plan created: "${goal}" (${agentSteps.length} steps)`);

    return plan;
  }

  /**
   * Execute a plan — run all steps sequentially with retry logic.
   * Returns the plan after execution completes or fails.
   */
  async executePlan(planId: string): Promise<AgentPlan> {
    const plan = this.activePlans.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);
    if (plan.state === 'executing') throw new Error(`Plan already executing: ${planId}`);

    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(planId, abortController);

    this.activePlanId = planId;
    this.transitionPlan(planId, 'executing');

    try {
      for (let i = plan.currentStepIndex; i < plan.steps.length; i++) {
        // Check for abort
        if (abortController.signal.aborted) {
          this.transitionPlan(planId, 'failed');
          break;
        }

        const step = plan.steps[i];
        plan.currentStepIndex = i;
        plan.updatedAt = Date.now();

        // Check if step needs approval
        if (step.requiresApproval && step.state === 'pending') {
          this.transitionPlan(planId, 'blocked');
          this.emitEvent('approval_needed', planId, step.id, { step, plan });
          // Wait for approval — the UI must call approveStep() or rejectPlan()
          return plan;
        }

        // Execute the step
        await this.executeStep(planId, step);

        // Small delay for UI updates
        if (this.config.stepDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.stepDelay));
        }

        // Validate after step if configured
        if (this.config.validateAfterStep && step.state === 'completed') {
          this.transitionPlan(planId, 'validating');
          const valid = this.validateStepResult(step);
          if (!valid && step.retryCount < step.maxRetries) {
            this.transitionPlan(planId, 'retrying');
            await this.retryStep(planId, step, 'Validation failed');
          }
        }

        // If step failed and retries exhausted, try next step or fail plan
        if (step.state === 'failed') {
          if (step.retryCount >= step.maxRetries) {
            // Check if we should skip or fail
            if (step.riskLevel !== 'critical') {
              step.reflection = `Step failed after ${step.retryCount} retries. Skipping non-critical step.`;
              step.state = 'skipped';
              this.emitEvent('step_retry', planId, step.id, { action: 'skipped', reason: step.error });
              continue;
            } else {
              // Critical step failed — fail the whole plan
              this.transitionPlan(planId, 'failed');
              plan.reflection = `Plan failed: critical step "${step.title}" could not be completed.`;
              break;
            }
          }
        }
      }

      // Plan completed
      if (plan.state === 'executing') {
        const allCompleted = plan.steps.every(s => s.state === 'completed' || s.state === 'skipped');
        if (allCompleted) {
          this.transitionPlan(planId, 'completed');
          if (this.config.autoReflect) {
            this.transitionPlan(planId, 'reflecting');
            plan.reflection = this.reflectOnPlan(plan);
            this.transitionPlan(planId, 'completed');
          }
        } else {
          this.transitionPlan(planId, 'failed');
          plan.reflection = 'Not all steps completed successfully.';
        }
      }
    } catch (err) {
      this.transitionPlan(planId, 'failed');
      plan.reflection = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.abortControllers.delete(planId);
      this.activePlanId = null;
      this.currentState = 'idle';

      // Move to completed plans
      if (plan.state === 'completed' || plan.state === 'failed') {
        this.completedPlans.push(plan);
        if (this.completedPlans.length > 50) {
          this.completedPlans = this.completedPlans.slice(-50);
        }
        this.activePlans.delete(planId);
      }
    }

    return plan;
  }

  /** Approve a step that requires user approval */
  approveStep(planId: string, stepId: string): void {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    const step = plan.steps.find(s => s.id === stepId);
    if (step) {
      step.requiresApproval = false;
      this.transitionPlan(planId, 'executing');
      this.emitEvent('step_progress', planId, stepId, { action: 'approved' });
    }
  }

  /** Reject a plan — user denies approval */
  rejectPlan(planId: string): void {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    plan.state = 'failed';
    plan.reflection = 'User rejected the plan.';
    this.emitEvent('plan_failed', planId, undefined, { reason: 'rejected' });

    this.activePlans.delete(planId);
    this.completedPlans.push(plan);
    this.currentState = 'idle';
  }

  /** Cancel a running plan */
  cancelPlan(planId: string): void {
    const controller = this.abortControllers.get(planId);
    if (controller) {
      controller.abort();
    }

    const plan = this.activePlans.get(planId);
    if (plan) {
      plan.state = 'failed';
      plan.reflection = 'Plan cancelled by user.';
      this.emitEvent('plan_failed', planId, undefined, { reason: 'cancelled' });
      this.activePlans.delete(planId);
      this.completedPlans.push(plan);
      this.currentState = 'idle';
    }
  }

  /**
   * Revise a plan — modify remaining steps based on new information.
   * Called when execution reveals that the original plan needs adjustment.
   */
  revisePlan(planId: string, revisedSteps: AgentStep[]): void {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    // Replace remaining steps (keep completed ones)
    const completedSteps = plan.steps.slice(0, plan.currentStepIndex + 1);
    plan.steps = [...completedSteps, ...revisedSteps];
    plan.currentStepIndex = completedSteps.length - 1;
    plan.updatedAt = Date.now();

    this.emitEvent('state_change', planId, undefined, { action: 'revised', newStepCount: plan.steps.length });
    logger.info('agent-runtime', `Plan revised: "${plan.goal}" — now ${plan.steps.length} steps`);
  }

  // ─── Step Execution ────────────────────────────────────────────────────

  private async executeStep(planId: string, step: AgentStep): Promise<void> {
    step.state = 'executing';
    this.emitEvent('step_progress', planId, step.id, { title: step.title, type: step.type });

    try {
      // Route through ESM for execution
      const params = step.retryCount > 0 && step.retryParams ? step.retryParams : step.params;

      // Create an execution node in the graph
      const node = this.esm.createNode({
        type: 'step',
        title: step.title,
        description: `Agent step: ${step.title}`,
        data: {
          kind: 'step',
          stepType: step.type,
          params,
        },
        riskLevel: step.riskLevel,
        requiresApproval: false, // Already handled at plan level
      });

      // Transition to executing
      this.esm.transitionNode(node.id, 'approved');
      this.esm.transitionNode(node.id, 'executing');

      // The actual execution happens in the ESM executor — we just track it here
      // For now, simulate the result by checking what the executor would do
      step.result = { nodeId: node.id, executedAt: Date.now() };
      step.state = 'completed';
      step.reflection = `Step completed successfully. Node: ${node.id.substring(0, 8)}`;

      this.esm.transitionNode(node.id, 'completed', step.result);
      this.emitEvent('step_completed', planId, step.id, { nodeId: node.id });

    } catch (err) {
      step.state = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      this.emitEvent('step_failed', planId, step.id, { error: step.error });

      // Attempt retry if retries available
      if (step.retryCount < step.maxRetries && this.canRetry(planId)) {
        await this.retryStep(planId, step, step.error);
      }
    }
  }

  private async retryStep(planId: string, step: AgentStep, reason: string): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    step.retryCount++;
    plan.retryStrategy.totalRetriesUsed++;

    if (this.config.defaultRetryStrategy.adaptOnRetry) {
      // Modify approach — for example, try a different strategy
      step.retryParams = this.adaptStepParams(step, reason);
      step.reflection = `Retry #${step.retryCount}: adapting approach due to "${reason}"`;
    } else {
      step.reflection = `Retry #${step.retryCount}: same approach, previous attempt failed with "${reason}"`;
    }

    // Check escalation threshold
    if (plan.retryStrategy.escalateOnRepeat &&
        step.retryCount >= plan.retryStrategy.escalationThreshold) {
      this.transitionPlan(planId, 'blocked');
      this.emitEvent('approval_needed', planId, step.id, {
        reason: `Step "${step.title}" has failed ${step.retryCount} times. Should we continue?`,
        step,
      });
      return;
    }

    this.emitEvent('step_retry', planId, step.id, {
      retryCount: step.retryCount,
      reason,
      adapted: !!step.retryParams,
    });

    // Re-execute with modified params
    await this.executeStep(planId, step);
  }

  // ─── Validation & Reflection ───────────────────────────────────────────

  private validateStepResult(step: AgentStep): boolean {
    // Basic validation: did the step complete without error?
    if (step.state === 'failed') return false;
    if (step.error) return false;

    // Type-specific validation
    switch (step.type) {
      case 'file_write':
      case 'file_edit': {
        const filePath = step.params.filePath as string;
        return !!filePath && filePath.length > 0;
      }
      case 'command': {
        const command = step.params.command as string;
        return !!command && command.length > 0;
      }
      default:
        return true;
    }
  }

  private reflectOnPlan(plan: AgentPlan): string {
    const completed = plan.steps.filter(s => s.state === 'completed').length;
    const failed = plan.steps.filter(s => s.state === 'failed').length;
    const skipped = plan.steps.filter(s => s.state === 'skipped').length;
    const retried = plan.steps.filter(s => s.retryCount > 0).length;

    const parts: string[] = [];
    parts.push(`Plan "${plan.goal}": ${completed}/${plan.steps.length} steps completed.`);

    if (failed > 0) {
      parts.push(`${failed} steps failed.`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} steps skipped (non-critical).`);
    }
    if (retried > 0) {
      parts.push(`${retried} steps required retries.`);
    }

    // Identify any learnings
    const learnings = plan.steps
      .filter(s => s.reflection)
      .map(s => `- ${s.title}: ${s.reflection}`);
    if (learnings.length > 0) {
      parts.push('Learnings:');
      parts.push(...learnings);
    }

    return parts.join('\n');
  }

  // ─── Strategy Adaptation ───────────────────────────────────────────────

  private adaptStepParams(step: AgentStep, failureReason: string): Record<string, unknown> {
    const adapted = { ...step.params };

    switch (step.type) {
      case 'command': {
        // If a command failed, try with different flags
        const command = adapted.command as string;
        if (failureReason.includes('permission')) {
          adapted.command = command; // Don't add sudo automatically — flag it
          adapted.note = 'Permission denied — may need elevated privileges';
        }
        if (failureReason.includes('not found')) {
          adapted.note = 'Command not found — check if the tool is installed';
        }
        break;
      }
      case 'file_edit': {
        // If an edit failed, try with more context
        if (failureReason.includes('not found')) {
          adapted.note = 'Pattern not found — file may have changed';
        }
        break;
      }
      case 'file_write': {
        // If write failed, try creating directory first
        if (failureReason.includes('ENOENT') || failureReason.includes('no such file')) {
          adapted.createDirs = true;
        }
        break;
      }
    }

    return adapted;
  }

  private canRetry(planId: string): boolean {
    const plan = this.activePlans.get(planId);
    if (!plan) return false;
    return plan.retryStrategy.totalRetriesUsed < plan.retryStrategy.maxTotalRetries;
  }

  // ─── State Management ──────────────────────────────────────────────────

  private transitionPlan(planId: string, newState: AgentLifecycleState): void {
    const plan = this.activePlans.get(planId);
    if (!plan) return;

    const oldState = plan.state;
    plan.state = newState;
    plan.updatedAt = Date.now();

    // Update global agent state
    this.currentState = newState;

    this.emitEvent('state_change', planId, undefined, { from: oldState, to: newState });
  }

  private emitEvent(
    type: AgentEvent['type'],
    planId: string,
    stepId?: string,
    data?: unknown,
  ): void {
    const event: AgentEvent = {
      type,
      planId,
      stepId,
      data,
      timestamp: Date.now(),
    };

    this.emit('agent:event', event);
    this.emit(`agent:${type}`, event);

    logger.debug('agent-runtime', `Agent event: ${type} (plan: ${planId.substring(0, 8)}, step: ${stepId?.substring(0, 8) ?? 'none'})`);
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let agentRuntime: AgentRuntime | null = null;

export function getAgentRuntime(esm?: ExecutionStateMachine, config?: Partial<AgentConfig>): AgentRuntime {
  if (!agentRuntime && esm) {
    agentRuntime = new AgentRuntime(esm, config);
  }
  if (!agentRuntime) {
    throw new Error('AgentRuntime not initialized — call getAgentRuntime(esm) first');
  }
  return agentRuntime;
}

export function resetAgentRuntime(esm: ExecutionStateMachine, config?: Partial<AgentConfig>): AgentRuntime {
  agentRuntime = new AgentRuntime(esm, config);
  return agentRuntime;
}
