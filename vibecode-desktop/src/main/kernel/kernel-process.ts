// ─── VibeCode Desktop — Kernel Process (ARC 17) ──────────────────────────────
// KERNEL ISOLATION + IMPORT WALL ENFORCEMENT
//
// THIS IS THE ONLY MODULE IN THE ENTIRE CODEBASE ALLOWED TO IMPORT:
//   - child_process
//
// ALL other modules MUST import from this file instead of importing
// child_process directly. If any file outside /kernel/ imports child_process
// → the build MUST fail (import-firewall).
//
// This module provides TWO categories of operations:
//   1. WORKSPACE PROCESS EXECUTION — requires executionNodeId (gated)
//   2. INTERNAL APP PROCESS SPAWNING — no executionNodeId required (not gated)
//
// NON-NEGOTIABLE PRINCIPLE: "No Node → No Action" for workspace execution.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, exec, execSync, ChildProcess } from 'child_process';
import { authorizeTerminalOp } from '../core/execution-audit';
import { ExecutionGateway } from '../core/execution-gateway';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// HARD ASSERTION — "No Node → No Action" for workspace process execution
// ═══════════════════════════════════════════════════════════════════════════════

function assertNodeExists(nodeId: string | undefined, operation: string, command: string): asserts nodeId is string {
  if (!nodeId) {
    const error = new Error(
      `[KERNEL-PROCESS] HARD ASSERTION FAILED: No ExecutionNode for ${operation}: "${command}". ` +
      `"No Node → No Action" — this is a MANDATORY gate violation.`
    );
    logger.error('kernel-process', error.message);
    throw error;
  }

  if (!ExecutionGateway.isInitialized()) {
    throw new Error(
      `[KERNEL-PROCESS] HARD ASSERTION FAILED: ExecutionGateway not initialized. ` +
      `Cannot verify node ${nodeId} for ${operation}: "${command}".`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: WORKSPACE PROCESS EXECUTION — GATED
// These execute commands in the workspace and REQUIRE an executionNodeId.
// ═══════════════════════════════════════════════════════════════════════════════

export interface KernelSpawnOptions {
  /** The ExecutionNode ID that authorizes this spawn. MANDATORY. */
  nodeId: string;
  /** The command to spawn */
  command: string;
  /** Arguments to pass */
  args?: string[];
  /** Current working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether to use shell (default: true) */
  shell?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface KernelExecOptions {
  /** The ExecutionNode ID that authorizes this exec. MANDATORY. */
  nodeId: string;
  /** The command to execute */
  command: string;
  /** Current working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface KernelSpawnResult {
  pid: number | undefined;
  childProcess: ChildProcess;
}

/**
 * Spawn a process for workspace execution. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export function kernelSpawn(options: KernelSpawnOptions): KernelSpawnResult {
  assertNodeExists(options.nodeId, 'spawn', options.command);

  // Authorize in the audit system
  authorizeTerminalOp(`process:${options.nodeId}`, options.nodeId, options.command);

  const useShell = options.shell !== false;
  const isWindows = process.platform === 'win32';

  let spawnCommand: string;
  let spawnArgs: string[];

  if (useShell) {
    if (isWindows) {
      spawnCommand = 'cmd.exe';
      spawnArgs = ['/c', options.command, ...(options.args || [])];
    } else {
      spawnCommand = '/bin/sh';
      spawnArgs = ['-c', options.command, ...(options.args || [])];
    }
  } else {
    spawnCommand = options.command;
    spawnArgs = options.args || [];
  }

  const childProcess = spawn(spawnCommand, spawnArgs, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } as Record<string, string> : undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  logger.info('kernel-process', `Spawned process for node ${options.nodeId}: ${options.command} (pid=${childProcess.pid})`);

  return {
    pid: childProcess.pid,
    childProcess,
  };
}

/**
 * Execute a command and return output (async). REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export function kernelExec(options: KernelExecOptions): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  assertNodeExists(options.nodeId, 'exec', options.command);
  authorizeTerminalOp(`process:${options.nodeId}`, options.nodeId, options.command);

  return new Promise((resolve) => {
    exec(
      options.command,
      {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } as Record<string, string> : undefined,
        timeout: options.timeout,
        maxBuffer: 1024 * 1024, // 1MB
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error?.code ?? 0,
        });
      }
    );
  });
}

/**
 * Execute a command synchronously. REQUIRES an ExecutionNode ID.
 * If no nodeId is provided → HARD CRASH.
 */
export function kernelExecSync(options: KernelExecOptions): string {
  assertNodeExists(options.nodeId, 'execSync', options.command);
  authorizeTerminalOp(`process:${options.nodeId}`, options.nodeId, options.command);

  return execSync(options.command, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } as Record<string, string> : undefined,
    timeout: options.timeout,
    encoding: 'utf-8',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: INTERNAL APP PROCESS SPAWNING — UNGATED
// These are for VibeCode's own internal operations (auto-update, etc.)
// and do NOT touch user workspace, so no ExecutionNode required.
// ═══════════════════════════════════════════════════════════════════════════════

export interface KernelInternalSpawnOptions {
  /** The command to spawn */
  command: string;
  /** Arguments to pass */
  args?: string[];
  /** Current working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether to use shell */
  shell?: boolean;
  /** stdio configuration */
  stdio?: any;
}

/**
 * Spawn a process for internal app operations. No ExecutionNode required.
 * This is for VibeCode's own operations (auto-update, health check, etc.).
 */
export function kernelSpawnInternal(options: KernelInternalSpawnOptions): ChildProcess {
  const useShell = options.shell ?? false;

  const childProcess = spawn(options.command, options.args || [], {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } as Record<string, string> : undefined,
    shell: useShell,
    stdio: options.stdio || 'pipe',
  });

  logger.info('kernel-process', `Spawned internal process: ${options.command} (pid=${childProcess.pid})`);

  return childProcess;
}

/**
 * Execute a command for internal app operations (async). No ExecutionNode required.
 */
export function kernelExecInternal(command: string, options?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } as Record<string, string> : undefined,
        timeout: options?.timeout,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error?.code ?? 0,
        });
      }
    );
  });
}

/**
 * Execute a command synchronously for internal app operations. No ExecutionNode required.
 */
export function kernelExecInternalSync(command: string, options?: { cwd?: string; env?: Record<string, string>; timeout?: number }): string {
  return execSync(command, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } as Record<string, string> : undefined,
    timeout: options?.timeout,
    encoding: 'utf-8',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: RAW child_process RE-EXPORT FOR KERNEL-INTERNAL USE ONLY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @internal KERNEL USE ONLY
 * Raw ChildProcess type for terminal session management in kernel-terminal.ts.
 */
export type { ChildProcess };

/**
 * @internal KERNEL USE ONLY
 * Raw spawn function for kernel-terminal.ts to create PTY fallback sessions.
 */
export const rawSpawn = spawn;
