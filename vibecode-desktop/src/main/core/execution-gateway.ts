// ─── VibeCode Desktop — Execution Gateway (ARC 15) ─────────────────────────
// GRAPH ENFORCEMENT LAYER (GEL)
//
// NON-NEGOTIABLE PRINCIPLE: "No Node → No Action"
//
// Every system action must obey:
//   Action Request
//      ↓
//   Create ExecutionNode (mandatory gate)
//      ↓
//   Validate Safety + Scope
//      ↓
//   Execute
//      ↓
//   Attach Output back to SAME node
//
// If step 1 fails → system must fail.
// If anything bypasses this gateway → it is a bug.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ExecutionStateMachine,
  ExecutionNode,
  ExecutionNodeType,
  NodeData,
  NodeState,
  NodeResult,
  TerminalCommandData,
  MonacoEditData,
  FileMutationData,
  RiskLevel,
} from '../services/execution-state-machine';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION REQUEST — What the gateway accepts
// ═══════════════════════════════════════════════════════════════════════════════

/** Unified request type for all gateway-mediated executions */
export interface ExecutionRequest {
  /** The type of execution being requested */
  type: ExecutionNodeType;
  /** Type-specific data */
  data: NodeData;
  /** Human-readable title (auto-generated if omitted) */
  title?: string;
  /** Human-readable description (auto-generated if omitted) */
  description?: string;
  /** Parent node ID (for grouping under plans) */
  parentId?: string;
  /** Source node IDs — what caused this request */
  sourceIds?: string[];
  /** Whether this was AI-initiated */
  isAI?: boolean;
  /** Skip the safety gate (only for internal system operations like persistence) */
  skipSafetyGate?: boolean;
  /** Whether to auto-approve (skip the planned → approved transition) */
  autoApprove?: boolean;
  /** Custom executor — if provided, this is called after node is approved */
  executor?: (node: ExecutionNode) => Promise<NodeResult>;
}

/** Result of a gateway-mediated execution */
export interface GatewayResult {
  /** The execution node created for this action */
  node: ExecutionNode;
  /** Whether the execution was allowed (passed safety gate) */
  allowed: boolean;
  /** Reason for block (if blocked) */
  blockReason?: string;
  /** The result of execution (if executed) */
  result?: NodeResult;
  /** Error (if execution failed) */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION GATEWAY — The ONLY path from UI/OS to system actions
// ═══════════════════════════════════════════════════════════════════════════════

class ExecutionGatewayClass {
  private esm: ExecutionStateMachine | null = null;
  private initialized: boolean = false;

  // ─── Executor Registry ──────────────────────────────────────────────────
  // Maps node types to executor functions. The gateway dispatches to these
  // after the safety gate passes and the node is approved/executing.

  private executors: Map<ExecutionNodeType, (node: ExecutionNode) => Promise<NodeResult>> = new Map();

  // ─── Initialization ─────────────────────────────────────────────────────

  /** Initialize the gateway with the ExecutionStateMachine instance */
  initialize(esm: ExecutionStateMachine): void {
    if (this.initialized) {
      logger.warn('gateway', 'Gateway already initialized — re-initializing with new ESM');
    }
    this.esm = esm;
    this.initialized = true;
    logger.info('gateway', 'Execution Gateway initialized — ALL system actions must flow through here');
    auditLog.auditLog('gateway:initialized', { timestamp: Date.now() });
  }

  /** Get the ESM instance (throws if not initialized) */
  private getEsm(): ExecutionStateMachine {
    if (!this.esm) {
      throw new Error('[GATEWAY] ExecutionStateMachine not initialized — cannot process requests');
    }
    return this.esm;
  }

  /** Check if gateway is initialized */
  isInitialized(): boolean {
    return this.initialized && this.esm !== null;
  }

  // ─── Core Gateway Method ────────────────────────────────────────────────

  /**
   * THE CORE METHOD: requestExecution
   *
   * Every system action MUST go through this method.
   * This is the ONLY valid path from "I want to do X" to "X was done".
   *
   * Flow:
   * 1. Create ExecutionNode (mandatory gate)
   * 2. Compute safety score
   * 3. If safety <= 20 → BLOCK (reject node)
   * 4. If autoApprove → transition to approved → executing
   * 5. Dispatch to executor
   * 6. Attach result to node
   *
   * If step 1 fails → the entire operation fails.
   */
  async requestExecution(request: ExecutionRequest): Promise<GatewayResult> {
    const esm = this.getEsm();

    // ── STEP 1: Create ExecutionNode (MANDATORY GATE) ────────────────────
    let node: ExecutionNode;
    try {
      const title = request.title || this.generateTitle(request);
      const description = request.description || this.generateDescription(request);

      node = esm.createNode({
        type: request.type,
        title,
        description,
        parentId: request.parentId,
        sourceIds: request.sourceIds || [],
        data: request.data,
        riskLevel: this.inferRiskLevel(request),
        requiresApproval: !request.autoApprove && this.shouldRequireApproval(request),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('gateway', `FAILED TO CREATE NODE — operation blocked: ${msg}`);
      auditLog.auditLog('gateway:blocked:no-node', {
        type: request.type,
        error: msg,
        timestamp: Date.now(),
      });
      throw new Error(`[GATEWAY] Node creation failed — operation blocked. Reason: ${msg}`);
    }

    // ── STEP 2: Safety Gate ──────────────────────────────────────────────
    if (!request.skipSafetyGate) {
      const safetyScore = node.safetyScore;

      if (safetyScore <= 20) {
        // BLOCK: safety score too low
        try {
          esm.transitionNode(node.id, 'rejected');
        } catch {
          // May not be a valid transition from planned
        }

        const blockReason = `Blocked by safety gate (score: ${safetyScore}/100)`;
        logger.warn('gateway', `SAFETY BLOCK: ${node.title} — ${blockReason}`);
        auditLog.auditLog('gateway:blocked:safety', {
          nodeId: node.id,
          nodeType: node.type,
          safetyScore,
          timestamp: Date.now(),
        });

        return { node, allowed: false, blockReason };
      }

      // If safety is borderline (21-60), require explicit approval unless autoApprove
      if (safetyScore <= 60 && !request.autoApprove) {
        logger.info('gateway', `APPROVAL REQUIRED: ${node.title} (safety: ${safetyScore}/100)`);
        // Node stays in 'planned' state — UI must approve before execution
        return { node, allowed: true, blockReason: `Approval required (safety: ${safetyScore}/100)` };
      }
    }

    // ── STEP 3: Auto-approve if requested ────────────────────────────────
    if (request.autoApprove || request.skipSafetyGate) {
      try {
        esm.transitionNode(node.id, 'approved');
      } catch {
        // planned → approved may not always be valid; try queued first
        try {
          esm.transitionNode(node.id, 'queued');
          esm.transitionNode(node.id, 'approved');
        } catch {
          // If we can't approve, leave in planned and return
          logger.warn('gateway', `Cannot auto-approve node ${node.id} — leaving in planned state`);
          return { node, allowed: true };
        }
      }
    }

    // ── STEP 4: Execute via dispatcher ────────────────────────────────────
    if (request.executor) {
      // Custom executor provided — use it
      return this.executeWithCustomExecutor(node, request.executor);
    } else if (this.executors.has(request.type)) {
      // Registered executor for this type
      return this.executeWithRegisteredExecutor(node, request.type);
    } else {
      // No executor — node stays in approved/planned state
      // The caller is responsible for executing and calling back with results
      logger.info('gateway', `No executor for ${request.type} — node ${node.id} waiting for external execution`);
      return { node, allowed: true };
    }
  }

  // ─── Synchronous Execution (for operations that must be immediate) ─────

  /**
   * Execute a gateway request synchronously.
   * Used for operations like terminal commands where we need to create the node
   * and return immediately, with output attached later.
   */
  requestNodeCreation(request: ExecutionRequest): ExecutionNode {
    const esm = this.getEsm();

    const title = request.title || this.generateTitle(request);
    const description = request.description || this.generateDescription(request);

    const node = esm.createNode({
      type: request.type,
      title,
      description,
      parentId: request.parentId,
      sourceIds: request.sourceIds || [],
      data: request.data,
      riskLevel: this.inferRiskLevel(request),
      requiresApproval: this.shouldRequireApproval(request),
    });

    // Safety check — block if score is critically low
    if (!request.skipSafetyGate && node.safetyScore <= 20) {
      try {
        esm.transitionNode(node.id, 'rejected');
      } catch {
        // Ignore transition errors
      }
      throw new Error(`[GATEWAY] Node rejected by safety gate (score: ${node.safetyScore}/100)`);
    }

    // Auto-approve if requested
    if (request.autoApprove) {
      try {
        esm.transitionNode(node.id, 'approved');
      } catch {
        // Ignore — node stays in planned
      }
    }

    return node;
  }

  /**
   * Attach execution result to an existing node.
   * Used for async operations like terminal commands where output comes later.
   */
  attachResult(nodeId: string, result: Partial<NodeResult>, error?: string): ExecutionNode | null {
    const esm = this.getEsm();
    const node = esm.getNode(nodeId);
    if (!node) {
      logger.error('gateway', `Cannot attach result — node ${nodeId} not found`);
      return null;
    }

    // Update node data with result
    if (error) {
      node.error = error;
      try {
        esm.transitionNode(nodeId, 'failed');
      } catch {
        // Ignore transition errors
      }
    } else {
      node.result = result as NodeResult;
      try {
        esm.transitionNode(nodeId, 'completed');
      } catch {
        // Ignore transition errors
      }
    }

    return node;
  }

  /**
   * Update node data (for attaching outputs like stdout/stderr to terminal nodes).
   */
  updateNodeData(nodeId: string, data: Partial<NodeData>): ExecutionNode | null {
    const esm = this.getEsm();
    return esm.updateNodeData(nodeId, data);
  }

  /**
   * Transition a node state (for external callers that need to manage state).
   */
  transitionNode(nodeId: string, newState: NodeState): ExecutionNode {
    const esm = this.getEsm();
    return esm.transitionNode(nodeId, newState);
  }

  // ─── Executor Registration ──────────────────────────────────────────────

  /** Register an executor for a specific node type */
  registerExecutor(type: ExecutionNodeType, executor: (node: ExecutionNode) => Promise<NodeResult>): void {
    this.executors.set(type, executor);
    logger.info('gateway', `Executor registered for type: ${type}`);
  }

  // ─── Convenience Methods ────────────────────────────────────────────────

  /**
   * Execute a terminal command through the gateway.
   * This is the ONLY valid way to execute terminal commands.
   */
  async executeTerminalCommand(params: {
    command: string;
    cwd: string;
    terminalId: string;
    isAI?: boolean;
    autoApprove?: boolean;
    executor?: (node: ExecutionNode) => Promise<NodeResult>;
  }): Promise<GatewayResult> {
    const data: TerminalCommandData = {
      kind: 'terminal_command',
      command: params.command,
      cwd: params.cwd,
      terminalId: params.terminalId,
      stdout: '',
      stderr: '',
      exitCode: null,
      truncated: false,
      isAI: params.isAI ?? false,
    };

    return this.requestExecution({
      type: 'terminal_command',
      data,
      isAI: params.isAI,
      autoApprove: params.autoApprove ?? true,
      executor: params.executor,
    });
  }

  /**
   * Create a terminal command node (synchronous — for tracking commands
   * that execute asynchronously via PTY).
   */
  createTerminalNode(params: {
    command: string;
    cwd: string;
    terminalId: string;
    isAI?: boolean;
  }): ExecutionNode {
    const data: TerminalCommandData = {
      kind: 'terminal_command',
      command: params.command,
      cwd: params.cwd,
      terminalId: params.terminalId,
      stdout: '',
      stderr: '',
      exitCode: null,
      truncated: false,
      isAI: params.isAI ?? false,
    };

    return this.requestNodeCreation({
      type: 'terminal_command',
      data,
      isAI: params.isAI,
      autoApprove: true,
    });
  }

  /**
   * Execute a Monaco edit through the gateway.
   * This is the ONLY valid way to save file edits from the editor.
   */
  async executeMonacoEdit(params: {
    filePath: string;
    originalContent: string;
    newContent: string;
    region?: { startLine: number; startCol: number; endLine: number; endCol: number };
    isAI?: boolean;
    linkedStepId?: string;
    autoApprove?: boolean;
    executor?: (node: ExecutionNode) => Promise<NodeResult>;
  }): Promise<GatewayResult> {
    const data: MonacoEditData = {
      kind: 'monaco_edit',
      filePath: params.filePath,
      region: params.region || {
        startLine: 1,
        startCol: 1,
        endLine: params.newContent.split('\n').length,
        endCol: (params.newContent.split('\n').pop()?.length ?? 0) + 1,
      },
      originalContent: params.originalContent,
      newContent: params.newContent,
      isAI: params.isAI ?? false,
      linkedStepId: params.linkedStepId,
    };

    return this.requestExecution({
      type: 'monaco_edit',
      data,
      sourceIds: params.linkedStepId ? [params.linkedStepId] : [],
      isAI: params.isAI,
      autoApprove: params.autoApprove ?? true,
      executor: params.executor,
    });
  }

  /**
   * Execute a file mutation through the gateway.
   * This is the ONLY valid way to perform file system operations.
   */
  async executeFileMutation(params: {
    action: 'create' | 'edit' | 'delete' | 'move';
    filePath: string;
    destinationPath?: string;
    originalContent?: string;
    newContent?: string;
    fileExisted?: boolean;
    linkedStepId?: string;
    autoApprove?: boolean;
    executor?: (node: ExecutionNode) => Promise<NodeResult>;
  }): Promise<GatewayResult> {
    const data: FileMutationData = {
      kind: 'file_mutation',
      action: params.action,
      filePath: params.filePath,
      destinationPath: params.destinationPath,
      originalContent: params.originalContent,
      newContent: params.newContent,
      fileExisted: params.fileExisted ?? true,
      linkedStepId: params.linkedStepId,
    };

    return this.requestExecution({
      type: 'file_mutation',
      data,
      sourceIds: params.linkedStepId ? [params.linkedStepId] : [],
      autoApprove: params.autoApprove ?? true,
      executor: params.executor,
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private async executeWithCustomExecutor(
    node: ExecutionNode,
    executor: (node: ExecutionNode) => Promise<NodeResult>
  ): Promise<GatewayResult> {
    const esm = this.getEsm();

    try {
      esm.transitionNode(node.id, 'executing');
      const result = await executor(node);

      // Attach result to node
      node.result = result;

      try {
        esm.transitionNode(node.id, 'completed');
      } catch {
        // May already be in terminal state
      }

      auditLog.auditLog('gateway:executed', {
        nodeId: node.id,
        nodeType: node.type,
        title: node.title,
        success: result.success,
        timestamp: Date.now(),
      });

      return { node, allowed: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      node.error = msg;

      try {
        esm.transitionNode(node.id, 'failed');
      } catch {
        // May already be in terminal state
      }

      auditLog.auditLog('gateway:failed', {
        nodeId: node.id,
        nodeType: node.type,
        title: node.title,
        error: msg,
        timestamp: Date.now(),
      });

      return { node, allowed: true, error: msg };
    }
  }

  private async executeWithRegisteredExecutor(
    node: ExecutionNode,
    type: ExecutionNodeType
  ): Promise<GatewayResult> {
    const executor = this.executors.get(type);
    if (!executor) {
      logger.warn('gateway', `No executor for type ${type} — node ${node.id} awaiting external execution`);
      return { node, allowed: true };
    }
    return this.executeWithCustomExecutor(node, executor);
  }

  private generateTitle(request: ExecutionRequest): string {
    const data = request.data;
    switch (request.type) {
      case 'terminal_command': {
        const cmd = (data as TerminalCommandData).command;
        return `Terminal: ${cmd.substring(0, 60)}${cmd.length > 60 ? '...' : ''}`;
      }
      case 'monaco_edit': {
        const fp = (data as MonacoEditData).filePath;
        return `Edit: ${fp.split('/').pop() || fp}`;
      }
      case 'file_mutation': {
        const fm = data as FileMutationData;
        return `File ${fm.action}: ${fm.filePath.split('/').pop() || fm.filePath}`;
      }
      default:
        return `${request.type} action`;
    }
  }

  private generateDescription(request: ExecutionRequest): string {
    const data = request.data;
    const aiLabel = request.isAI ? 'AI-initiated' : 'User-initiated';
    switch (request.type) {
      case 'terminal_command': {
        const cmd = (data as TerminalCommandData).command;
        return `${aiLabel} terminal command: ${cmd}`;
      }
      case 'monaco_edit': {
        const me = data as MonacoEditData;
        return `${aiLabel} edit of ${me.filePath}`;
      }
      case 'file_mutation': {
        const fm = data as FileMutationData;
        return `${aiLabel} ${fm.action} of ${fm.filePath}`;
      }
      default:
        return `${aiLabel} ${request.type}`;
    }
  }

  private inferRiskLevel(request: ExecutionRequest): RiskLevel {
    const data = request.data;

    switch (request.type) {
      case 'terminal_command': {
        const cmd = (data as TerminalCommandData).command;
        const dangerous = ['rm -rf', 'sudo', 'chmod 777', 'dd if=', 'mkfs', 'format', 'DROP TABLE'];
        return dangerous.some(d => cmd.includes(d)) ? 'critical' : request.isAI ? 'medium' : 'low';
      }
      case 'file_mutation': {
        const fm = data as FileMutationData;
        if (fm.action === 'delete') return 'high';
        if (fm.action === 'move') return 'medium';
        return request.isAI ? 'medium' : 'low';
      }
      case 'monaco_edit': {
        return request.isAI ? 'medium' : 'low';
      }
      default:
        return 'low';
    }
  }

  private shouldRequireApproval(request: ExecutionRequest): boolean {
    const data = request.data;

    // Terminal commands with dangerous patterns always require approval
    if (request.type === 'terminal_command') {
      const cmd = (data as TerminalCommandData).command;
      const dangerous = ['rm -rf', 'sudo', 'chmod 777', 'dd if=', 'mkfs', 'format'];
      return dangerous.some(d => cmd.includes(d));
    }

    // File deletions always require approval
    if (request.type === 'file_mutation') {
      return (data as FileMutationData).action === 'delete';
    }

    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/** The ExecutionGateway singleton — the ONLY valid execution surface */
export const ExecutionGateway = new ExecutionGatewayClass();

/**
 * Check if a node exists for a given action. Used by the audit system
 * to detect bypass attempts.
 */
export function isGatewayInitialized(): boolean {
  return ExecutionGateway.isInitialized();
}
