// ─── VibeCode Desktop — Execution Gateway (ARC 19 CONSOLIDATED) ──────────────
// UNIFIED EXECUTION GATEWAY
//
// ONE execution pipeline, ONE authority graph, ONE source of truth.
//
// This module is now the SOLE enforcement point. The separate execution-audit
// system has been merged into this gateway. No duplicated checks across layers.
//
// NON-NEGOTIABLE PRINCIPLE: "No Node → No Action"
//
// Pipeline:
//   User/AI Action → Gateway.requestExecution()
//       → ESM.createNode() (safety score computed)
//       → Safety Gate (score ≤ 20 = BLOCK)
//       → Executor dispatch
//       → Kernel execution
//       → ESM.updateNode() → graph update → IPC → UI sync
//
// ARC 19 Changes:
//   - Removed `skipSafetyGate` flag (no escape hatches)
//   - Merged audit authorization tracking (was in execution-audit.ts)
//   - Removed duplicate risk inference (ESM safety engine is THE authority)
//   - Removed duplicate shouldRequireApproval (ESM handles this)
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
// AUTHORIZATION TRACKING (merged from execution-audit.ts)
// The gateway now tracks which operations it has authorized. This replaces
// the separate execution-audit module. One system, one responsibility.
// ═══════════════════════════════════════════════════════════════════════════════

/** Tracks which file paths have been authorized by the gateway */
const authorizedFsOps: Map<string, { nodeId: string; timestamp: number; operation: string }> = new Map();

/** Tracks which terminal sessions have been authorized by the gateway */
const authorizedTerminalOps: Map<string, { nodeId: string; timestamp: number; command: string }> = new Map();

/** Authorization validity window (ms) */
const AUTHORIZATION_WINDOW = 60000; // 60 seconds

// ═══════════════════════════════════════════════════════════════════════════════
// VIOLATION TRACKING (merged from execution-audit.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export type ViolationSeverity = 'warn' | 'error' | 'critical';

export interface GraphViolation {
  type: 'fs_write_no_node' | 'fs_delete_no_node' | 'fs_rename_no_node' | 'terminal_spawn_no_node' | 'monaco_save_no_node' | 'exec_no_node';
  description: string;
  target: string;
  stack?: string;
  timestamp: number;
  severity: ViolationSeverity;
}

const violations: GraphViolation[] = [];
const violationCounts: Record<string, number> = {};

function recordViolation(violation: GraphViolation): void {
  violations.push(violation);
  const count = violationCounts[violation.type] || 0;
  violationCounts[violation.type] = count + 1;
  logger.error('gateway', `CRITICAL BYPASS: ${violation.description}`);
  auditLog.auditLog('gateway:bypass:critical', violation);
  throw new Error(`[GATEWAY] BYPASS BLOCKED: ${violation.description}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION GATEWAY — The ONLY path from UI/OS to system actions
// ═══════════════════════════════════════════════════════════════════════════════

class ExecutionGatewayClass {
  private esm: ExecutionStateMachine | null = null;
  private initialized: boolean = false;

  /** Maps node types to executor functions */
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

  private getEsm(): ExecutionStateMachine {
    if (!this.esm) {
      throw new Error('[GATEWAY] ExecutionStateMachine not initialized — cannot process requests');
    }
    return this.esm;
  }

  isInitialized(): boolean {
    return this.initialized && this.esm !== null;
  }

  // ─── Core Gateway Method ────────────────────────────────────────────────

  /**
   * THE CORE METHOD: requestExecution
   *
   * Every system action MUST go through this method.
   * This is the ONLY valid path from "I want to do X" to "X was done".
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
        // Risk level and requiresApproval are now determined by ESM safety engine
        // No more duplicate inference in the gateway
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

    // ── STEP 2: Safety Gate (ESM safety score is THE authority) ───────────
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
      return { node, allowed: true, blockReason: `Approval required (safety: ${safetyScore}/100)` };
    }

    // ── STEP 3: Auto-approve if requested ────────────────────────────────
    if (request.autoApprove) {
      try {
        esm.transitionNode(node.id, 'approved');
      } catch {
        try {
          esm.transitionNode(node.id, 'queued');
          esm.transitionNode(node.id, 'approved');
        } catch {
          logger.warn('gateway', `Cannot auto-approve node ${node.id} — leaving in planned state`);
          return { node, allowed: true };
        }
      }
    }

    // ── STEP 4: Execute via dispatcher ────────────────────────────────────
    if (request.executor) {
      return this.executeWithCustomExecutor(node, request.executor);
    } else if (this.executors.has(request.type)) {
      return this.executeWithRegisteredExecutor(node, request.type);
    } else {
      logger.info('gateway', `No executor for ${request.type} — node ${node.id} waiting for external execution`);
      return { node, allowed: true };
    }
  }

  // ─── Synchronous Node Creation ──────────────────────────────────────────

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
    });

    // Safety check — block if score is critically low
    if (node.safetyScore <= 20) {
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

  // ─── Result Attachment ──────────────────────────────────────────────────

  attachResult(nodeId: string, result: Partial<NodeResult>, error?: string): ExecutionNode | null {
    const esm = this.getEsm();
    const node = esm.getNode(nodeId);
    if (!node) {
      logger.error('gateway', `Cannot attach result — node ${nodeId} not found`);
      return null;
    }

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

  updateNodeData(nodeId: string, data: Partial<NodeData>): ExecutionNode | null {
    const esm = this.getEsm();
    return esm.updateNodeData(nodeId, data);
  }

  transitionNode(nodeId: string, newState: NodeState): ExecutionNode {
    const esm = this.getEsm();
    return esm.transitionNode(nodeId, newState);
  }

  // ─── Executor Registration ──────────────────────────────────────────────

  registerExecutor(type: ExecutionNodeType, executor: (node: ExecutionNode) => Promise<NodeResult>): void {
    this.executors.set(type, executor);
    logger.info('gateway', `Executor registered for type: ${type}`);
  }

  // ─── Convenience Methods ────────────────────────────────────────────────

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

  // ─── Authorization API (merged from execution-audit.ts) ────────────────

  /** Register that an FS operation was authorized by this gateway */
  authorizeFsOp(filePath: string, nodeId: string, operation: string): void {
    authorizedFsOps.set(filePath, { nodeId, timestamp: Date.now(), operation });
  }

  /** Register that a terminal operation was authorized by this gateway */
  authorizeTerminalOp(sessionId: string, nodeId: string, command: string): void {
    authorizedTerminalOps.set(`${sessionId}:${command}`, { nodeId, timestamp: Date.now(), command });
  }

  /** Check if an FS operation was authorized. Returns true if authorized, false if bypass */
  checkFsAuthorization(filePath: string, operation: string): boolean {
    const authorized = authorizedFsOps.get(filePath);
    if (authorized && Date.now() - authorized.timestamp < AUTHORIZATION_WINDOW) {
      return true;
    }

    // Gateway must be initialized for any mutation
    if (!this.initialized) {
      recordViolation({
        type: operation === 'delete' ? 'fs_delete_no_node' : operation === 'rename' ? 'fs_rename_no_node' : 'fs_write_no_node',
        description: `FS ${operation} on "${filePath}" BLOCKED — Gateway not initialized`,
        target: filePath,
        stack: new Error().stack,
        timestamp: Date.now(),
        severity: 'critical',
      });
      return false;
    }

    recordViolation({
      type: operation === 'delete' ? 'fs_delete_no_node' : operation === 'rename' ? 'fs_rename_no_node' : 'fs_write_no_node',
      description: `FS ${operation} on "${filePath}" without gateway authorization`,
      target: filePath,
      stack: new Error().stack,
      timestamp: Date.now(),
      severity: 'critical',
    });
    return false;
  }

  /** Check if a terminal operation was authorized */
  checkTerminalAuthorization(sessionId: string, command: string): boolean {
    const key = `${sessionId}:${command}`;
    const authorized = authorizedTerminalOps.get(key);
    if (authorized && Date.now() - authorized.timestamp < AUTHORIZATION_WINDOW) {
      return true;
    }

    if (!this.initialized) {
      recordViolation({
        type: 'terminal_spawn_no_node',
        description: `Terminal command "${command.substring(0, 50)}" in session ${sessionId} BLOCKED — Gateway not initialized`,
        target: command,
        stack: new Error().stack,
        timestamp: Date.now(),
        severity: 'critical',
      });
      return false;
    }

    recordViolation({
      type: 'terminal_spawn_no_node',
      description: `Terminal command "${command.substring(0, 50)}" in session ${sessionId} without gateway authorization`,
      target: command,
      stack: new Error().stack,
      timestamp: Date.now(),
      severity: 'critical',
    });
    return false;
  }

  /** Record a Monaco save that bypassed the gateway */
  reportMonacoBypass(filePath: string): void {
    recordViolation({
      type: 'monaco_save_no_node',
      description: `Monaco save of "${filePath}" without gateway authorization`,
      target: filePath,
      stack: new Error().stack,
      timestamp: Date.now(),
      severity: 'critical',
    });
  }

  // ─── Audit Report API (merged from execution-audit.ts) ──────────────────

  getViolations(): GraphViolation[] {
    return [...violations];
  }

  getViolationCounts(): Record<string, number> {
    return { ...violationCounts };
  }

  getViolationCount(): number {
    return violations.length;
  }

  isAuditClean(): boolean {
    return violations.length === 0;
  }

  clearViolations(): void {
    violations.length = 0;
    for (const key of Object.keys(violationCounts)) {
      delete violationCounts[key];
    }
    authorizedFsOps.clear();
    authorizedTerminalOps.clear();
  }

  generateAuditReport(): {
    totalViolations: number;
    violationsByType: Record<string, number>;
    violations: GraphViolation[];
    isClean: boolean;
  } {
    return {
      totalViolations: violations.length,
      violationsByType: { ...violationCounts },
      violations: [...violations],
      isClean: violations.length === 0,
    };
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
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

/** The ExecutionGateway singleton — the ONLY valid execution surface */
export const ExecutionGateway = new ExecutionGatewayClass();

/**
 * Check if the gateway is initialized. Used by kernel modules
 * to verify the enforcement system is active.
 */
export function isGatewayInitialized(): boolean {
  return ExecutionGateway.isInitialized();
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPATIBLE RE-EXPORTS
// These allow existing imports from execution-audit.ts to continue working.
// After all consumers are updated, these can be removed.
// ═══════════════════════════════════════════════════════════════════════════════

/** @deprecated Use ExecutionGateway.authorizeFsOp() instead */
export function authorizeFsOp(filePath: string, nodeId: string, operation: string): void {
  ExecutionGateway.authorizeFsOp(filePath, nodeId, operation);
}

/** @deprecated Use ExecutionGateway.authorizeTerminalOp() instead */
export function authorizeTerminalOp(sessionId: string, nodeId: string, command: string): void {
  ExecutionGateway.authorizeTerminalOp(sessionId, nodeId, command);
}

/** @deprecated Use ExecutionGateway.checkFsAuthorization() instead */
export function checkFsAuthorization(filePath: string, operation: string): boolean {
  return ExecutionGateway.checkFsAuthorization(filePath, operation);
}

/** @deprecated Use ExecutionGateway.checkTerminalAuthorization() instead */
export function checkTerminalAuthorization(sessionId: string, command: string): boolean {
  return ExecutionGateway.checkTerminalAuthorization(sessionId, command);
}

/** @deprecated Use ExecutionGateway.reportMonacoBypass() instead */
export function reportMonacoBypass(filePath: string): void {
  ExecutionGateway.reportMonacoBypass(filePath);
}

/** @deprecated Use ExecutionGateway.generateAuditReport() instead */
export function generateAuditReport() {
  return ExecutionGateway.generateAuditReport();
}

/** @deprecated Use ExecutionGateway.isAuditClean() instead */
export function isAuditClean(): boolean {
  return ExecutionGateway.isAuditClean();
}

/** @deprecated Use ExecutionGateway.getViolations() instead */
export function getViolations(): GraphViolation[] {
  return ExecutionGateway.getViolations();
}

/** @deprecated Use ExecutionGateway.getViolationCounts() instead */
export function getViolationCounts(): Record<string, number> {
  return ExecutionGateway.getViolationCounts();
}

/** @deprecated Use ExecutionGateway.clearViolations() instead */
export function clearViolations(): void {
  ExecutionGateway.clearViolations();
}
