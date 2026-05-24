// ─── VibeCode Desktop — Product API Surface (ARC 19) ─────────────────────────
// CLEAN, MINIMAL API FOR AI ACTIONS AND UI INTEGRATION
//
// This module defines the public execution API. It hides internal complexity
// (graphs, nodes, safety scores, kernel layer) behind simple, product-grade
// functions. The system should look like "simple AI IDE product", not an
// engineering experiment.
//
// ALL external consumers (AI hooks, UI components, IPC handlers) should
// import from this module rather than reaching into internals.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ExecutionStateMachine,
  ExecutionNode,
  ExecutionNodeType,
  NodeState,
  NodeResult,
  UnifiedStepType,
  RiskLevel,
} from '../services/execution-state-machine';
import { ExecutionGateway, GatewayResult } from './execution-gateway';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC TYPES — Clean, minimal, product-grade
// ═══════════════════════════════════════════════════════════════════════════════

/** Simple execution result for product consumers */
export interface ExecutionOutcome {
  /** Whether the operation succeeded */
  success: boolean;
  /** Human-readable description of what happened */
  message: string;
  /** The execution node ID (for tracking, cancellation, rollback) */
  nodeId: string;
  /** Safety score of this operation (0-100) */
  safetyScore: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Error details if failed */
  error?: string;
}

/** Simple query filter for execution history */
export interface ExecutionQuery {
  /** Filter by node type */
  type?: ExecutionNodeType;
  /** Filter by state */
  state?: NodeState;
  /** Only nodes after this timestamp */
  since?: number;
  /** Maximum results (default 50) */
  limit?: number;
}

/** Subscription event types */
export type ExecutionEventType =
  | 'created'    // New node created
  | 'approved'   // Node approved for execution
  | 'executing'  // Node currently executing
  | 'completed'  // Node completed successfully
  | 'failed'     // Node failed
  | 'blocked';   // Node blocked by safety gate

export interface ExecutionEvent {
  type: ExecutionEventType;
  nodeId: string;
  title: string;
  safetyScore: number;
  timestamp: number;
}

export type ExecutionEventHandler = (event: ExecutionEvent) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// VIBECODE API — The product-grade execution interface
// ═══════════════════════════════════════════════════════════════════════════════

class VibeCodeAPIClass {
  private esm: ExecutionStateMachine | null = null;
  private eventHandlers: ExecutionEventHandler[] = [];

  /** Initialize with the ESM instance (called once at startup) */
  initialize(esm: ExecutionStateMachine): void {
    this.esm = esm;

    // Subscribe to ESM events and translate to product events
    esm.onEvent((esmEvent) => {
      const productEvent = this.translateEvent(esmEvent.type, esmEvent.nodeId, esmEvent.newState);
      if (productEvent) {
        for (const handler of this.eventHandlers) {
          try {
            handler(productEvent);
          } catch {
            // Handler error — don't crash
          }
        }
      }
    });

    logger.info('vibecode-api', 'VibeCode Product API initialized');
  }

  // ─── Core Execution Methods ────────────────────────────────────────────

  /**
   * Execute a terminal command.
   * Returns immediately with the node ID; output is attached asynchronously.
   */
  async executeCommand(command: string, cwd: string, terminalId: string, isAI: boolean = false): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const node = ExecutionGateway.createTerminalNode({
        command,
        cwd,
        terminalId,
        isAI,
      });

      // Authorize the terminal operation
      ExecutionGateway.authorizeTerminalOp(terminalId, node.id, command);

      return {
        success: true,
        message: `Command queued: ${command.substring(0, 50)}`,
        nodeId: node.id,
        safetyScore: node.safetyScore,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Command blocked: ${msg}`,
        nodeId: '',
        safetyScore: 0,
        duration: Date.now() - startTime,
        error: msg,
      };
    }
  }

  /**
   * Save a file edit from Monaco.
   */
  async saveEdit(filePath: string, originalContent: string, newContent: string, isAI: boolean = false): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const result = await ExecutionGateway.executeMonacoEdit({
        filePath,
        originalContent,
        newContent,
        isAI,
        autoApprove: true,
      });

      if (!result.allowed) {
        return {
          success: false,
          message: result.blockReason || 'Edit blocked by safety gate',
          nodeId: result.node.id,
          safetyScore: result.node.safetyScore,
          duration: Date.now() - startTime,
        };
      }

      // Authorize the FS write
      ExecutionGateway.authorizeFsOp(filePath, result.node.id, 'write');

      return {
        success: true,
        message: `Edit saved: ${filePath.split('/').pop()}`,
        nodeId: result.node.id,
        safetyScore: result.node.safetyScore,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Edit failed: ${msg}`,
        nodeId: '',
        safetyScore: 0,
        duration: Date.now() - startTime,
        error: msg,
      };
    }
  }

  /**
   * Execute a file mutation (create, edit, delete, move).
   */
  async mutateFile(action: 'create' | 'edit' | 'delete' | 'move', filePath: string, options?: {
    destinationPath?: string;
    content?: string;
    originalContent?: string;
    isAI?: boolean;
  }): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const result = await ExecutionGateway.executeFileMutation({
        action,
        filePath,
        destinationPath: options?.destinationPath,
        newContent: options?.content,
        originalContent: options?.originalContent,
        autoApprove: action !== 'delete',
        isAI: options?.isAI,
      });

      if (!result.allowed) {
        return {
          success: false,
          message: result.blockReason || 'Mutation blocked by safety gate',
          nodeId: result.node.id,
          safetyScore: result.node.safetyScore,
          duration: Date.now() - startTime,
        };
      }

      // Authorize the FS operation
      ExecutionGateway.authorizeFsOp(filePath, result.node.id, action);

      return {
        success: true,
        message: `File ${action}: ${filePath.split('/').pop()}`,
        nodeId: result.node.id,
        safetyScore: result.node.safetyScore,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `File mutation failed: ${msg}`,
        nodeId: '',
        safetyScore: 0,
        duration: Date.now() - startTime,
        error: msg,
      };
    }
  }

  /**
   * Execute an AI-generated plan.
   */
  async executeAIPlan(title: string, description: string, steps: Array<{
    title: string;
    description: string;
    type: UnifiedStepType;
    params: Record<string, unknown>;
    riskLevel?: RiskLevel;
  }>): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    if (!this.esm) {
      return {
        success: false,
        message: 'API not initialized',
        nodeId: '',
        safetyScore: 0,
        error: 'VibeCode API not initialized',
      };
    }

    try {
      const planNode = this.esm.createExecutionPlan({
        title,
        description,
        steps: steps.map((s, i) => ({
          ...s,
          dependsOn: [],
        })),
      });

      return {
        success: true,
        message: `Plan created: ${title} (${steps.length} steps, safety: ${planNode.safetyScore}/100)`,
        nodeId: planNode.id,
        safetyScore: planNode.safetyScore,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Plan creation failed: ${msg}`,
        nodeId: '',
        safetyScore: 0,
        duration: Date.now() - startTime,
        error: msg,
      };
    }
  }

  // ─── Query Methods ─────────────────────────────────────────────────────

  /**
   * Query execution history.
   */
  query(filter?: ExecutionQuery): Array<{
    nodeId: string;
    type: ExecutionNodeType;
    title: string;
    state: NodeState;
    safetyScore: number;
    createdAt: number;
  }> {
    if (!this.esm) return [];

    let nodes = this.esm.getTimeline();

    if (filter?.type) {
      nodes = nodes.filter(n => n.type === filter.type);
    }
    if (filter?.state) {
      nodes = nodes.filter(n => n.state === filter.state);
    }
    if (filter?.since) {
      nodes = nodes.filter(n => n.createdAt >= filter.since!);
    }

    const limit = filter?.limit ?? 50;
    nodes = nodes.slice(-limit);

    return nodes.map(n => ({
      nodeId: n.id,
      type: n.type,
      title: n.title,
      state: n.state,
      safetyScore: n.safetyScore,
      createdAt: n.createdAt,
    }));
  }

  /**
   * Get execution statistics.
   */
  getStats(): {
    totalNodes: number;
    completed: number;
    failed: number;
    blocked: number;
    pending: number;
    avgSafetyScore: number;
  } {
    if (!this.esm) {
      return { totalNodes: 0, completed: 0, failed: 0, blocked: 0, pending: 0, avgSafetyScore: 0 };
    }

    const timeline = this.esm.getTimeline();
    const completed = timeline.filter(n => n.state === 'completed').length;
    const failed = timeline.filter(n => n.state === 'failed').length;
    const blocked = timeline.filter(n => n.state === 'rejected').length;
    const pending = timeline.filter(n => n.state === 'planned' || n.state === 'approved' || n.state === 'queued').length;
    const avgSafety = timeline.length > 0
      ? Math.round(timeline.reduce((sum, n) => sum + n.safetyScore, 0) / timeline.length)
      : 100;

    return {
      totalNodes: timeline.length,
      completed,
      failed,
      blocked,
      pending,
      avgSafetyScore: avgSafety,
    };
  }

  // ─── Control Methods ───────────────────────────────────────────────────

  /**
   * Approve a pending execution node.
   */
  approve(nodeId: string): ExecutionOutcome {
    if (!this.esm) {
      return { success: false, message: 'API not initialized', nodeId, safetyScore: 0 };
    }

    try {
      const node = this.esm.approvePlan(nodeId);
      return {
        success: true,
        message: `Approved: ${node.title}`,
        nodeId: node.id,
        safetyScore: node.safetyScore,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg, nodeId, safetyScore: 0, error: msg };
    }
  }

  /**
   * Cancel a pending or executing node.
   */
  cancel(nodeId: string): ExecutionOutcome {
    if (!this.esm) {
      return { success: false, message: 'API not initialized', nodeId, safetyScore: 0 };
    }

    try {
      const node = this.esm.transitionNode(nodeId, 'cancelled');
      return {
        success: true,
        message: `Cancelled: ${node.title}`,
        nodeId: node.id,
        safetyScore: node.safetyScore,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg, nodeId, safetyScore: 0, error: msg };
    }
  }

  /**
   * Roll back a completed node.
   */
  async rollback(nodeId: string): Promise<ExecutionOutcome> {
    if (!this.esm) {
      return { success: false, message: 'API not initialized', nodeId, safetyScore: 0 };
    }

    try {
      const node = await this.esm.rollbackStep(nodeId);
      return {
        success: true,
        message: `Rolled back: ${node.title}`,
        nodeId: node.id,
        safetyScore: node.safetyScore,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg, nodeId, safetyScore: 0, error: msg };
    }
  }

  // ─── Event Subscription ────────────────────────────────────────────────

  /**
   * Subscribe to execution events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: ExecutionEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private translateEvent(esmType: string, nodeId: string, newState?: string): ExecutionEvent | null {
    if (!this.esm) return null;
    const node = this.esm.getNode(nodeId);
    if (!node) return null;

    let eventType: ExecutionEventType | null = null;
    switch (esmType) {
      case 'node:created':
        eventType = 'created';
        break;
      case 'node:transition':
        switch (newState) {
          case 'approved': eventType = 'approved'; break;
          case 'executing': eventType = 'executing'; break;
          case 'completed': eventType = 'completed'; break;
          case 'failed': eventType = 'failed'; break;
          case 'rejected': eventType = 'blocked'; break;
        }
        break;
    }

    if (!eventType) return null;

    return {
      type: eventType,
      nodeId,
      title: node.title,
      safetyScore: node.safetyScore,
      timestamp: Date.now(),
    };
  }
}

/** The VibeCode Product API singleton */
export const VibeCodeAPI = new VibeCodeAPIClass();
