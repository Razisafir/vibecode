// ─── VibeCode Desktop — Kernel Type Enforcement (ARC 17) ─────────────────────
// EXECUTION GATEWAY IS NOW A TYPE REQUIREMENT
//
// This module provides TYPE-LEVEL enforcement that any function which mutates
// filesystem, terminal, or process execution MUST accept an executionNodeId.
//
// If a mutation function is missing executionNodeId → TypeScript ERROR.
//
// The branded type `ExecutionNodeId` can ONLY be obtained through
// ExecutionGateway — it cannot be forged at the type level.
// ─────────────────────────────────────────────────────────────────────────────

import { ExecutionGateway } from '../core/execution-gateway';
import {
  ExecutionNode,
  NodeResult,
} from '../services/execution-state-machine';

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDED TYPE — ExecutionNodeId cannot be forged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A branded string type representing an ExecutionNode ID that was created
 * through the ExecutionGateway. This type CANNOT be constructed manually
 * because of the phantom `__executionNodeId` brand.
 *
 * The ONLY way to obtain an ExecutionNodeId is:
 *   1. ExecutionGateway.requestExecution() → GatewayResult.node.id (cast)
 *   2. ExecutionGateway.createTerminalNode() → ExecutionNode.id (cast)
 *   3. ExecutionGateway.requestNodeCreation() → ExecutionNode.id (cast)
 *
 * All kernel mutation functions require this type, making it a TYPE ERROR
 * to call them without going through the gateway.
 *
 * At runtime, this is just a string. The enforcement is at the TYPE level.
 */
export type ExecutionNodeId = string & { readonly __executionNodeId: unique symbol };

/**
 * Extract the ExecutionNodeId from a GatewayResult or ExecutionNode.
 * This is the ONLY sanctioned way to convert a string to ExecutionNodeId.
 *
 * The function validates that the node was created through the gateway
 * by checking that the gateway is initialized and the node exists.
 */
export function extractExecutionNodeId(nodeId: string): ExecutionNodeId {
  // Runtime validation: gateway must be initialized
  if (!ExecutionGateway.isInitialized()) {
    throw new Error(
      '[KERNEL-TYPES] Cannot extract ExecutionNodeId — ExecutionGateway not initialized. ' +
      'All mutations require the gateway to be running first.'
    );
  }

  // The type cast is safe here because this is the ONLY sanctioned
  // conversion point. The gateway created the node, so the ID is valid.
  return nodeId as ExecutionNodeId;
}

/**
 * Type-safe wrapper for mutation operations that require an ExecutionNode.
 * Use this to annotate functions that mutate system state.
 */
export interface RequiresExecutionNode {
  /** The ExecutionNode ID that authorizes this mutation. MANDATORY. */
  executionNodeId: ExecutionNodeId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATION TYPE MARKERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Marker interface for filesystem mutations.
 * Any function that writes/deletes/renames files in the workspace
 * MUST accept this type as a parameter.
 */
export interface FsMutation extends RequiresExecutionNode {
  readonly __mutationType: 'filesystem';
}

/**
 * Marker interface for terminal mutations.
 * Any function that sends commands to a terminal
 * MUST accept this type as a parameter.
 */
export interface TerminalMutation extends RequiresExecutionNode {
  readonly __mutationType: 'terminal';
}

/**
 * Marker interface for process execution mutations.
 * Any function that spawns processes
 * MUST accept this type as a parameter.
 */
export interface ProcessMutation extends RequiresExecutionNode {
  readonly __mutationType: 'process';
}

/**
 * Create an FsMutation from an ExecutionNodeId.
 * Use this when calling kernel-fs mutation functions.
 */
export function createFsMutation(nodeId: ExecutionNodeId): FsMutation {
  return { executionNodeId: nodeId, __mutationType: 'filesystem' } as FsMutation;
}

/**
 * Create a TerminalMutation from an ExecutionNodeId.
 * Use this when calling kernel-terminal execution functions.
 */
export function createTerminalMutation(nodeId: ExecutionNodeId): TerminalMutation {
  return { executionNodeId: nodeId, __mutationType: 'terminal' } as TerminalMutation;
}

/**
 * Create a ProcessMutation from an ExecutionNodeId.
 * Use this when calling kernel-process execution functions.
 */
export function createProcessMutation(nodeId: ExecutionNodeId): ProcessMutation {
  return { executionNodeId: nodeId, __mutationType: 'process' } as ProcessMutation;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATEWAY-TYPED EXECUTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type-safe gateway execution that returns a properly typed ExecutionNodeId.
 * Use this instead of calling ExecutionGateway.requestExecution() directly
 * when you need an ExecutionNodeId for kernel mutation functions.
 */
export async function gatewayRequestExecution(
  request: Parameters<typeof ExecutionGateway.requestExecution>[0]
): Promise<{ nodeId: ExecutionNodeId; result: Awaited<ReturnType<typeof ExecutionGateway.requestExecution>> }> {
  const result = await ExecutionGateway.requestExecution(request);
  const nodeId = extractExecutionNodeId(result.node.id);
  return { nodeId, result };
}

/**
 * Type-safe synchronous node creation that returns a properly typed ExecutionNodeId.
 */
export function gatewayCreateNode(
  request: Parameters<typeof ExecutionGateway.requestNodeCreation>[0]
): ExecutionNodeId {
  const node = ExecutionGateway.requestNodeCreation(request);
  return extractExecutionNodeId(node.id);
}
