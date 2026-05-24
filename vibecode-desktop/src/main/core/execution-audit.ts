// ─── VibeCode Desktop — Execution Audit Watchdog (ARC 16) ──────────────────
// HARD ENFORCEMENT — BYPASS ELIMINATION
//
// NON-NEGOTIABLE: "No Node → No Action"
// There is NO soft mode. There is NO audit bypass.
// If a bypass is detected, the operation is BLOCKED.
// If the audit system is disabled, that is itself a violation.
// If the gateway is not initialized, we are in a startup window and
// ALL mutations are blocked until it IS initialized.
//
// ARC 16: Removed all escape hatches:
//   - No more `if (!auditActive) return true` — audit CANNOT be disabled
//   - No more `if (!isGatewayInitialized()) return true` — block until gateway is ready
//   - No more `return !productionMode` — ALWAYS block on violation
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
  // ARC 16: Audit CANNOT be disabled. Removed `if (!auditActive) return true`.

  const authorized = authorizedFsOps.get(filePath);

  // Check if there's a recent authorization for this path
  if (authorized && Date.now() - authorized.timestamp < 60000) {
    // Authorized within the last 60 seconds — valid (extended from 30s for slow operations)
    return true;
  }

  // ARC 16: If the gateway is NOT initialized, BLOCK the operation.
  // Previously this was a pass-through. Now: if gateway isn't ready, nothing mutates.
  if (!isGatewayInitialized()) {
    recordViolation({
      type: operation === 'delete' ? 'fs_delete_no_node' : operation === 'rename' ? 'fs_rename_no_node' : 'fs_write_no_node',
      description: `FS ${operation} on "${filePath}" BLOCKED — ExecutionGateway not initialized`,
      target: filePath,
      stack: new Error().stack,
      timestamp: Date.now(),
      severity: 'critical',
    });
    return false; // HARD BLOCK — gateway must be initialized before any FS mutation
  }

  // VIOLATION DETECTED — always critical, always block
  recordViolation({
    type: operation === 'delete' ? 'fs_delete_no_node' : operation === 'rename' ? 'fs_rename_no_node' : operation === 'mkdir' ? 'fs_write_no_node' : 'fs_write_no_node',
    description: `FS ${operation} on "${filePath}" without gateway authorization`,
    target: filePath,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: 'critical', // ARC 16: ALWAYS critical — no more 'warn' mode
  });

  return false; // ARC 16: ALWAYS block — no more dev/prod split
}

/**
 * Check if a terminal operation was authorized. Call from terminal-handlers.
 * If NOT authorized, record a violation.
 *
 * Returns true if authorized, false if this is a bypass.
 */
export function checkTerminalAuthorization(sessionId: string, command: string): boolean {
  // ARC 16: Audit CANNOT be disabled.

  const key = `${sessionId}:${command}`;
  const authorized = authorizedTerminalOps.get(key);

  if (authorized && Date.now() - authorized.timestamp < 60000) {
    return true;
  }

  // ARC 16: If gateway is NOT initialized, BLOCK the operation.
  if (!isGatewayInitialized()) {
    recordViolation({
      type: 'terminal_spawn_no_node',
      description: `Terminal command "${command.substring(0, 50)}" in session ${sessionId} BLOCKED — ExecutionGateway not initialized`,
      target: command,
      stack: new Error().stack,
      timestamp: Date.now(),
      severity: 'critical',
    });
    return false; // HARD BLOCK
  }

  // VIOLATION DETECTED — always critical, always block
  recordViolation({
    type: 'terminal_spawn_no_node',
    description: `Terminal command "${command.substring(0, 50)}" in session ${sessionId} without gateway authorization`,
    target: command,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: 'critical', // ARC 16: ALWAYS critical
  });

  return false; // ARC 16: ALWAYS block
}

/**
 * Record a Monaco save that bypassed the gateway.
 */
export function reportMonacoBypass(filePath: string): void {
  // ARC 16: Always record — audit cannot be disabled

  recordViolation({
    type: 'monaco_save_no_node',
    description: `Monaco save of "${filePath}" without gateway authorization`,
    target: filePath,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: 'critical', // ARC 16: ALWAYS critical
  });
}

/**
 * Record a generic bypass violation.
 */
export function reportExecBypass(target: string, description: string): void {
  // ARC 16: Always record — audit cannot be disabled

  recordViolation({
    type: 'exec_no_node',
    description,
    target,
    stack: new Error().stack,
    timestamp: Date.now(),
    severity: 'critical', // ARC 16: ALWAYS critical
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

  // ARC 16: ALL violations are now critical
  logger.error('audit', `CRITICAL BYPASS: ${violation.description}`);
  auditLog.auditLog('gateway:bypass:critical', violation);

  // HARD FAILURE: In production, crash immediately.
  // In development, throw but allow catch for graceful degradation.
  if (productionMode) {
    // Unrecoverable — crash the process
    throw new Error(`[AUDIT] CRITICAL BYPASS DETECTED: ${violation.description}`);
  } else {
    // Development: still throw (hard failure), but callers can catch
    // to provide user feedback rather than silent crash
    throw new Error(`[AUDIT] BYPASS BLOCKED: ${violation.description}`);
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
  // ARC 16: `active` can no longer be set to false. Audit is ALWAYS active.
  // This eliminates the "disable audit to bypass" escape hatch.
  if (options.active === false) {
    logger.error('audit', 'ATTEMPTED TO DISABLE AUDIT — this is a MANDATORY enforcement system. Request denied.');
    // Record this as a violation itself
    recordViolation({
      type: 'exec_no_node',
      description: 'Attempted to disable the audit system — this is a security violation',
      target: 'configureAudit',
      timestamp: Date.now(),
      severity: 'critical',
    });
    return; // Do NOT disable audit
  }

  if (options.productionMode !== undefined) productionMode = options.productionMode;

  logger.info('audit', `Audit configured: active=true (MANDATORY), productionMode=${productionMode}`);
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
