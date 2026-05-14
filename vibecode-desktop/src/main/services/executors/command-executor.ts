import { spawn } from 'child_process';
import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommandParams {
  command: string;             // The command to run
  cwd?: string;                // Relative to workspace root, defaults to workspaceRoot
  timeout?: number;            // Milliseconds, default 30000
  env?: Record<string, string>; // Additional environment variables
  shell?: boolean;             // Default: true
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  duration: number; // milliseconds
  timedOut: boolean;
}

// ─── Command Executor ─────────────────────────────────────────────────────────

export const createCommandExecutor = (workspaceRoot: string): StepExecutor => {
  return async (step: ExecutionStep): Promise<CommandResult> => {
    const params = step.params as unknown as CommandParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.command || typeof params.command !== 'string') {
      throw new Error('command executor: "command" is required and must be a string');
    }

    const timeout = params.timeout ?? 30000;
    const cwd = params.cwd
      ? path.resolve(workspaceRoot, params.cwd)
      : workspaceRoot;
    const useShell = params.shell !== false; // default true

    // Build environment: merge process.env with custom env
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (params.env && typeof params.env === 'object') {
      Object.assign(env, params.env);
    }

    const startTime = Date.now();

    return new Promise<CommandResult>((resolve, reject) => {
      // Determine shell and args
      const isWindows = process.platform === 'win32';
      let spawnCommand: string;
      let spawnArgs: string[];

      if (useShell) {
        if (isWindows) {
          spawnCommand = 'cmd.exe';
          spawnArgs = ['/c', params.command];
        } else {
          spawnCommand = '/bin/sh';
          spawnArgs = ['-c', params.command];
        }
      } else {
        // Split command into program + args (simple split on spaces)
        const parts = params.command.split(/\s+/);
        spawnCommand = parts[0];
        spawnArgs = parts.slice(1);
      }

      const child = spawn(spawnCommand, spawnArgs, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      // Collect stdout
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf-8');
      });

      // Collect stderr
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      // Handle timeout
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');

        // Give process 5 seconds to gracefully exit
        setTimeout(() => {
          if (!settled) {
            try { child.kill('SIGKILL'); } catch { /* already dead */ }
          }
        }, 5000);
      }, timeout);

      // Handle process exit
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const duration = Date.now() - startTime;

        resolve({
          exitCode: code,
          stdout,
          stderr,
          duration,
          timedOut,
        });
      });

      // Handle spawn errors
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const duration = Date.now() - startTime;
        resolve({
          exitCode: null,
          stdout,
          stderr: stderr + '\nSpawn error: ' + err.message,
          duration,
          timedOut: false,
        });
      });
    });
  };
};
