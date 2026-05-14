// ─── AI → Proposal Pipeline Orchestrator ────────────────────────────────────
//
// Transforms raw LLM responses into structured execution proposals.
// This is the bridge between AI chat and real execution.
//

import { v4 as uuidv4 } from 'uuid';
import { ExecutionEngine, ExecutionPlan, StepInput } from './execution-engine';
import { getExecutor } from './executors';
import { FileSystemSandbox } from './sandbox';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedIntent {
  /** What the user wants to accomplish */
  goal: string;
  /** The type of action required */
  actionType: 'create' | 'modify' | 'delete' | 'analyze' | 'execute' | 'explain' | 'multi_step';
  /** Confidence level of the intent parsing (0-1) */
  confidence: number;
  /** Affected file paths (if known) */
  affectedPaths: string[];
  /** Risk assessment */
  riskLevel: 'low' | 'medium' | 'high';
  /** Structured execution steps parsed from AI response */
  steps: ParsedStep[];
}

export interface ParsedStep {
  title: string;
  description: string;
  type: StepInput['type'];
  params: Record<string, unknown>;
  riskLevel?: StepInput['riskLevel'];
  dependsOn?: string[];
}

export interface ProposalGenerationResult {
  proposal: ExecutionPlan;
  intent: ParsedIntent;
  /** Whether the proposal was auto-approved (low risk, user preference) */
  autoApproved: boolean;
}

export interface ExecutionProgressEvent {
  type: 'plan_created' | 'plan_approved' | 'step_started' | 'step_progress' | 'step_completed' | 'step_failed' | 'plan_completed' | 'plan_failed' | 'plan_cancelled';
  planId: string;
  stepId?: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export type ProgressListener = (event: ExecutionProgressEvent) => void;

// ─── ProposalOrchestrator ───────────────────────────────────────────────────

export class ProposalOrchestrator {
  private executionEngine: ExecutionEngine;
  private sandbox: FileSystemSandbox;
  private workspaceRoot: string;
  private progressListeners: Set<ProgressListener> = new Set();
  private executionHistory: Map<string, ExecutionPlan> = new Map();

  constructor(
    executionEngine: ExecutionEngine,
    sandbox: FileSystemSandbox,
    workspaceRoot: string
  ) {
    this.executionEngine = executionEngine;
    this.sandbox = sandbox;
    this.workspaceRoot = workspaceRoot;
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Process an AI chat response and generate execution proposals.
   *
   * This is the core pipeline:
   *   1. Parse the AI response for execution intents
   *   2. Generate structured execution steps
   *   3. Create an execution plan (proposal)
   *   4. Return for user approval
   */
  processAIResponse(
    aiResponse: string,
    userMessage: string,
    context?: {
      workspaceRoot?: string;
      openFiles?: string[];
      recentEdits?: string[];
    }
  ): ProposalGenerationResult | null {
    // Step 1: Parse the AI response for actionable intents
    const intent = this.parseAIResponse(aiResponse, userMessage, context);

    // If no actionable intent found, return null (just a conversational response)
    if (!intent || intent.confidence < 0.3 || intent.steps.length === 0) {
      return null;
    }

    // Step 2: Validate the steps against the sandbox
    const validatedSteps = this.validateSteps(intent.steps);

    // Step 3: Create the execution plan
    const proposal = this.executionEngine.propose(
      intent.goal,
      this.generatePlanDescription(intent),
      validatedSteps
    );

    // Track in history
    this.executionHistory.set(proposal.id, proposal);

    // Emit progress event
    this.emitProgress({
      type: 'plan_created',
      planId: proposal.id,
      message: `Created execution plan: ${intent.goal}`,
      data: { stepCount: validatedSteps.length, riskLevel: intent.riskLevel },
      timestamp: Date.now(),
    });

    // Auto-approve low-risk, high-confidence plans
    const autoApproved = intent.riskLevel === 'low' && intent.confidence > 0.8;

    return {
      proposal,
      intent,
      autoApproved,
    };
  }

  /**
   * Approve and execute a proposal.
   * Returns the execution plan with results.
   */
  async approveAndExecute(planId: string): Promise<ExecutionPlan> {
    const plan = this.executionEngine.approvePlan(planId);

    this.emitProgress({
      type: 'plan_approved',
      planId,
      message: `Plan approved: ${plan.title}`,
      timestamp: Date.now(),
    });

    // Set up the real executor that dispatches to step-type-specific executors
    this.executionEngine.setExecutor(async (step) => {
      this.emitProgress({
        type: 'step_started',
        planId: step.planId,
        stepId: step.id,
        message: `Executing: ${step.title}`,
        data: { type: step.type, params: step.params },
        timestamp: Date.now(),
      });

      const executorFn = getExecutor(step.type);
      if (!executorFn) {
        // Fallback for unknown step types
        return {
          stepId: step.id,
          type: step.type,
          executed: false,
          error: `No executor registered for step type: ${step.type}`,
          timestamp: Date.now(),
        };
      }

      const result = await executorFn(step, {
        sandbox: this.sandbox,
        workspaceRoot: this.workspaceRoot,
        onProgress: (message) => {
          this.emitProgress({
            type: 'step_progress',
            planId: step.planId,
            stepId: step.id,
            message,
            timestamp: Date.now(),
          });
        },
        shouldAbort: () => {
          const controller = this.getActiveAbortController(planId);
          return controller?.signal.aborted ?? false;
        },
      });

      if (result.success) {
        this.emitProgress({
          type: 'step_completed',
          planId: step.planId,
          stepId: step.id,
          message: `Completed: ${step.title}`,
          data: result.data,
          timestamp: Date.now(),
        });
      } else {
        this.emitProgress({
          type: 'step_failed',
          planId: step.planId,
          stepId: step.id,
          message: `Failed: ${step.title} — ${result.error}`,
          data: { error: result.error },
          timestamp: Date.now(),
        });
      }

      return result;
    });

    // Execute the plan
    const executedPlan = await this.executionEngine.executePlan(planId);

    if (executedPlan.status === 'completed') {
      this.emitProgress({
        type: 'plan_completed',
        planId,
        message: `Plan completed: ${executedPlan.title}`,
        timestamp: Date.now(),
      });
    } else if (executedPlan.status === 'failed') {
      this.emitProgress({
        type: 'plan_failed',
        planId,
        message: `Plan failed: ${executedPlan.title}`,
        timestamp: Date.now(),
      });
    }

    // Update history
    this.executionHistory.set(planId, executedPlan);

    return executedPlan;
  }

  /** Reject a proposal — archives it */
  rejectProposal(planId: string): void {
    const plan = this.executionEngine.getPlan(planId);
    if (plan) {
      this.executionEngine.cancelPlan(planId);
      this.emitProgress({
        type: 'plan_cancelled',
        planId,
        message: `Proposal rejected: ${plan.title}`,
        timestamp: Date.now(),
      });
    }
  }

  /** Modify a proposal's step before approval */
  modifyProposalStep(
    planId: string,
    stepId: string,
    updates: Partial<{ title: string; description: string; params: Record<string, unknown>; riskLevel: 'low' | 'medium' | 'high' }>
  ): void {
    this.executionEngine.updateStep(stepId, updates);
  }

  /** Cancel an executing plan */
  cancelExecution(planId: string): void {
    this.executionEngine.cancelPlan(planId);
    this.emitProgress({
      type: 'plan_cancelled',
      planId,
      message: `Execution cancelled`,
      timestamp: Date.now(),
    });
  }

  /** Get execution history */
  getExecutionHistory(): ExecutionPlan[] {
    return Array.from(this.executionHistory.values());
  }

  /** Get a specific plan */
  getPlan(planId: string): ExecutionPlan | null {
    return this.executionEngine.getPlan(planId);
  }

  /** Subscribe to execution progress events */
  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /** Update the workspace root */
  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
    this.sandbox.addRoot(root);
  }

  // ─── Private: AI Response Parsing ───────────────────────────────────────

  /**
   * Parse an AI response to extract actionable execution intents.
   *
   * This uses pattern matching to detect code blocks, file references,
   * and action-oriented language in the AI's response.
   */
  private parseAIResponse(
    aiResponse: string,
    userMessage: string,
    context?: { workspaceRoot?: string; openFiles?: string[] }
  ): ParsedIntent | null {
    const steps: ParsedStep[] = [];
    let actionType: ParsedIntent['actionType'] = 'explain';
    let goal = userMessage;
    let confidence = 0;
    let riskLevel: ParsedIntent['riskLevel'] = 'low';
    const affectedPaths: string[] = [];

    const root = context?.workspaceRoot ?? this.workspaceRoot;

    // Detect code blocks with file path annotations
    // Pattern: ```language:path/to/file or ```language\n// File: path/to/file
    const codeBlockPattern = /```[\w]*\s*(?::([\w./-]+))?\n([\s\S]*?)```/g;
    let codeMatch;
    let codeBlockCount = 0;

    while ((codeMatch = codeBlockPattern.exec(aiResponse)) !== null) {
      codeBlockCount++;
      const filePath = codeMatch[1];
      const code = codeMatch[2];

      // Check for file path in the code block header
      if (filePath) {
        const fullPath = this.resolvePath(filePath, root);
        affectedPaths.push(fullPath);

        // Determine if this is creating a new file or editing an existing one
        const stepType: StepInput['type'] = 'file_write';
        riskLevel = 'medium';

        steps.push({
          title: `Write ${filePath}`,
          description: `Create/overwrite file ${filePath} with generated code`,
          type: stepType,
          params: {
            filePath: fullPath,
            content: code,
          },
          riskLevel: 'medium',
        });
      } else {
        // Code block without explicit file path — look for file reference in surrounding text
        const beforeBlock = aiResponse.slice(Math.max(0, codeMatch.index - 200), codeMatch.index);
        const fileRefMatch = beforeBlock.match(/(?:file|create|write|update|edit|modify)\s+[`"]?([\w./-]+\.\w+)[`"]?/i);

        if (fileRefMatch) {
          const refPath = this.resolvePath(fileRefMatch[1], root);
          affectedPaths.push(refPath);

          steps.push({
            title: `Write ${fileRefMatch[1]}`,
            description: `Write generated code to ${fileRefMatch[1]}`,
            type: 'file_write',
            params: {
              filePath: refPath,
              content: code,
            },
            riskLevel: 'medium',
          });
        } else {
          // Generic code generation step
          steps.push({
            title: `Code block ${codeBlockCount}`,
            description: 'Generated code — needs file path assignment',
            type: 'code_generation',
            params: {
              content: code,
              language: this.detectLanguage(codeMatch[0]),
            },
            riskLevel: 'low',
          });
        }
      }
    }

    // Detect search/replace patterns
    const searchReplacePattern = /<<<<<<< SEARCH\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>/g;
    let srMatch;
    let srCount = 0;

    while ((srMatch = searchReplacePattern.exec(aiResponse)) !== null) {
      srCount++;
      const searchStr = srMatch[1];
      const replaceStr = srMatch[2];

      // Look for file path context
      const beforeSR = aiResponse.slice(Math.max(0, srMatch.index - 300), srMatch.index);
      const fileRefMatch = beforeSR.match(/(?:file|in|edit|modify|update)\s+[`"]?([\w./-]+\.\w+)[`"]?/i);

      if (fileRefMatch) {
        const refPath = this.resolvePath(fileRefMatch[1], root);
        affectedPaths.push(refPath);

        steps.push({
          title: `Edit ${fileRefMatch[1]}`,
          description: `Apply search/replace edit to ${fileRefMatch[1]}`,
          type: 'file_edit',
          params: {
            filePath: refPath,
            edits: [{ search: searchStr, replace: replaceStr }],
          },
          riskLevel: 'medium',
          dependsOn: steps.length > 0 ? [steps[steps.length - 1].title] : undefined,
        });
      }
    }

    // Detect command execution requests
    const commandPattern =/(?:run|execute|install|npm|yarn|pip|cargo|go)\s+([^\n.]+)/gi;
    let cmdMatch;

    while ((cmdMatch = commandPattern.exec(aiResponse)) !== null) {
      const command = cmdMatch[1].trim();
      if (command && command.length > 2 && command.length < 200) {
        steps.push({
          title: `Run: ${command.slice(0, 60)}`,
          description: `Execute command: ${command}`,
          type: 'command',
          params: {
            command,
            cwd: root,
          },
          riskLevel: 'high',
        });
      }
    }

    // Determine overall action type and confidence
    if (steps.length === 0) {
      // Check if the user message implies an action
      const actionPatterns = /\b(create|build|make|write|generate|implement|add|refactor|fix|update|delete|remove|install)\b/i;
      if (actionPatterns.test(userMessage)) {
        confidence = 0.2; // Low confidence without specific steps
        actionType = 'multi_step';
      } else {
        return null; // No actionable intent
      }
    } else if (steps.length === 1) {
      actionType = steps[0].type === 'command' ? 'execute' : 'create';
      confidence = 0.7;
    } else {
      actionType = 'multi_step';
      confidence = 0.8;
    }

    // Adjust risk based on step types
    if (steps.some((s) => s.type === 'command')) {
      riskLevel = 'high';
    } else if (steps.some((s) => s.riskLevel === 'medium')) {
      riskLevel = 'medium';
    }

    return {
      goal,
      actionType,
      confidence,
      affectedPaths: [...new Set(affectedPaths)],
      riskLevel,
      steps,
    };
  }

  /** Validate steps against the sandbox */
  private validateSteps(steps: ParsedStep[]): StepInput[] {
    return steps.map((step) => {
      // Validate file paths in params against sandbox
      if (step.params.filePath) {
        const validation = this.sandbox.validate(step.params.filePath as string);
        if (!validation.allowed) {
          // Mark as high risk if path is outside sandbox
          step.riskLevel = 'high';
        }
      }

      return {
        title: step.title,
        description: step.description,
        type: step.type,
        params: step.params,
        riskLevel: step.riskLevel ?? 'low',
        dependsOn: step.dependsOn,
      };
    });
  }

  /** Generate a human-readable plan description */
  private generatePlanDescription(intent: ParsedIntent): string {
    const lines: string[] = [
      `Goal: ${intent.goal}`,
      `Action: ${intent.actionType}`,
      `Risk: ${intent.riskLevel}`,
      `Steps: ${intent.steps.length}`,
    ];

    if (intent.affectedPaths.length > 0) {
      lines.push(`Files: ${intent.affectedPaths.join(', ')}`);
    }

    return lines.join('\n');
  }

  /** Resolve a relative path to absolute */
  private resolvePath(filePath: string, root: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(root, filePath);
  }

  /** Detect programming language from code block header */
  private detectLanguage(codeBlock: string): string {
    const match = codeBlock.match(/```(\w+)/);
    if (match) {
      const lang = match[1].toLowerCase();
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        rs: 'rust',
        go: 'go',
        rb: 'ruby',
        java: 'java',
        css: 'css',
        html: 'html',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        md: 'markdown',
        sql: 'sql',
        sh: 'shell',
        bash: 'shell',
      };
      return languageMap[lang] ?? lang;
    }
    return 'unknown';
  }

  // ─── Private: Progress Events ──────────────────────────────────────────

  private emitProgress(event: ExecutionProgressEvent): void {
    for (const listener of this.progressListeners) {
      try {
        listener(event);
      } catch {
        // Listener error shouldn't break execution
      }
    }
  }

  // ─── Private: Abort Controller Access ──────────────────────────────────

  private activeAbortControllers: Map<string, AbortController> = new Map();

  private getActiveAbortController(planId: string): AbortController | undefined {
    return this.activeAbortControllers.get(planId);
  }
}

// Need to import path
import * as path from 'path';
