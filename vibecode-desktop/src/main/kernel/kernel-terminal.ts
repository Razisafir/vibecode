// ─── VibeCode Desktop — Kernel Terminal (ARC 17) ─────────────────────────────
// KERNEL ISOLATION + IMPORT WALL ENFORCEMENT
//
// THIS IS THE ONLY MODULE IN THE ENTIRE CODEBASE ALLOWED TO IMPORT:
//   - node-pty
//
// ALL other modules MUST import from this file instead of importing
// node-pty directly. If any file outside /kernel/ imports node-pty
// → the build MUST fail (import-firewall).
//
// This module provides terminal session creation. Terminal sessions are
// created via the gateway, and individual commands routed through it.
//
// NON-NEGOTIABLE PRINCIPLE: "No Node → No Action" for terminal command execution.
// ─────────────────────────────────────────────────────────────────────────────

import { authorizeTerminalOp } from '../core/execution-audit';
import { ExecutionGateway } from '../core/execution-gateway';
import { logger } from '../utils/logger';
import { rawSpawn, type ChildProcess } from './kernel-process';

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMIC node-pty LOADING — The only place node-pty is imported
// ═══════════════════════════════════════════════════════════════════════════════

let nodePty: any = null;
let ptyAvailable: boolean = false;

try {
  nodePty = require('node-pty');
  ptyAvailable = true;
  logger.info('kernel-terminal', 'node-pty loaded successfully');
} catch {
  logger.info('kernel-terminal', 'node-pty not available, falling back to child_process.spawn');
  ptyAvailable = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** The type of terminal session */
export type TerminalType = 'pty' | 'spawn';

/** A terminal session (either PTY or child_process) */
export interface TerminalSession {
  /** The session ID */
  id: string;
  /** The underlying process (PTY or ChildProcess) */
  process: any;
  /** Whether this is a PTY or spawn-based session */
  type: TerminalType;
  /** Current working directory */
  cwd: string;
  /** Shell executable */
  shell: string;
  /** Process ID */
  pid?: number;
  /** When the session was created */
  createdAt: number;
}

export interface CreateTerminalOptions {
  /** Session ID (generated if not provided) */
  id?: string;
  /** Current working directory */
  cwd: string;
  /** Shell executable */
  shell: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Initial columns (PTY only) */
  cols?: number;
  /** Initial rows (PTY only) */
  rows?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERMINAL SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if node-pty is available.
 */
export function isPtyAvailable(): boolean {
  return ptyAvailable;
}

/**
 * Create a new terminal session.
 * This creates the PTY/spawn process but does NOT execute any commands.
 * Commands must be routed through the gateway separately.
 */
export function kernelTerminalCreate(options: CreateTerminalOptions): TerminalSession {
  const id = options.id || `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mergedEnv = { ...process.env, ...options.env, TERM: 'xterm-256color' };

  if (ptyAvailable && nodePty) {
    const ptyProcess = nodePty.spawn(options.shell, [], {
      name: 'xterm-256color',
      cols: options.cols ?? 120,
      rows: options.rows ?? 30,
      cwd: options.cwd,
      env: mergedEnv,
    });

    return {
      id,
      process: ptyProcess,
      type: 'pty',
      cwd: options.cwd,
      shell: options.shell,
      pid: ptyProcess.pid,
      createdAt: Date.now(),
    };
  } else {
    // Fallback to child_process.spawn
    const childProcess = rawSpawn(options.shell, [], {
      cwd: options.cwd,
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      id,
      process: childProcess,
      type: 'spawn',
      cwd: options.cwd,
      shell: options.shell,
      pid: childProcess.pid,
      createdAt: Date.now(),
    };
  }
}

/**
 * Write data to a terminal session.
 * This is the low-level write — callers should ensure the gateway
 * has authorized any command before writing it.
 */
export function kernelTerminalWrite(session: TerminalSession, data: string): void {
  if (session.type === 'pty') {
    session.process.write(data);
  } else {
    session.process.stdin.write(data);
  }
}

/**
 * Resize a terminal session (PTY only).
 */
export function kernelTerminalResize(session: TerminalSession, cols: number, rows: number): boolean {
  if (session.type === 'pty') {
    try {
      session.process.resize(cols, rows);
      return true;
    } catch {
      return false;
    }
  }
  // child_process doesn't support resize
  return false;
}

/**
 * Kill a terminal session.
 */
export function kernelTerminalKill(session: TerminalSession, signal: string = 'SIGTERM'): void {
  try {
    if (session.type === 'pty') {
      session.process.kill(signal);
    } else {
      session.process.kill(signal);
    }
  } catch {
    // Process may already be dead
  }
}

/**
 * Register data handler on a terminal session.
 */
export function kernelTerminalOnData(session: TerminalSession, handler: (data: string) => void): void {
  if (session.type === 'pty') {
    session.process.onData(handler);
  } else {
    session.process.stdout.on('data', (data: Buffer) => {
      handler(data.toString('utf-8'));
    });
    session.process.stderr.on('data', (data: Buffer) => {
      handler(data.toString('utf-8'));
    });
  }
}

/**
 * Register exit handler on a terminal session.
 */
export function kernelTerminalOnExit(session: TerminalSession, handler: (exitCode: number, signal?: number) => void): void {
  if (session.type === 'pty') {
    session.process.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      handler(exitCode, signal);
    });
  } else {
    session.process.on('close', (code: number, signal: string | null) => {
      handler(code, signal ? parseInt(signal, 10) : undefined);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATED COMMAND EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a command through a terminal session with gateway enforcement.
 * REQUIRES an ExecutionNode ID.
 */
export function kernelTerminalExecuteCommand(
  session: TerminalSession,
  command: string,
  nodeId: string
): void {
  if (!nodeId) {
    throw new Error(
      `[KERNEL-TERMINAL] HARD ASSERTION FAILED: No ExecutionNode for command "${command}". ` +
      `"No Node → No Action" — this is a MANDATORY gate violation.`
    );
  }

  if (!ExecutionGateway.isInitialized()) {
    throw new Error(
      `[KERNEL-TERMINAL] HARD ASSERTION FAILED: ExecutionGateway not initialized. ` +
      `Cannot execute command "${command}".`
    );
  }

  // Authorize in the audit system
  authorizeTerminalOp(session.id, nodeId, command);

  // Write the command to the terminal
  kernelTerminalWrite(session, command + '\r');

  logger.info('kernel-terminal', `Executed command on session ${session.id} with node ${nodeId}: ${command.substring(0, 60)}`);
}
