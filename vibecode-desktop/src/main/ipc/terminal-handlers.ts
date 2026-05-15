import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as os from 'os';
import { getStateMachine } from './state-machine-handlers';
import { TerminalCommandData } from '../services/execution-state-machine';
import { ExecutionGateway } from '../core/execution-gateway';
import { authorizeTerminalOp, checkTerminalAuthorization } from '../core/execution-audit';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TerminalSession {
  id: string;
  pty: any; // node-pty IPty or child_process ChildProcess
  type: 'pty' | 'spawn';
  cwd: string;
  shell: string;
  pid?: number;
  createdAt: number;
}

// ─── ARC 14: Terminal Command Tracking ────────────────────────────────────
// Accumulates output for each command entered via the terminal,
// then creates a terminal_command ExecutionNode in the ESM graph
// when the command completes (or on flush).

interface PendingCommand {
  nodeId: string;          // ESM node ID (created at command start)
  sessionId: string;       // Terminal session ID
  command: string;         // The command string
  cwd: string;             // Working directory
  stdout: string;          // Accumulated stdout
  stderr: string;          // Accumulated stderr
  startTime: number;       // When the command was sent
  isAI: boolean;           // Whether this was AI-initiated
}

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function err(message: string): IpcResult {
  return { success: false, error: message };
}

// ─── State ──────────────────────────────────────────────────────────────────

const sessions: Map<string, TerminalSession> = new Map();

// ARC 14: Pending command tracking — maps sessionId → command tracking state
const sessionCommands: Map<string, {
  currentCommand: string;         // The current command being typed/entered
  commandStartIndex: number;      // Output buffer index where this command's output starts
  pendingNode: PendingCommand | null;
  outputBuffer: string;           // Accumulated output for current command
}> = new Map();

let nodePty: any = null;
let ptyAvailable = false;

// Try to dynamically import node-pty
try {
  nodePty = require('node-pty');
  ptyAvailable = true;
  console.log('[Terminal] node-pty loaded successfully');
} catch {
  console.log('[Terminal] node-pty not available, falling back to child_process.spawn');
  ptyAvailable = false;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'cmd.exe';
  }
  return process.env.SHELL ?? '/bin/bash';
}

function getHomeDir(): string {
  return os.homedir();
}

/**
 * ARC 15: Create a terminal_command ExecutionNode via the ExecutionGateway.
 * The Gateway is the ONLY valid path for terminal execution.
 * "No Node → No Action" — if the gateway blocks, the command is NOT executed.
 */
function trackTerminalCommandStart(sessionId: string, command: string, cwd: string): void {
  // Only track meaningful commands (skip empty, whitespace-only, or just pressing Enter)
  const trimmed = command.trim();
  if (!trimmed) return;

  // ARC 15: Route through ExecutionGateway — the ONLY valid execution surface
  let node;
  if (ExecutionGateway.isInitialized()) {
    try {
      node = ExecutionGateway.createTerminalNode({
        command: trimmed,
        cwd,
        terminalId: sessionId,
        isAI: false,
      });

      // Authorize this operation in the audit system
      authorizeTerminalOp(sessionId, node.id, trimmed);
    } catch (err) {
      // Gateway blocked the command (safety gate)
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Terminal/ARC15] GATEWAY BLOCKED command: ${msg}`);
      // DO NOT execute the command — throw to prevent PTY write
      throw new Error(`Terminal command blocked by execution gateway: ${msg}`);
    }
  } else {
    // Fallback to direct ESM access (gateway not yet initialized)
    const sm = getStateMachine();
    if (!sm) return;

    node = sm.createNode({
      type: 'terminal_command',
      title: `Terminal: ${trimmed.substring(0, 60)}${trimmed.length > 60 ? '...' : ''}`,
      description: `Command executed in terminal session ${sessionId}`,
      data: {
        kind: 'terminal_command',
        command: trimmed,
        cwd,
        terminalId: sessionId,
        stdout: '',
        stderr: '',
        exitCode: null,
        truncated: false,
        isAI: false,
      } as TerminalCommandData,
      riskLevel: 'low',
    });
  }

  // Track as pending
  const existing = sessionCommands.get(sessionId);
  if (existing && existing.pendingNode) {
    // Finalize previous pending command
    finalizePendingCommand(sessionId, 0);
  }

  sessionCommands.set(sessionId, {
    currentCommand: trimmed,
    commandStartIndex: 0,
    pendingNode: {
      nodeId: node.id,
      sessionId,
      command: trimmed,
      cwd,
      stdout: '',
      stderr: '',
      startTime: Date.now(),
      isAI: false,
    },
    outputBuffer: '',
  });

  console.log(`[Terminal/ARC14] Tracked command start: "${trimmed.substring(0, 40)}" → node ${node.id.substring(0, 8)}`);
}

/**
 * ARC 14: Finalize a pending terminal command by updating the ESM node
 * with the captured output and transitioning to completed.
 */
function finalizePendingCommand(sessionId: string, exitCode: number): void {
  const entry = sessionCommands.get(sessionId);
  if (!entry || !entry.pendingNode) return;

  const sm = getStateMachine();
  if (!sm) return;

  const pending = entry.pendingNode;
  const output = entry.outputBuffer;

  // Truncate output if too large (50KB max stored in graph)
  const MAX_OUTPUT = 50000;
  const truncated = output.length > MAX_OUTPUT;
  const storedOutput = truncated ? output.substring(output.length - MAX_OUTPUT) : output;

  // Update the node data with captured output
  sm.updateNodeData(pending.nodeId, {
    kind: 'terminal_command',
    command: pending.command,
    cwd: pending.cwd,
    terminalId: pending.sessionId,
    stdout: storedOutput,
    stderr: '',
    exitCode,
    truncated,
    isAI: false,
  } as TerminalCommandData);

  // Transition to completed
  try {
    sm.transitionNode(pending.nodeId, 'completed');
  } catch {
    // May already be in a terminal state
  }

  console.log(`[Terminal/ARC14] Finalized command: "${pending.command.substring(0, 40)}" exit=${exitCode} output=${output.length}chars`);

  // Clear pending
  entry.pendingNode = null;
  entry.outputBuffer = '';
}

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerTerminalHandlers(): void {
  // ── terminal:create ────────────────────────────────────────────────────
  ipcMain.handle(
    'terminal:create',
    async (event, optionsOrCwd?: string | { cwd?: string; shell?: string; env?: Record<string, string> }) => {
      try {
        const id = uuidv4();

        // Support both string (cwd) and object (options) for preload compatibility
        let cwd: string;
        let shell: string;
        let env: Record<string, string> | undefined;

        if (typeof optionsOrCwd === 'string') {
          cwd = optionsOrCwd ? path.resolve(optionsOrCwd) : getHomeDir();
          shell = getDefaultShell();
        } else {
          cwd = optionsOrCwd?.cwd ? path.resolve(optionsOrCwd.cwd) : getHomeDir();
          shell = optionsOrCwd?.shell ?? getDefaultShell();
          env = optionsOrCwd?.env;
        }

        const mergedEnv = { ...process.env, ...env, TERM: 'xterm-256color' };

        if (ptyAvailable && nodePty) {
          // ─── node-pty path ─────────────────────────────────────────────
          const ptyProcess = nodePty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: 120,
            rows: 30,
            cwd,
            env: mergedEnv,
          });

          const session: TerminalSession = {
            id,
            pty: ptyProcess,
            type: 'pty',
            cwd,
            shell,
            pid: ptyProcess.pid,
            createdAt: Date.now(),
          };

          // ARC 14: Initialize command tracking for this session
          sessionCommands.set(id, {
            currentCommand: '',
            commandStartIndex: 0,
            pendingNode: null,
            outputBuffer: '',
          });

          // Forward PTY data to renderer + ARC 14: capture output
          ptyProcess.onData((data: string) => {
            try {
              const win = BrowserWindow.fromWebContents(event.sender);
              if (win && !win.isDestroyed()) {
                // Legacy format for preload compatibility: (id, data) as separate args
                win.webContents.send('terminal:data', id, data);
              }
            } catch {
              // Window might be closed
            }

            // ARC 14: Accumulate output for pending command tracking
            const entry = sessionCommands.get(id);
            if (entry) {
              entry.outputBuffer += data;
            }
          });

          ptyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
            try {
              const win = BrowserWindow.fromWebContents(event.sender);
              if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:exit', id, exitCode, signal);
              }
            } catch {
              // Window might be closed
            }

            // ARC 14: Finalize any pending command on session exit
            finalizePendingCommand(id, exitCode ?? 0);
            sessionCommands.delete(id);
            sessions.delete(id);
          });

          sessions.set(id, session);
        } else {
          // ─── child_process.spawn fallback ──────────────────────────────
          const { spawn } = require('child_process');
          const childProcess = spawn(shell, [], {
            cwd,
            env: mergedEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          const session: TerminalSession = {
            id,
            pty: childProcess,
            type: 'spawn',
            cwd,
            shell,
            pid: childProcess.pid,
            createdAt: Date.now(),
          };

          // ARC 14: Initialize command tracking for this session
          sessionCommands.set(id, {
            currentCommand: '',
            commandStartIndex: 0,
            pendingNode: null,
            outputBuffer: '',
          });

          childProcess.stdout.on('data', (data: Buffer) => {
            try {
              const win = BrowserWindow.fromWebContents(event.sender);
              if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:data', id, data.toString('utf-8'));
              }
            } catch {
              // Window might be closed
            }

            // ARC 14: Accumulate output
            const entry = sessionCommands.get(id);
            if (entry) {
              entry.outputBuffer += data.toString('utf-8');
            }
          });

          childProcess.stderr.on('data', (data: Buffer) => {
            try {
              const win = BrowserWindow.fromWebContents(event.sender);
              if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:data', id, data.toString('utf-8'));
              }
            } catch {
              // Window might be closed
            }

            // ARC 14: Accumulate stderr
            const entry = sessionCommands.get(id);
            if (entry) {
              entry.outputBuffer += data.toString('utf-8');
            }
          });

          childProcess.on('close', (exitCode: number, signal: string | null) => {
            try {
              const win = BrowserWindow.fromWebContents(event.sender);
              if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:exit', id, exitCode, signal);
              }
            } catch {
              // Window might be closed
            }

            // ARC 14: Finalize pending command
            finalizePendingCommand(id, exitCode ?? 0);
            sessionCommands.delete(id);
            sessions.delete(id);
          });

          sessions.set(id, session);
        }

        return ok({
          sessionId: id,
          type: ptyAvailable ? 'pty' : 'spawn',
          pid: sessions.get(id)?.pid,
          cwd,
          shell,
        });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── terminal:write ─────────────────────────────────────────────────────
  // ARC 14: Intercepts terminal writes to detect and track commands
  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return err(`Terminal session not found: ${sessionId}`);
      }

      // ARC 15: Detect command execution (Enter key = '\r' or '\n')
      // When the user presses Enter, the data sent to the PTY contains '\r'
      // We MUST route through the Gateway BEFORE writing to the PTY.
      // "No Node → No Action" — if gateway blocks, command is NOT sent to PTY.
      const entry = sessionCommands.get(sessionId);
      if (entry && data.includes('\r')) {
        // A command was submitted. Extract the command from the data.
        const commandText = entry.currentCommand + data.replace(/\r/g, '').replace(/\n/g, '');

        if (commandText.trim()) {
          try {
            // ARC 15: Route through Gateway — creates node + safety check
            // If gateway blocks (safety <= 20), this throws and command is NOT sent to PTY
            trackTerminalCommandStart(sessionId, commandText, session.cwd);
          } catch (gateErr) {
            // Gateway blocked the command — DO NOT write to PTY
            const msg = gateErr instanceof Error ? gateErr.message : String(gateErr);
            console.error(`[Terminal/ARC15] Command blocked by gateway: ${msg}`);
            return err(`Command blocked by safety gate: ${msg}`);
          }

          // Reset current command tracking
          entry.currentCommand = '';
        }
      } else if (entry) {
        // Accumulate typed characters (before Enter is pressed)
        // Only track printable characters for command detection
        const printable = data.replace(/[\x00-\x1F\x7F]/g, ''); // Strip control chars
        if (printable) {
          entry.currentCommand += printable;
        }

        // Handle backspace
        if (data.includes('\x7f') || data.includes('\b')) {
          entry.currentCommand = entry.currentCommand.slice(0, -1);
        }
      }

      if (session.type === 'pty') {
        session.pty.write(data);
      } else {
        // child_process spawn — write to stdin
        session.pty.stdin.write(data);
      }

      return ok({ sessionId, written: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── terminal:trackCommand ──────────────────────────────────────────────
  // ARC 14: Explicit command tracking for cases where PTY write interception
  // is insufficient (e.g., programmatic command execution from AI).
  ipcMain.handle(
    'terminal:trackCommand',
    async (_event, sessionId: string, command: string, cwd?: string) => {
      try {
        const session = sessions.get(sessionId);
        const commandCwd = cwd || session?.cwd || getHomeDir();
        trackTerminalCommandStart(sessionId, command, commandCwd);
        return ok({ tracked: true, command });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── terminal:kill ──────────────────────────────────────────────────────
  ipcMain.handle('terminal:kill', async (_event, sessionId: string, signal?: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return err(`Terminal session not found: ${sessionId}`);
      }

      // ARC 14: Finalize pending command before killing
      finalizePendingCommand(sessionId, -1);

      if (session.type === 'pty') {
        session.pty.kill(signal ?? 'SIGTERM');
      } else {
        session.pty.kill(signal ?? 'SIGTERM');
      }

      sessions.delete(sessionId);
      sessionCommands.delete(sessionId);
      return ok({ sessionId, killed: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── terminal:resize ────────────────────────────────────────────────────
  ipcMain.handle(
    'terminal:resize',
    async (_event, sessionId: string, cols: number, rows: number) => {
      try {
        const session = sessions.get(sessionId);
        if (!session) {
          return err(`Terminal session not found: ${sessionId}`);
        }

        if (session.type === 'pty') {
          session.pty.resize(cols, rows);
          return ok({ sessionId, cols, rows, resized: true });
        } else {
          // child_process doesn't support resize natively
          return ok({ sessionId, cols, rows, resized: false, note: 'Resize not supported in spawn mode' });
        }
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── terminal:onData (returns active sessions info) ─────────────────────
  ipcMain.handle('terminal:onData', async (_event, sessionId?: string) => {
    try {
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) {
          return err(`Terminal session not found: ${sessionId}`);
        }
        return ok({
          sessionId: session.id,
          type: session.type,
          pid: session.pid,
          cwd: session.cwd,
          shell: session.shell,
          createdAt: session.createdAt,
        });
      }

      // Return all active sessions
      const allSessions = Array.from(sessions.values()).map((s) => ({
        sessionId: s.id,
        type: s.type,
        pid: s.pid,
        cwd: s.cwd,
        shell: s.shell,
        createdAt: s.createdAt,
      }));

      return ok({ sessions: allSessions });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── Cleanup on window close ────────────────────────────────────────────
  ipcMain.on('terminal:cleanup', (event) => {
    const _webContentsId = event.sender.id;
    for (const [id, session] of sessions) {
      // ARC 14: Finalize pending commands
      finalizePendingCommand(id, -1);

      // Kill sessions associated with this renderer
      try {
        if (session.type === 'pty') {
          session.pty.kill();
        } else {
          session.pty.kill();
        }
      } catch {
        // Session might already be dead
      }
      sessions.delete(id);
      sessionCommands.delete(id);
    }
  });

  console.log('[IPC] Terminal handlers registered (ARC 15 — graph enforcement via ExecutionGateway)');
}
