// ─── VibeCode Desktop — Execution Audit Watchdog (ARC 15) ──────────────────
// AUTO-BYPASS DETECTOR
//
// Scans runtime behavior for graph violations:
// - FS writes without a corresponding ExecutionNode
// - Terminal spawns without a corresponding ExecutionNode
// - Monaco saves without a corresponding ExecutionNode
//
// MODE:
//   dev:  warn (log violation but allow)
//   prod: block or crash
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';
import { ExecutionGateway, isGatewayInitialized } from './execution-gateway';

// ═══════════════════════════════════════════════════════════════════════════════
// VIOLATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ViolationSeverity = 'warn' | 'error' | 'critical';

export interface GraphViolation {
  /** Type of violation */
  type: 'fs_write_no_node' | 'fs_delete_no_node' | 'fs_rename_no_node' | 'terminal_spawn_no_node' | 'monaco_save_no_node' | 'exec_no_node';
  /** Description of what happened */
  description: string;
  /** The path or command involved */
  target: string;
  /** Stack trace at the point of violation */
  stack?: string;
  /** Timestamp */
  timestamp: number;
  /** Severity */
  severity: ViolationSeverity;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIOLATION TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

/** All violations recorded during this session */
const violations: GraphViolation[] = [];

/** Violation counts by type */
const violationCounts: Record<string, number> = {};

/** Whether the audit system is active */
let auditActive: boolean = true;

/** Whether we're in production mode (stricter enforcement) */
let productionMode: boolean = false;

// ═══════════════════════════════════════════════════════════════════════════════
// TRACKED FS OPERATIONS — Registry of all FS operations that go through gateway
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tracks which file paths have been authorized by the gateway.
 * When fs:writeFile is called, we check if the path was authorized.
 * If not, it's a bypass violation.
 */
const authorizedFsOps: Map<string, { nodeId: string; timestamp: number; operation: string }> = new Map();

/**
 * Tracks which terminal sessions have been authorized by the gateway.
 * When a command is written to a PTY, we check if it was authorized.
 * If not, it's a bypass violation.
 */
const authorizedTerminalOps: Map<string, { nodeId: string; timestamp: number; command: string }> = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register that an FS operation was authorized by the gateway.
 * Call this BEFORE the FS operation is performed.
 */
export function authorizeFsOp(filePath: string, nodeId: string, operation: string): void {
  authorizedFsOps.set(filePath, { nodeId, timestamp: Date.now(), operation });
}

/**
 * Register that a terminal operation was authorized by the gateway.
 * Call this BEFORE the command is sent to the PTY.
 */
export function authorizeTerminalOp(sessionId: string, nodeId: string, command: string): void {
  authorizedTerminalOps.set(`${sessionId}:${command}`, { nodeId, timestamp: Date.now(), command });
}

/**
 * Check if an FS operation was authorized. Call from fs-handlers.
 * If NOT authorized, record a violation.
 *
 * Returns true if authorized, false if this is a bypass.
 */
export function checkFsAuthorization(filePath: string, operation: string): boolean {
  if (!auditActive) return true; // Audit disabled — allow

  const authorized = authorizedFsOps.get(filePath);

  // Check if there's a recent authorization for this path
  if (authorized && Date.now() - authorized.timestamp < 30000) {
    // Authorized within the last 30 seconds — valid
    return true;
  }

  // Also check if the gateway is initialized — if it's not, we can't enforce
  if (!isGatewayInitialized()) {
    // Gateway not initialized — can't enforce, but don't record violation
    return true;
  }

  // VIOLATION DETECTED
  recordViolation({
    type: operation === 'delete' ? 'fs_delete_no_node' : operation === 'rename' ? 'fs_rename_no_node' : 'fs_write_no_node',
    description: `FS ${operation} on "${filePath}" without gateway authorization`,
    target: filePath,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: productionMode ? 'critical' : 'warn',
  });

  return !productionMode; // In dev mode, warn but allow; in prod, block
}

/**
 * Check if a terminal operation was authorized. Call from terminal-handlers.
 * If NOT authorized, record a violation.
 *
 * Returns true if authorized, false if this is a bypass.
 */
export function checkTerminalAuthorization(sessionId: string, command: string): boolean {
  if (!auditActive) return true;

  const key = `${sessionId}:${command}`;
  const authorized = authorizedTerminalOps.get(key);

  if (authorized && Date.now() - authorized.timestamp < 30000) {
    return true;
  }

  if (!isGatewayInitialized()) {
    return true;
  }

  // VIOLATION DETECTED
  recordViolation({
    type: 'terminal_spawn_no_node',
    description: `Terminal command "${command.substring(0, 50)}" in session ${sessionId} without gateway authorization`,
    target: command,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: productionMode ? 'critical' : 'warn',
  });

  return !productionMode;
}

/**
 * Record a Monaco save that bypassed the gateway.
 */
export function reportMonacoBypass(filePath: string): void {
  if (!auditActive) return;

  recordViolation({
    type: 'monaco_save_no_node',
    description: `Monaco save of "${filePath}" without gateway authorization`,
    target: filePath,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: productionMode ? 'critical' : 'warn',
  });
}

/**
 * Record a generic bypass violation.
 */
export function reportExecBypass(target: string, description: string): void {
  if (!auditActive) return;

  recordViolation({
    type: 'exec_no_node',
    description,
    target,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: productionMode ? 'critical' : 'warn',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIOLATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function recordViolation(violation: GraphViolation): void {
  violations.push(violation);

  // Update counts
  const count = violationCounts[violation.type] || 0;
  violationCounts[violation.type] = count + 1;

  // Log based on severity
  switch (violation.severity) {
    case 'critical':
      logger.error('audit', `CRITICAL BYPASS: ${violation.description}`);
      auditLog.auditLog('gateway:bypass:critical', violation);
      // In production, this would crash or block
      if (productionMode) {
        throw new Error(`[AUDIT] CRITICAL BYPASS DETECTED: ${violation.description}`);
      }
      break;
    case 'error':
      logger.error('audit', `BYPASS DETECTED: ${violation.description}`);
      auditLog.auditLog('gateway:bypass:error', violation);
      break;
    case 'warn':
      logger.warn('audit', `BYPASS WARNING: ${violation.description}`);
      break;
  }
}

/**
 * Get all violations recorded during this session.
 */
export function getViolations(): GraphViolation[] {
  return [...violations];
}

/**
 * Get violation counts by type.
 */
export function getViolationCounts(): Record<string, number> {
  return { ...violationCounts };
}

/**
 * Get the total number of violations.
 */
export function getViolationCount(): number {
  return violations.length;
}

/**
 * Check if there are zero bypass events in the runtime log.
 * This is one of the ARC 15 success criteria.
 */
export function isAuditClean(): boolean {
  return violations.length === 0;
}

/**
 * Clear all recorded violations (for testing).
 */
export function clearViolations(): void {
  violations.length = 0;
  for (const key of Object.keys(violationCounts)) {
    delete violationCounts[key];
  }
  authorizedFsOps.clear();
  authorizedTerminalOps.clear();
}

/**
 * Configure the audit system.
 */
export function configureAudit(options: {
  active?: boolean;
  productionMode?: boolean;
}): void {
  if (options.active !== undefined) auditActive = options.active;
  if (options.productionMode !== undefined) productionMode = options.productionMode;

  logger.info('audit', `Audit configured: active=${auditActive}, productionMode=${productionMode}`);
}

/**
 * Generate an audit report for the current session.
 */
export function generateAuditReport(): {
  totalViolations: number;
  violationsByType: Record<string, number>;
  violations: GraphViolation[];
  isClean: boolean;
  mode: string;
} {
  return {
    totalViolations: violations.length,
    violationsByType: { ...violationCounts },
    violations: [...violations],
    isClean: violations.length === 0,
    mode: productionMode ? 'production' : 'development',
  };
}
