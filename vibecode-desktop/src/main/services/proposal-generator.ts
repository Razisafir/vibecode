// ============================================================
// VibeCode Desktop — Proposal Generator
// Bridges LLM responses → structured execution plans
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import {
  extractCodeBlocks,
  extractActions,
  extractFileOperations,
  extractCommands,
  isActionable,
  isDangerousCommand,
  isConfigFile,
  isSystemFile,
  ExtractedFileOperation,
  ExtractedCommand,
} from './llm-response-parser';
import {
  ExecutionEngine,
  ExecutionPlan,
  StepInput,
} from './execution-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutionIntent {
  id: string;
  type: 'file_create' | 'file_edit' | 'command' | 'analysis' | 'multi_step';
  title: string;
  description: string;
  files: AffectedFile[];
  steps: ProposalStep[];
  riskLevel: 'low' | 'medium' | 'high';
  estimatedImpact: string;
  canRollback: boolean;
}

export interface AffectedFile {
  path: string;
  action: 'create' | 'edit' | 'delete';
  description: string;
}

export interface ProposalStep {
  type: 'file_write' | 'file_edit' | 'command' | 'code_generation' | 'diff_apply';
  title: string;
  description: string;
  params: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high';
  dependsOn?: string[];
}

export interface ProposalCardData {
  id: string;
  type: 'file_create' | 'file_edit' | 'command' | 'analysis' | 'multi_step';
  title: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  affectedFiles: AffectedFile[];
  steps: ProposalStep[];
  estimatedImpact: string;
  canRollback: boolean;
  details: Record<string, unknown>;
  timestamp: number;
  planId?: string;
}

// ─── ProposalGenerator ──────────────────────────────────────────────────────

export class ProposalGenerator {
  private executionEngine: ExecutionEngine;

  constructor(executionEngine: ExecutionEngine) {
    this.executionEngine = executionEngine;
  }

  /**
   * Parse an LLM text response and extract structured execution intents.
   *
   * Returns empty array if no actionable intent is found.
   */
  parseLLMResponse(
    response: string,
    context?: { workspaceRoot?: string; projectId?: string }
  ): ExecutionIntent[] {
    // Quick check — skip purely conversational responses
    if (!isActionable(response)) {
      return [];
    }

    const fileOps = extractFileOperations(response);
    const commands = extractCommands(response);
    const actions = extractActions(response);
    const codeBlocks = extractCodeBlocks(response);

    // If we found nothing actionable, return empty
    if (fileOps.length === 0 && commands.length === 0 && actions.length === 0) {
      return [];
    }

    const intents: ExecutionIntent[] = [];

    // ── Group file operations into intents ──────────────────────────────
    if (fileOps.length > 0) {
      // If there are multiple file operations, create a multi_step intent
      if (fileOps.length === 1) {
        const op = fileOps[0];
        const intent = this.createFileIntent(op, response, context);
        if (intent) intents.push(intent);
      } else {
        // Group related file operations
        const intent = this.createMultiFileIntent(fileOps, response, context);
        if (intent) intents.push(intent);
      }
    }

    // ── Group commands into intents ─────────────────────────────────────
    for (const cmd of commands) {
      const intent = this.createCommandIntent(cmd, response, context);
      if (intent) intents.push(intent);
    }

    // ── If we have code blocks but no file operations, create intents ───
    if (fileOps.length === 0 && codeBlocks.length > 0) {
      for (const block of codeBlocks) {
        if (!block.code || block.code.trim().length === 0) continue;
        // Skip shell blocks — they'd be captured as commands
        if (['sh', 'bash', 'zsh', 'shell', 'cmd'].includes(block.language.toLowerCase())) continue;

        const filePath = block.filePath || `generated.${languageToExtension(block.language)}`;
        const op: ExtractedFileOperation = {
          type: 'create',
          filePath,
          content: block.code,
        };
        const intent = this.createFileIntent(op, response, context);
        if (intent) intents.push(intent);
      }
    }

    return intents;
  }

  /**
   * Convert an ExecutionIntent into an ExecutionPlan + ProposalCardData.
   *
   * The plan is created in 'draft' status, ready for user approval.
   */
  generateProposalFromIntent(intent: ExecutionIntent): {
    plan: ExecutionPlan;
    proposalCard: ProposalCardData;
  } {
    // Convert proposal steps to execution step inputs
    const stepInputs: StepInput[] = intent.steps.map((step, _idx) => ({
      title: step.title,
      description: step.description,
      type: step.type as ExecutionPlan['steps'][number]['type'],
      dependsOn: step.dependsOn,
      params: step.params,
      riskLevel: step.riskLevel,
      requiresApproval: step.riskLevel === 'high',
    }));

    // Create the execution plan (in 'draft' status)
    const plan = this.executionEngine.createPlan(
      intent.title,
      intent.description,
      stepInputs
    );

    // Build the proposal card data for the renderer
    const proposalCard: ProposalCardData = {
      id: intent.id,
      type: intent.type,
      title: intent.title,
      description: intent.description,
      riskLevel: intent.riskLevel,
      status: 'pending',
      affectedFiles: intent.files,
      steps: intent.steps,
      estimatedImpact: intent.estimatedImpact,
      canRollback: intent.canRollback,
      details: {
        planId: plan.id,
        stepCount: intent.steps.length,
        fileCount: intent.files.length,
        createdAt: Date.now(),
      },
      timestamp: Date.now(),
      planId: plan.id,
    };

    return { plan, proposalCard };
  }

  /**
   * Assess the risk level of an execution intent.
   *
   * Low: creating new files, minor edits to non-critical files
   * Medium: editing existing source files, running safe commands
   * High: deleting files, destructive commands, editing config, package.json
   */
  assessRisk(intent: ExecutionIntent): 'low' | 'medium' | 'high' {
    // If any step is high risk, the intent is high risk
    if (intent.steps.some((s) => s.riskLevel === 'high')) {
      return 'high';
    }

    // If any file is being deleted → high
    if (intent.files.some((f) => f.action === 'delete')) {
      return 'high';
    }

    // If any file is a config or system file → high
    if (intent.files.some((f) => isConfigFile(f.path) || isSystemFile(f.path))) {
      return 'high';
    }

    // If any command is dangerous → high
    for (const step of intent.steps) {
      if (step.type === 'command' && step.params.command) {
        if (isDangerousCommand(step.params.command as string)) {
          return 'high';
        }
      }
    }

    // If editing existing files → medium
    if (intent.files.some((f) => f.action === 'edit')) {
      return 'medium';
    }

    // If running commands → medium
    if (intent.steps.some((s) => s.type === 'command')) {
      return 'medium';
    }

    // Large number of files affected → medium
    if (intent.files.length > 5) {
      return 'medium';
    }

    // Default: low
    return 'low';
  }

  // ─── Intent Construction Helpers ──────────────────────────────────────────

  private createFileIntent(
    op: ExtractedFileOperation,
    _response: string,
    _context?: { workspaceRoot?: string; projectId?: string }
  ): ExecutionIntent | null {
    const intentId = uuidv4();
    const _stepId = uuidv4();

    const actionLabel =
      op.type === 'create' ? 'Create' : op.type === 'edit' ? 'Edit' : 'Delete';

    const stepType = op.type === 'create' ? 'file_write' : op.type === 'edit' ? 'file_edit' : 'file_write';
    const intentType = op.type === 'create' ? 'file_create' : op.type === 'edit' ? 'file_edit' : 'file_create';

    const step: ProposalStep = {
      type: stepType,
      title: `${actionLabel} ${op.filePath}`,
      description: op.content
        ? `${actionLabel} file ${op.filePath} with ${op.content.split('\n').length} lines of code`
        : `${actionLabel} file ${op.filePath}`,
      params: {
        filePath: op.filePath,
        ...(op.content ? { content: op.content } : {}),
        ...(op.type === 'create' ? { createDirs: true } : {}),
      },
      riskLevel: this.assessFileRisk(op),
    };

    const files: AffectedFile[] = [
      {
        path: op.filePath,
        action: op.type,
        description: step.description,
      },
    ];

    const intent: ExecutionIntent = {
      id: intentId,
      type: intentType,
      title: `${actionLabel} ${op.filePath}`,
      description: step.description,
      files,
      steps: [step],
      riskLevel: 'low', // Will be assessed below
      estimatedImpact: this.estimateFileImpact(op),
      canRollback: op.type !== 'delete' || !!op.content,
    };

    intent.riskLevel = this.assessRisk(intent);
    return intent;
  }

  private createMultiFileIntent(
    ops: ExtractedFileOperation[],
    _response: string,
    _context?: { workspaceRoot?: string; projectId?: string }
  ): ExecutionIntent | null {
    const intentId = uuidv4();

    const files: AffectedFile[] = ops.map((op) => ({
      path: op.filePath,
      action: op.type,
      description: `${op.type} ${op.filePath}`,
    }));

    const stepIds = ops.map(() => uuidv4());

    const steps: ProposalStep[] = ops.map((op, idx) => {
      const actionLabel =
        op.type === 'create' ? 'Create' : op.type === 'edit' ? 'Edit' : 'Delete';
      const stepType = op.type === 'create' ? 'file_write' : op.type === 'edit' ? 'file_edit' : 'file_write';

      // Each step after the first depends on the previous one
      const dependsOn = idx > 0 ? [stepIds[idx - 1]] : undefined;

      return {
        type: stepType,
        title: `${actionLabel} ${op.filePath}`,
        description: op.content
          ? `${actionLabel} file ${op.filePath} with ${op.content.split('\n').length} lines`
          : `${actionLabel} file ${op.filePath}`,
        params: {
          filePath: op.filePath,
          ...(op.content ? { content: op.content } : {}),
          ...(op.type === 'create' ? { createDirs: true } : {}),
        },
        riskLevel: this.assessFileRisk(op),
        dependsOn,
      };
    });

    const intent: ExecutionIntent = {
      id: intentId,
      type: 'multi_step',
      title: `Multi-file operation (${ops.length} files)`,
      description: `Create/edit ${ops.length} files: ${ops.map((o) => o.filePath).join(', ')}`,
      files,
      steps,
      riskLevel: 'low',
      estimatedImpact: `Affects ${ops.length} files: ${files.map((f) => f.path).join(', ')}`,
      canRollback: true,
    };

    intent.riskLevel = this.assessRisk(intent);
    return intent;
  }

  private createCommandIntent(
    cmd: ExtractedCommand,
    response: string,
    context?: { workspaceRoot?: string; projectId?: string }
  ): ExecutionIntent | null {
    const intentId = uuidv4();

    const isDangerous = isDangerousCommand(cmd.command);

    const step: ProposalStep = {
      type: 'command',
      title: `Run: ${cmd.command}`,
      description: cmd.description || `Execute command: ${cmd.command}`,
      params: {
        command: cmd.command,
        cwd: cmd.cwd || context?.workspaceRoot,
        timeout: 60000,
      },
      riskLevel: isDangerous ? 'high' : 'medium',
    };

    const intent: ExecutionIntent = {
      id: intentId,
      type: 'command',
      title: `Run command: ${cmd.command}`,
      description: cmd.description || `Execute: ${cmd.command}`,
      files: [],
      steps: [step],
      riskLevel: isDangerous ? 'high' : 'medium',
      estimatedImpact: isDangerous
        ? 'This command may have destructive effects. Please review carefully.'
        : `Executes: ${cmd.command}`,
      canRollback: false,
    };

    return intent;
  }

  // ─── Risk Assessment Helpers ──────────────────────────────────────────────

  private assessFileRisk(op: ExtractedFileOperation): 'low' | 'medium' | 'high' {
    if (op.type === 'delete') return 'high';
    if (isConfigFile(op.filePath)) return 'high';
    if (isSystemFile(op.filePath)) return 'high';
    if (op.type === 'edit') return 'medium';
    return 'low';
  }

  private estimateFileImpact(op: ExtractedFileOperation): string {
    const lines = op.content ? op.content.split('\n').length : 0;
    const actionLabel =
      op.type === 'create' ? 'Creates' : op.type === 'edit' ? 'Modifies' : 'Deletes';

    if (op.type === 'delete') {
      return `${actionLabel} ${op.filePath} — this action cannot be automatically undone`;
    }

    if (op.type === 'edit') {
      return `${actionLabel} ${op.filePath} — original file will be backed up`;
    }

    return `${actionLabel} new file ${op.filePath}${lines > 0 ? ` (${lines} lines)` : ''}`;
  }
}

// ─── Module-level singleton ─────────────────────────────────────────────────

let proposalGenerator: ProposalGenerator | null = null;

/**
 * Initialize or get the proposal generator.
 * Must be called with an execution engine at least once.
 */
export function getProposalGenerator(engine?: ExecutionEngine): ProposalGenerator {
  if (!proposalGenerator && engine) {
    proposalGenerator = new ProposalGenerator(engine);
  }
  if (!proposalGenerator) {
    throw new Error('ProposalGenerator not initialized — call getProposalGenerator(engine) first');
  }
  return proposalGenerator;
}

/**
 * Reset the proposal generator (useful when workspace changes).
 */
export function resetProposalGenerator(engine: ExecutionEngine): ProposalGenerator {
  proposalGenerator = new ProposalGenerator(engine);
  return proposalGenerator;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function languageToExtension(language: string): string {
  const map: Record<string, string> = {
    typescript: 'ts',
    ts: 'ts',
    typescriptreact: 'tsx',
    tsx: 'tsx',
    javascript: 'js',
    js: 'js',
    javascriptreact: 'jsx',
    jsx: 'jsx',
    python: 'py',
    py: 'py',
    rust: 'rs',
    go: 'go',
    java: 'java',
    ruby: 'rb',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yml',
    sql: 'sql',
    graphql: 'graphql',
    markdown: 'md',
    md: 'md',
    xml: 'xml',
    toml: 'toml',
  };
  return map[language.toLowerCase()] || 'txt';
}
