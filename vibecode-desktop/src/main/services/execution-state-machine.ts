// ─── VibeCode Desktop — Unified Execution State Machine ─────────────────────
// ARC 11: Single source of truth for ALL execution state.
// Every AI reasoning step, Monaco edit, terminal command, file mutation,
// safety score, and rollback flows through this state machine.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';
import { ExecutionPersistence } from './execution-persistence';

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED TYPES — Single definitions shared across main + renderer
// ═══════════════════════════════════════════════════════════════════════════════

/** Canonical node types in the execution graph */
export type ExecutionNodeType =
  | 'ai_reasoning'    // AI chat/completion — user message → AI response
  | 'monaco_edit'     // Code edit in Monaco editor (user or AI-initiated)
  | 'terminal_command' // Command executed in terminal (user or AI-initiated)
  | 'file_mutation'   // File system change (create/edit/delete/move)
  | 'safety_check'    // Safety scoring / approval gate
  | 'rollback'        // Rollback action
  | 'plan'            // Execution plan (container for child steps)
  | 'step';           // Individual execution step within a plan

/** Canonical state for any execution node — enforced state machine */
export type NodeState =
  | 'planned'     // Created but not yet started
  | 'queued'      // Waiting in execution queue
  | 'approved'    // User-approved for execution
  | 'executing'   // Currently running
  | 'completed'   // Successfully finished
  | 'failed'      // Ended with error
  | 'rolled_back' // Reverted to previous state
  | 'cancelled';  // User cancelled

/** Valid state transitions — the ONLY allowed transitions */
const VALID_TRANSITIONS: Record<NodeState, NodeState[]> = {
  planned:    ['queued', 'approved', 'cancelled'],
  queued:     ['approved', 'cancelled'],
  approved:   ['executing', 'cancelled', 'planned'],
  executing:  ['completed', 'failed', 'cancelled', 'rolled_back'],
  completed:  ['rolled_back'],
  failed:     ['planned', 'queued', 'cancelled'], // retry paths
  rolled_back: ['planned', 'queued'],              // re-execute after rollback
  cancelled:  ['planned'],                          // restart after cancel
};

/** Risk levels shared across all systems */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Unified step type — replaces the 3 incompatible step type enums */
export type UnifiedStepType =
  | 'file_write'       // Create or overwrite a file
  | 'file_read'        // Read a file
  | 'file_edit'        // Edit an existing file (find/replace)
  | 'file_delete'      // Delete a file
  | 'command'          // Execute a shell command
  | 'code_generation'  // Generate code from AI
  | 'diff_apply'       // Apply a unified diff
  | 'analysis'         // Code analysis / review
  | 'test'             // Run tests
  | 'ai_suggestion';   // AI-suggested change (Monaco ghost text / inline edit)

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION GRAPH NODE — The atomic unit of the execution graph
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExecutionNode {
  /** Unique ID */
  id: string;
  /** Type of node */
  type: ExecutionNodeType;
  /** Current state — only transitions via VALID_TRANSITIONS */
  state: NodeState;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;

  /** Parent node ID (for steps → plan, safety_check → step, etc.) */
  parentId: string | null;
  /** Child node IDs (plan → steps, etc.) */
  childIds: string[];
  /** Dependency node IDs — must complete before this node can execute */
  dependsOn: string[];
  /** Source node IDs — what caused this node to be created */
  sourceIds: string[];

  /** Timestamps */
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;

  /** Type-specific data */
  data: NodeData;

  /** Risk assessment */
  riskLevel: RiskLevel;
  /** Computed safety score (0-100, 100 = safest) — derived from graph, not local UI state */
  safetyScore: number;
  /** Whether this node requires explicit user approval before executing */
  requiresApproval: boolean;

  /** Execution result */
  result?: NodeResult;
  /** Error message if failed */
  error?: string;
  /** Retry count */
  retryCount: number;
  /** Max retries */
  maxRetries: number;
}

/** Type-specific data for different node types */
export type NodeData =
  | AIReasoningData
  | MonacoEditData
  | TerminalCommandData
  | FileMutationData
  | SafetyCheckData
  | RollbackData
  | PlanData
  | StepData;

export interface AIReasoningData {
  kind: 'ai_reasoning';
  providerId: string;
  model: string;
  prompt: string;
  response: string;
  tokenCount?: number;
  latency?: number;
  /** Chat message ID this reasoning corresponds to */
  chatMessageId?: string;
}

export interface MonacoEditData {
  kind: 'monaco_edit';
  filePath: string;
  /** Region of the edit (start line/col → end line/col) */
  region: {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  };
  /** Original content in the region */
  originalContent: string;
  /** New content in the region */
  newContent: string;
  /** Whether this edit was AI-suggested or user-made */
  isAI: boolean;
  /** Linked execution step ID (if this edit came from an AI execution) */
  linkedStepId?: string;
}

export interface TerminalCommandData {
  kind: 'terminal_command';
  /** The command string */
  command: string;
  /** Working directory */
  cwd: string;
  /** Terminal session ID */
  terminalId: string;
  /** Captured stdout */
  stdout: string;
  /** Captured stderr */
  stderr: string;
  /** Exit code */
  exitCode: number | null;
  /** Whether output was truncated */
  truncated: boolean;
  /** Whether this command was AI-initiated */
  isAI: boolean;
  /** Linked execution step ID */
  linkedStepId?: string;
}

export interface FileMutationData {
  kind: 'file_mutation';
  /** Mutation type */
  action: 'create' | 'edit' | 'delete' | 'move';
  /** File path (relative to workspace) */
  filePath: string;
  /** For move operations */
  destinationPath?: string;
  /** Original file content (for rollback) */
  originalContent?: string;
  /** New file content */
  newContent?: string;
  /** Whether file existed before this mutation */
  fileExisted: boolean;
  /** Linked execution step ID */
  linkedStepId?: string;
}

export interface SafetyCheckData {
  kind: 'safety_check';
  /** The node IDs being checked */
  targetNodeIds: string[];
  /** Overall safety score computed for the targets */
  computedScore: number;
  /** Individual check results */
  checks: SafetyCheckResult[];
  /** Approval checkpoint — user must acknowledge */
  approvalRequired: boolean;
  /** User decision */
  decision?: 'approved' | 'rejected' | 'modified';
}

export interface SafetyCheckResult {
  rule: string;
  passed: boolean;
  severity: RiskLevel;
  message: string;
}

export interface RollbackData {
  kind: 'rollback';
  /** The node IDs being rolled back */
  targetNodeIds: string[];
  /** Rollback snapshots */
  snapshots: RollbackSnapshot[];
  /** Whether rollback succeeded */
  success: boolean;
  /** Error if rollback failed */
  error?: string;
}

export interface RollbackSnapshot {
  nodeId: string;
  filePath?: string;
  originalContent?: string;
  fileExisted?: boolean;
  command?: string;
  commandOutput?: string;
  timestamp: number;
}

export interface PlanData {
  kind: 'plan';
  /** Proposal ID that generated this plan (if any) */
  proposalId?: string;
  /** AI chat message ID that triggered this plan */
  chatMessageId?: string;
  /** Provider + model used */
  providerId?: string;
  model?: string;
}

export interface StepData {
  kind: 'step';
  /** Unified step type */
  stepType: UnifiedStepType;
  /** Step parameters (type-specific) */
  params: Record<string, unknown>;
}

export interface NodeResult {
  success: boolean;
  data?: Record<string, unknown>;
  duration?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION GRAPH — The full graph of all execution nodes
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExecutionGraph {
  /** All nodes indexed by ID */
  nodes: Map<string, ExecutionNode>;
  /** Root node IDs (plans, AI reasonings, user actions) */
  rootIds: string[];
  /** Timestamp of last modification */
  lastModified: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION EVENT — Events emitted by the state machine
// ═══════════════════════════════════════════════════════════════════════════════

export type StateMachineEventType =
  | 'node:created'
  | 'node:transition'    // State changed
  | 'node:updated'       // Data changed without state transition
  | 'node:linked'        // Source/dependency link added
  | 'graph:changed'      // Any graph mutation
  | 'safety:computed'    // Safety score recalculated
  | 'rollback:completed'
  | 'rollback:failed';

export interface StateMachineEvent {
  type: StateMachineEventType;
  nodeId: string;
  previousState?: NodeState;
  newState?: NodeState;
  timestamp: number;
  data?: unknown;
}

export type StateMachineEventHandler = (event: StateMachineEvent) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY SCORING ENGINE — Derives scores from the execution graph
// ═══════════════════════════════════════════════════════════════════════════════

/** Safety scoring rules */
interface SafetyRule {
  id: string;
  name: string;
  evaluate(node: ExecutionNode, graph: ExecutionGraph): SafetyCheckResult;
}

const SAFETY_RULES: SafetyRule[] = [
  {
    id: 'dangerous-command',
    name: 'Dangerous Command Detection',
    evaluate(node) {
      // Only evaluate for terminal_command nodes or step nodes of type 'command'
      let command: string | undefined;
      if (node.type === 'terminal_command') {
        command = (node.data as TerminalCommandData).command;
      } else if ((node.data as StepData)?.stepType === 'command') {
        command = (node.data as StepData).params?.command as string | undefined;
      }
      if (!command) {
        return { rule: 'dangerous-command', passed: true, severity: 'low', message: 'Not a command' };
      }
      const dangerous = ['rm -rf', 'sudo', 'chmod 777', ':(){:|:&};:', 'dd if=', 'mkfs', 'format'];
      const isDangerous = dangerous.some(d => command!.includes(d));
      return {
        rule: 'dangerous-command',
        passed: !isDangerous,
        severity: isDangerous ? 'critical' : 'low',
        message: isDangerous ? `Potentially dangerous command: ${command!.substring(0, 50)}` : 'Command appears safe',
      };
    },
  },
  {
    id: 'system-file-modification',
    name: 'System File Modification',
    evaluate(node) {
      const data = node.data as FileMutationData | StepData;
      const filePath = (data as FileMutationData)?.filePath || (data as StepData)?.params?.filePath as string;
      if (!filePath) return { rule: 'system-file-modification', passed: true, severity: 'low', message: 'No file path' };

      const systemPaths = ['/etc/', '/usr/', '/System/', 'C:\\Windows\\', 'C:\\Program Files\\'];
      const isSystem = systemPaths.some(p => filePath.startsWith(p));
      return {
        rule: 'system-file-modification',
        passed: !isSystem,
        severity: isSystem ? 'critical' : 'low',
        message: isSystem ? `System file modification: ${filePath}` : 'Workspace file modification',
      };
    },
  },
  {
    id: 'scope-breadth',
    name: 'Change Scope Breadth',
    evaluate(node, graph) {
      if (node.type !== 'plan') return { rule: 'scope-breadth', passed: true, severity: 'low', message: 'Not a plan' };
      const childCount = node.childIds.length;
      const risk: RiskLevel = childCount > 10 ? 'high' : childCount > 5 ? 'medium' : 'low';
      return {
        rule: 'scope-breadth',
        passed: risk === 'low',
        severity: risk,
        message: `Plan has ${childCount} steps`,
      };
    },
  },
  {
    id: 'high-risk-file',
    name: 'High-Risk File Types',
    evaluate(node) {
      const data = node.data as FileMutationData | StepData;
      const filePath = (data as FileMutationData)?.filePath || (data as StepData)?.params?.filePath as string;
      if (!filePath) return { rule: 'high-risk-file', passed: true, severity: 'low', message: 'No file path' };

      const highRiskExtensions = ['.env', '.pem', '.key', '.secret', '.credentials'];
      const ext = '.' + filePath.split('.').pop();
      const isHighRisk = highRiskExtensions.some(e => filePath.endsWith(e));
      return {
        rule: 'high-risk-file',
        passed: !isHighRisk,
        severity: isHighRisk ? 'high' : 'low',
        message: isHighRisk ? `High-risk file type: ${ext}` : 'Standard file type',
      };
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION STATE MACHINE — The single source of truth
// ═══════════════════════════════════════════════════════════════════════════════

export class ExecutionStateMachine {
  private graph: ExecutionGraph;
  private persistence: ExecutionPersistence;
  private eventHandlers: StateMachineEventHandler[] = [];
  private workspaceRoot: string;

  /** Active executions: nodeId → AbortController */
  private activeExecutions: Map<string, AbortController> = new Map();

  /** Executor registry: stepType → executor function */
  private executorRegistry: Map<string, (node: ExecutionNode) => Promise<NodeResult>> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.graph = {
      nodes: new Map(),
      rootIds: [],
      lastModified: Date.now(),
    };
    this.persistence = new ExecutionPersistence();
  }

  // ─── Graph Queries ──────────────────────────────────────────────────────

  /** Get a node by ID */
  getNode(id: string): ExecutionNode | null {
    return this.graph.nodes.get(id) ?? null;
  }

  /** Get all nodes of a specific type */
  getNodesByType(type: ExecutionNodeType): ExecutionNode[] {
    return Array.from(this.graph.nodes.values()).filter(n => n.type === type);
  }

  /** Get all root nodes */
  getRootNodes(): ExecutionNode[] {
    return this.graph.rootIds
      .map(id => this.graph.nodes.get(id))
      .filter((n): n is ExecutionNode => n !== null);
  }

  /** Get children of a node */
  getChildren(parentId: string): ExecutionNode[] {
    const parent = this.graph.nodes.get(parentId);
    if (!parent) return [];
    return parent.childIds
      .map(id => this.graph.nodes.get(id))
      .filter((n): n is ExecutionNode => n !== null);
  }

  /** Get the full execution graph snapshot */
  getGraphSnapshot(): { nodes: ExecutionNode[]; rootIds: string[]; lastModified: number } {
    return {
      nodes: Array.from(this.graph.nodes.values()),
      rootIds: [...this.graph.rootIds],
      lastModified: this.graph.lastModified,
    };
  }

  /** Get execution timeline — all nodes sorted by creation time */
  getTimeline(): ExecutionNode[] {
    return Array.from(this.graph.nodes.values())
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Get all plan nodes */
  getPlans(): ExecutionNode[] {
    return this.getNodesByType('plan');
  }

  /** Get plan progress */
  getPlanProgress(planId: string): { total: number; completed: number; failed: number; running: number; pending: number } {
    const plan = this.getNode(planId);
    if (!plan) return { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };

    const children = this.getChildren(planId);
    return {
      total: children.length,
      completed: children.filter(c => c.state === 'completed').length,
      failed: children.filter(c => c.state === 'failed').length,
      running: children.filter(c => c.state === 'executing').length,
      pending: children.filter(c => c.state === 'planned' || c.state === 'approved').length,
    };
  }

  // ─── Node Creation ──────────────────────────────────────────────────────

  /** Create a new execution node in the graph */
  createNode(params: {
    type: ExecutionNodeType;
    title: string;
    description: string;
    parentId?: string;
    dependsOn?: string[];
    sourceIds?: string[];
    data: NodeData;
    riskLevel?: RiskLevel;
    requiresApproval?: boolean;
    maxRetries?: number;
  }): ExecutionNode {
    const id = uuidv4();
    const now = Date.now();

    const node: ExecutionNode = {
      id,
      type: params.type,
      state: 'planned',
      title: params.title,
      description: params.description,
      parentId: params.parentId ?? null,
      childIds: [],
      dependsOn: params.dependsOn ?? [],
      sourceIds: params.sourceIds ?? [],
      createdAt: now,
      updatedAt: now,
      data: params.data,
      riskLevel: params.riskLevel ?? 'low',
      safetyScore: 100, // Default safe; computed by safety engine
      requiresApproval: params.requiresApproval ?? false,
      retryCount: 0,
      maxRetries: params.maxRetries ?? 3,
    };

    // Compute initial safety score
    node.safetyScore = this.computeSafetyScore(node);

    // Upgrade risk level based on safety score if not already elevated
    if (node.safetyScore <= 40 && node.riskLevel !== 'critical') {
      node.riskLevel = 'critical';
    } else if (node.safetyScore <= 60 && ['low', 'medium'].includes(node.riskLevel)) {
      node.riskLevel = 'high';
    } else if (node.safetyScore <= 80 && node.riskLevel === 'low') {
      node.riskLevel = 'medium';
    }

    // Auto-require approval for low-safety nodes
    if (node.safetyScore <= 60) {
      node.requiresApproval = true;
    }

    // Add to graph
    this.graph.nodes.set(id, node);

    // Link to parent if specified
    if (params.parentId) {
      const parent = this.graph.nodes.get(params.parentId);
      if (parent && !parent.childIds.includes(id)) {
        parent.childIds.push(id);
        parent.updatedAt = now;
      }
    } else {
      // Root node
      this.graph.rootIds.push(id);
    }

    this.graph.lastModified = now;

    // Emit events
    this.emitEvent('node:created', id, undefined, 'planned', params);
    this.emitEvent('graph:changed', id);

    logger.info('state-machine', `Node created: ${node.type}[${id.substring(0, 8)}] "${node.title}"`);

    return node;
  }

  // ─── State Transitions ──────────────────────────────────────────────────

  /** Transition a node to a new state — validates against VALID_TRANSITIONS */
  transitionNode(nodeId: string, newState: NodeState, data?: unknown): ExecutionNode {
    const node = this.graph.nodes.get(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    const oldState = node.state;
    const allowed = VALID_TRANSITIONS[oldState];

    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${oldState} → ${newState} for node "${node.title}" (${nodeId}). ` +
        `Allowed transitions from "${oldState}": [${allowed.join(', ')}]`
      );
    }

    // Apply transition
    node.state = newState;
    node.updatedAt = Date.now();

    // Set timestamps
    if (newState === 'executing' && !node.startedAt) {
      node.startedAt = Date.now();
    }
    if (['completed', 'failed', 'rolled_back', 'cancelled'].includes(newState)) {
      node.completedAt = Date.now();
    }

    this.graph.lastModified = Date.now();

    // Emit events
    this.emitEvent('node:transition', nodeId, oldState, newState, data);
    this.emitEvent('graph:changed', nodeId);

    // Audit log for safety-critical transitions
    if (['approved', 'executing', 'rolled_back', 'cancelled'].includes(newState)) {
      auditLog.auditLog(`execution:transition`, {
        nodeId,
        nodeType: node.type,
        nodeTitle: node.title,
        fromState: oldState,
        toState: newState,
      });
    }

    logger.info('state-machine', `Transition: ${node.type}[${nodeId.substring(0, 8)}] ${oldState} → ${newState}`);

    return node;
  }

  /** Update a node's data without changing state */
  updateNodeData(nodeId: string, data: Partial<NodeData>, result?: NodeResult, error?: string): ExecutionNode | null {
    const node = this.graph.nodes.get(nodeId);
    if (!node) return null;

    // Merge data updates
    node.data = { ...node.data, ...data } as NodeData;
    if (result) node.result = result;
    if (error) node.error = error;
    node.updatedAt = Date.now();

    this.graph.lastModified = Date.now();
    this.emitEvent('node:updated', nodeId);
    this.emitEvent('graph:changed', nodeId);

    return node;
  }

  // ─── Link Management ───────────────────────────────────────────────────

  /** Add a source link — records causality (A caused B) */
  addSourceLink(targetId: string, sourceId: string): void {
    const target = this.graph.nodes.get(targetId);
    if (!target || target.sourceIds.includes(sourceId)) return;

    target.sourceIds.push(sourceId);
    target.updatedAt = Date.now();
    this.emitEvent('node:linked', targetId, undefined, undefined, { sourceId });
  }

  /** Add a dependency link — target depends on dependency */
  addDependency(targetId: string, dependsOnId: string): void {
    const target = this.graph.nodes.get(targetId);
    if (!target || target.dependsOn.includes(dependsOnId)) return;

    target.dependsOn.push(dependsOnId);
    target.updatedAt = Date.now();
    this.emitEvent('node:linked', targetId);
  }

  // ─── Safety Scoring ───────────────────────────────────────────────────

  /** Compute safety score for a node based on the graph context */
  computeSafetyScore(node: ExecutionNode): number {
    let score = 100;

    for (const rule of SAFETY_RULES) {
      const result = rule.evaluate(node, this.graph);
      if (!result.passed) {
        switch (result.severity) {
          case 'critical': score -= 40; break;
          case 'high':     score -= 25; break;
          case 'medium':   score -= 10; break;
          case 'low':      score -= 5;  break;
        }
      }
    }

    // Factor in parent plan's overall risk
    if (node.parentId) {
      const parent = this.graph.nodes.get(node.parentId);
      if (parent) {
        const highRiskChildren = this.getChildren(parent.id).filter(c => c.riskLevel === 'high' || c.riskLevel === 'critical').length;
        score -= highRiskChildren * 5;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /** Run safety check for a set of nodes and create a safety_check node */
  runSafetyCheck(targetNodeIds: string[], approvalRequired: boolean = false): ExecutionNode {
    const checks: SafetyCheckResult[] = [];
    let totalScore = 100;

    for (const targetId of targetNodeIds) {
      const target = this.graph.nodes.get(targetId);
      if (!target) continue;

      const nodeScore = this.computeSafetyScore(target);
      totalScore = Math.min(totalScore, nodeScore);

      for (const rule of SAFETY_RULES) {
        const result = rule.evaluate(target, this.graph);
        checks.push(result);
      }
    }

    const node = this.createNode({
      type: 'safety_check',
      title: `Safety Check: ${targetNodeIds.length} nodes`,
      description: `Computed safety score: ${totalScore}/100`,
      sourceIds: targetNodeIds,
      data: {
        kind: 'safety_check',
        targetNodeIds,
        computedScore: totalScore,
        checks,
        approvalRequired: approvalRequired || totalScore < 60,
      },
      riskLevel: totalScore < 40 ? 'critical' : totalScore < 60 ? 'high' : totalScore < 80 ? 'medium' : 'low',
      requiresApproval: approvalRequired || totalScore < 60,
    });

    // Update safety scores on target nodes
    for (const targetId of targetNodeIds) {
      const target = this.graph.nodes.get(targetId);
      if (target) {
        target.safetyScore = totalScore;
        target.updatedAt = Date.now();
      }
    }

    this.emitEvent('safety:computed', node.id, undefined, undefined, { score: totalScore });

    return node;
  }

  /** Get the aggregate safety score for a plan and all its children */
  getAggregateSafetyScore(planId: string): number {
    const plan = this.graph.nodes.get(planId);
    if (!plan) return 0;

    const children = this.getChildren(planId);
    if (children.length === 0) return 100;

    const minScore = Math.min(...children.map(c => c.safetyScore));
    return minScore;
  }

  // ─── Plan Operations (replaces ExecutionEngine plan methods) ────────

  /** Create an execution plan node with child step nodes */
  createExecutionPlan(params: {
    title: string;
    description: string;
    steps: Array<{
      title: string;
      description: string;
      type: UnifiedStepType;
      params: Record<string, unknown>;
      riskLevel?: RiskLevel;
      requiresApproval?: boolean;
      dependsOn?: number[]; // indices into steps array
    }>;
    proposalId?: string;
    chatMessageId?: string;
    providerId?: string;
    model?: string;
  }): ExecutionNode {
    // Create the plan node
    const planNode = this.createNode({
      type: 'plan',
      title: params.title,
      description: params.description,
      data: {
        kind: 'plan',
        proposalId: params.proposalId,
        chatMessageId: params.chatMessageId,
        providerId: params.providerId,
        model: params.model,
      },
      riskLevel: 'low',
      requiresApproval: false,
    });

    // Create step nodes as children
    const stepNodeIds: string[] = [];
    for (let i = 0; i < params.steps.length; i++) {
      const stepInput = params.steps[i];
      const stepNode = this.createNode({
        type: 'step',
        title: stepInput.title,
        description: stepInput.description,
        parentId: planNode.id,
        data: {
          kind: 'step',
          stepType: stepInput.type,
          params: stepInput.params,
        },
        riskLevel: stepInput.riskLevel ?? 'low',
        requiresApproval: stepInput.requiresApproval ?? stepInput.riskLevel === 'high',
        dependsOn: stepInput.dependsOn?.map(idx => stepNodeIds[idx]) ?? [],
        sourceIds: [planNode.id],
      });

      stepNodeIds.push(stepNode.id);
    }

    // Compute plan-level safety score
    planNode.safetyScore = this.getAggregateSafetyScore(planNode.id);
    planNode.riskLevel = planNode.safetyScore < 40 ? 'critical' : planNode.safetyScore < 60 ? 'high' : planNode.safetyScore < 80 ? 'medium' : 'low';

    // Auto-flag high-risk plans as requiring approval
    if (planNode.safetyScore < 60) {
      planNode.requiresApproval = true;
    }

    logger.info('state-machine', `Plan created: "${params.title}" with ${params.steps.length} steps, safety=${planNode.safetyScore}`);

    return planNode;
  }

  /** Approve a plan for execution */
  approvePlan(planId: string): ExecutionNode {
    const plan = this.transitionNode(planId, 'approved');

    // Also approve all child steps that are in 'planned' state
    const children = this.getChildren(planId);
    for (const child of children) {
      if (child.state === 'planned') {
        try {
          this.transitionNode(child.id, 'approved');
        } catch {
          // Some steps may not allow planned→approved; that's ok
        }
      }
    }

    return plan;
  }

  /** Execute a plan — transitions through executing → completed/failed */
  async executePlan(planId: string, executor?: (step: ExecutionNode) => Promise<NodeResult>): Promise<ExecutionNode> {
    const plan = this.graph.nodes.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    // Plan must be approved
    if (plan.state !== 'approved') {
      throw new Error(`Plan must be "approved" before execution — current: "${plan.state}"`);
    }

    // Set up abort controller
    const abortController = new AbortController();
    this.activeExecutions.set(planId, abortController);

    // Transition plan to executing
    this.transitionNode(planId, 'executing');

    try {
      // Topological sort of steps
      const steps = this.getChildren(planId);
      const sortedSteps = this.topologicalSort(steps);

      for (const step of sortedSteps) {
        // Check cancellation
        if (abortController.signal.aborted) {
          this.transitionNode(planId, 'cancelled');
          return this.graph.nodes.get(planId)!;
        }

        // Skip completed/rolled_back steps
        if (step.state === 'completed' || step.state === 'rolled_back') continue;

        // Create rollback snapshot before executing
        await this.createRollbackSnapshot(step);

        // Transition step to executing
        this.transitionNode(step.id, 'executing');

        try {
          // Execute the step
          let result: NodeResult;

          if (executor) {
            result = await executor(step);
          } else if (this.executorRegistry.has((step.data as StepData).stepType)) {
            const exec = this.executorRegistry.get((step.data as StepData).stepType)!;
            result = await exec(step);
          } else {
            // Default: mark as completed with no result
            result = { success: true, data: {} };
          }

          // Update step result and transition to completed
          this.updateNodeData(step.id, step.data, result);
          this.transitionNode(step.id, 'completed');

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          step.retryCount += 1;

          if (step.retryCount < step.maxRetries) {
            // Reset to planned for retry
            this.updateNodeData(step.id, step.data, undefined, errorMsg);
            this.transitionNode(step.id, 'failed');
            this.transitionNode(step.id, 'planned'); // Allow retry
          } else {
            this.updateNodeData(step.id, step.data, undefined, errorMsg);
            this.transitionNode(step.id, 'failed');

            // Plan fails if a step fails
            this.transitionNode(planId, 'failed');
            return this.graph.nodes.get(planId)!;
          }
        }
      }

      // Check if all steps completed
      const children = this.getChildren(planId);
      const allDone = children.every(c => c.state === 'completed' || c.state === 'rolled_back');

      if (allDone) {
        this.transitionNode(planId, 'completed');
      }

    } finally {
      this.activeExecutions.delete(planId);
    }

    return this.graph.nodes.get(planId)!;
  }

  /** Cancel a running plan */
  cancelPlan(planId: string): void {
    const controller = this.activeExecutions.get(planId);
    if (controller) {
      controller.abort();
    }

    const plan = this.graph.nodes.get(planId);
    if (!plan) return;

    // Cancel all executing child steps
    for (const childId of plan.childIds) {
      const child = this.graph.nodes.get(childId);
      if (child && child.state === 'executing') {
        try {
          this.transitionNode(child.id, 'cancelled');
        } catch {
          // May not be valid transition; ignore
        }
      }
    }

    try {
      this.transitionNode(planId, 'cancelled');
    } catch {
      // May not be valid transition; ignore
    }
  }

  /** Retry a failed step */
  async retryStep(stepId: string, executor?: (step: ExecutionNode) => Promise<NodeResult>): Promise<ExecutionNode> {
    const step = this.graph.nodes.get(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    if (step.state !== 'failed') {
      throw new Error(`Can only retry failed steps — current: "${step.state}"`);
    }

    step.retryCount = 0;
    step.error = undefined;
    this.transitionNode(stepId, 'planned');

    return this.executeStep(stepId, executor);
  }

  /** Execute a single step */
  async executeStep(stepId: string, executor?: (step: ExecutionNode) => Promise<NodeResult>): Promise<ExecutionNode> {
    const step = this.graph.nodes.get(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    // Check dependencies
    for (const depId of step.dependsOn) {
      const dep = this.graph.nodes.get(depId);
      if (dep && dep.state !== 'completed') {
        throw new Error(`Step blocked by unmet dependency: ${dep.title} (${depId})`);
      }
    }

    // Create rollback snapshot
    await this.createRollbackSnapshot(step);

    // Transition to executing
    this.transitionNode(stepId, 'executing');

    try {
      let result: NodeResult;
      if (executor) {
        result = await executor(step);
      } else if (this.executorRegistry.has((step.data as StepData).stepType)) {
        const exec = this.executorRegistry.get((step.data as StepData).stepType)!;
        result = await exec(step);
      } else {
        result = { success: true, data: {} };
      }

      this.updateNodeData(stepId, step.data, result);
      this.transitionNode(stepId, 'completed');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateNodeData(stepId, step.data, undefined, errorMsg);
      this.transitionNode(stepId, 'failed');
    }

    return this.graph.nodes.get(stepId)!;
  }

  // ─── Rollback ──────────────────────────────────────────────────────────

  /** Roll back a single step */
  async rollbackStep(stepId: string): Promise<ExecutionNode> {
    const step = this.graph.nodes.get(stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);

    // Find the rollback snapshot
    const snapshot = await this.loadRollbackSnapshot(stepId);
    if (!snapshot) {
      throw new Error(`No rollback snapshot found for step ${stepId}`);
    }

    try {
      // Restore file content
      if (snapshot.filePath && snapshot.fileExisted === false) {
        // File was created — delete it
        await fs.promises.unlink(snapshot.filePath).catch(() => {});
      } else if (snapshot.filePath && snapshot.originalContent !== undefined) {
        // File was modified — restore original
        await fs.promises.writeFile(snapshot.filePath, snapshot.originalContent, 'utf-8');
      }

      // Create a rollback node in the graph
      this.createNode({
        type: 'rollback',
        title: `Rollback: ${step.title}`,
        description: `Rolled back step ${stepId}`,
        sourceIds: [stepId],
        parentId: step.parentId ?? undefined,
        data: {
          kind: 'rollback',
          targetNodeIds: [stepId],
          snapshots: [snapshot],
          success: true,
        },
        riskLevel: 'low',
      });

      this.transitionNode(stepId, 'rolled_back');
      this.emitEvent('rollback:completed', stepId);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.createNode({
        type: 'rollback',
        title: `Rollback FAILED: ${step.title}`,
        description: errorMsg,
        sourceIds: [stepId],
        parentId: step.parentId ?? undefined,
        data: {
          kind: 'rollback',
          targetNodeIds: [stepId],
          snapshots: [snapshot],
          success: false,
          error: errorMsg,
        },
        riskLevel: 'high',
      });

      this.emitEvent('rollback:failed', stepId);
    }

    return this.graph.nodes.get(stepId)!;
  }

  /** Roll back an entire plan */
  async rollbackPlan(planId: string): Promise<ExecutionNode> {
    const plan = this.graph.nodes.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    // Get completed steps in reverse order
    const completedSteps = this.getChildren(planId)
      .filter(c => c.state === 'completed')
      .reverse();

    for (const step of completedSteps) {
      try {
        await this.rollbackStep(step.id);
      } catch (err) {
        logger.error('state-machine', `Failed to rollback step ${step.id}: ${err}`);
      }
    }

    // Reset plan to planned
    this.transitionNode(planId, 'planned');

    return this.graph.nodes.get(planId)!;
  }

  // ─── Executor Registration ────────────────────────────────────────────

  /** Register an executor for a step type */
  registerExecutor(stepType: UnifiedStepType, executor: (node: ExecutionNode) => Promise<NodeResult>): void {
    this.executorRegistry.set(stepType, executor);
    logger.info('state-machine', `Registered executor for step type: ${stepType}`);
  }

  // ─── Event System ──────────────────────────────────────────────────────

  /** Subscribe to state machine events */
  onEvent(handler: StateMachineEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  private emitEvent(type: StateMachineEventType, nodeId: string, previousState?: NodeState, newState?: NodeState, data?: unknown): void {
    const event: StateMachineEvent = {
      type,
      nodeId,
      previousState,
      newState,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        logger.error('state-machine', `Event handler error: ${err}`);
      }
    }
  }

  // ─── Workspace ────────────────────────────────────────────────────────

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = path.resolve(root);
    logger.info('state-machine', `Workspace root set to: ${this.workspaceRoot}`);
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  // ─── Node Deletion ────────────────────────────────────────────────────

  /** Delete a node and all its children from the graph */
  deleteNode(nodeId: string): void {
    const node = this.graph.nodes.get(nodeId);
    if (!node) return;

    // Delete children first
    for (const childId of [...node.childIds]) {
      this.deleteNode(childId);
    }

    // Remove from parent's children list
    if (node.parentId) {
      const parent = this.graph.nodes.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter(id => id !== nodeId);
      }
    }

    // Remove from root IDs
    this.graph.rootIds = this.graph.rootIds.filter(id => id !== nodeId);

    // Remove node
    this.graph.nodes.delete(nodeId);
    this.graph.lastModified = Date.now();

    this.emitEvent('graph:changed', nodeId);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private topologicalSort(steps: ExecutionNode[]): ExecutionNode[] {
    const stepMap = new Map(steps.map(s => [s.id, s]));
    const visited = new Set<string>();
    const result: ExecutionNode[] = [];

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

  private async createRollbackSnapshot(node: ExecutionNode): Promise<void> {
    const stepData = node.data as StepData;
    const filePath = stepData.params?.filePath as string | undefined;

    if (!filePath) return;

    const absPath = path.resolve(this.workspaceRoot, filePath);

    const snapshot: RollbackSnapshot = {
      nodeId: node.id,
      timestamp: Date.now(),
    };

    try {
      await fs.promises.access(absPath, fs.constants.F_OK);
      snapshot.fileExisted = true;
      snapshot.filePath = absPath;
      snapshot.originalContent = await fs.promises.readFile(absPath, 'utf-8');
    } catch {
      snapshot.fileExisted = false;
      snapshot.filePath = absPath;
    }

    // Persist snapshot to disk
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
      const rollbackDir = path.join(homeDir, '.vibecode', 'rollbacks');
      await fs.promises.mkdir(rollbackDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(rollbackDir, `${node.id}.json`),
        JSON.stringify(snapshot, null, 2),
        'utf-8'
      );
    } catch (err) {
      logger.error('state-machine', `Failed to persist rollback snapshot: ${err}`);
    }
  }

  private async loadRollbackSnapshot(nodeId: string): Promise<RollbackSnapshot | null> {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
      const snapshotPath = path.join(homeDir, '.vibecode', 'rollbacks', `${nodeId}.json`);
      const data = await fs.promises.readFile(snapshotPath, 'utf-8');
      return JSON.parse(data) as RollbackSnapshot;
    } catch {
      return null;
    }
  }
}
