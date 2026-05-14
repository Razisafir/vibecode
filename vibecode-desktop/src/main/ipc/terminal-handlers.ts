import { ipcMain, IpcMainEvent, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as os from 'os';

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

          // Forward PTY data to renderer
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

          childProcess.stdout.on('data', (data: Buffer) => {
            try {
              const win = BrowserWindow.fromWebContents(event.sender);
              if (win && !win.isDestroyed()) {
                win.webContents.send('terminal:data', id, data.toString('utf-8'));
              }
            } catch {
              // Window might be closed
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
  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return err(`Terminal session not found: ${sessionId}`);
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

  // ── terminal:kill ──────────────────────────────────────────────────────
  ipcMain.handle('terminal:kill', async (_event, sessionId: string, signal?: string) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        return err(`Terminal session not found: ${sessionId}`);
      }

      if (session.type === 'pty') {
        session.pty.kill(signal ?? 'SIGTERM');
      } else {
        session.pty.kill(signal ?? 'SIGTERM');
      }

      sessions.delete(sessionId);
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
    const webContentsId = event.sender.id;
    for (const [id, session] of sessions) {
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
    }
  });

  console.log('[IPC] Terminal handlers registered');
}
