import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ExecutionStep, StepExecutor } from '../execution-engine';
import { auditLog } from '../../utils/audit-log';
import { logger } from '../../utils/logger';
import { SafetyGuard } from '../safety/runtime-safety-guard';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommandParams {
  command: string;             // The command to run
  cwd?: string;                // Relative to workspace root, defaults to workspaceRoot
  timeout?: number;            // Milliseconds, default 120000, max 300000
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

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 120_000;  // 120 seconds
const MAX_TIMEOUT = 300_000;      // 300 seconds (5 minutes)
const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB per stream

// ─── Dangerous Command Patterns ──────────────────────────────────────────────

const DANGEROUS_COMMANDS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root.*)\//, // rm -rf /, rm --no-preserve-root
  /\bmkfs\b/,
  /\bdd\s+.*of=\/dev\//,
  /\bformat\s+[A-Za-z]:/,
  /\bdel\s+\/s\s+[A-Za-z]:/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /\binit\s+[06]$/,
  /\bkill\s+-9\s+1\b/,
  /\bkill\s+-9\s+init\b/,
];

const DANGEROUS_SYSTEM_DIRS = [
  '/etc', '/usr', '/bin', '/sbin', '/boot',
  '/System', '/Windows',
];

/** Shell operators that could chain dangerous commands */
const SHELL_OPERATORS = [';', '|', '&&', '||', '>', '>>'];

/** Environment variable names that should never be passed to child processes */
const SECRET_ENV_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

/** Device/pseudo-filesystem prefixes that must be blocked */
const BLOCKED_PATH_PREFIXES = [
  '/dev/',
  '/proc/',
  '/sys/',
];

/** Sensitive home directory paths that must be blocked */
const SENSITIVE_HOME_DIRS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.config',
];

// ─── Command Safety Checks ───────────────────────────────────────────────────

/**
 * Check if a command contains dangerous operations.
 * Returns an error message if the command should be blocked, or null if it's safe.
 */
function checkDangerousCommand(command: string): string | null {
  const trimmed = command.trim().toLowerCase();

  // Check for dangerous command patterns
  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(trimmed)) {
      return `Blocked: command matches dangerous pattern "${pattern.source}"`;
    }
  }

  return null;
}

/**
 * Check if a command targets system directories.
 */
function checkSystemDirectoryTargeting(command: string): string | null {
  for (const dir of DANGEROUS_SYSTEM_DIRS) {
    // Check if the command writes to or modifies system directories
    const patterns = [
      new RegExp(`\\b(write|cp|mv|install|ln)\\s+.*${dir.replace('/', '\\/')}`, 'i'),
      new RegExp(`\\b>${dir.replace('/', '\\/')}`, 'i'),
      new RegExp(`\\b>>${dir.replace('/', '\\/')}`, 'i'),
    ];
    for (const pattern of patterns) {
      if (pattern.test(command)) {
        return `Blocked: command targets system directory "${dir}"`;
      }
    }
  }
  return null;
}

/**
 * Parse a command string to detect piped dangerous operations.
 * Checks for shell operators combined with dangerous commands.
 */
function checkPipedDangerousOperations(command: string): string | null {
  // Split by shell operators and check each segment
  const segments = command.split(/[;|&]+/).map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const dangerCheck = checkDangerousCommand(segment);
    if (dangerCheck) {
      return `Blocked: piped segment contains dangerous command: "${segment.slice(0, 50)}"`;
    }
  }

  return null;
}

/**
 * Check for environment variable expansion that could leak secrets.
 */
function checkEnvVarExpansion(command: string): string | null {
  // Look for $VAR or ${VAR} patterns that reference sensitive variables
  const envVarPattern = /\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g;
  let match: RegExpExecArray | null;
  while ((match = envVarPattern.exec(command)) !== null) {
    const varName = match[1];
    for (const secretPattern of SECRET_ENV_PATTERNS) {
      if (secretPattern.test(varName)) {
        return `Blocked: command references potentially sensitive environment variable "$${varName}"`;
      }
    }
  }
  return null;
}

/**
 * Validate that the CWD is within the workspace root.
 */
function validateCwd(cwd: string, workspaceRoot: string): string | null {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRoot = path.resolve(workspaceRoot);

  // Resolve symlinks for both paths
  let realCwd = resolvedCwd;
  let realRoot = resolvedRoot;
  try { realCwd = fs.realpathSync(resolvedCwd); } catch { /* path doesn't exist yet */ }
  try { realRoot = fs.realpathSync(resolvedRoot); } catch { /* use resolved */ }

  if (!realCwd.startsWith(realRoot + path.sep) && realCwd !== realRoot) {
    return `Blocked: CWD "${resolvedCwd}" is outside workspace "${resolvedRoot}"`;
  }

  return null;
}

/**
 * Filter environment variables to remove secrets before passing to child processes.
 */
function filterEnvironment(env: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    let isSecret = false;
    for (const pattern of SECRET_ENV_PATTERNS) {
      if (pattern.test(key)) {
        isSecret = true;
        break;
      }
    }
    if (!isSecret) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Truncate output to MAX_OUTPUT_BYTES.
 */
function truncateOutput(output: string): string {
  if (Buffer.byteLength(output, 'utf-8') <= MAX_OUTPUT_BYTES) {
    return output;
  }
  // Truncate and add indicator
  const truncated = Buffer.from(output, 'utf-8').subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return truncated + '\n... [output truncated at 50KB]';
}

// ─── Command Executor ─────────────────────────────────────────────────────────

export const createCommandExecutor = (workspaceRoot: string): StepExecutor => {
  const safetyGuard = new SafetyGuard(workspaceRoot);

  return async (step: ExecutionStep): Promise<CommandResult> => {
    const params = step.params as unknown as CommandParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.command || typeof params.command !== 'string') {
      throw new Error('command executor: "command" is required and must be a string');
    }

    // ── Runtime safety check ──────────────────────────────────────────────
    const safety = safetyGuard.assessCommandSafety({
      command: params.command,
      cwd: params.cwd ? path.resolve(workspaceRoot, params.cwd) : workspaceRoot,
      workspaceRoot,
    });

    if (safety.blocked) {
      throw new Error(
        `Command blocked by safety guard: ${safety.blockReason}\n` +
        `Matched rules: ${safety.matchedRules.join(', ')}\n` +
        `Risk level: ${safety.riskLevel} (score: ${safety.riskScore})`
      );
    }

    // ── Enforce timeout limits ────────────────────────────────────────────
    const requestedTimeout = params.timeout ?? DEFAULT_TIMEOUT;
    const timeout = Math.min(Math.max(requestedTimeout, 1000), MAX_TIMEOUT);

    // ── Validate CWD is within workspace ──────────────────────────────────
    const cwd = params.cwd
      ? path.resolve(workspaceRoot, params.cwd)
      : workspaceRoot;

    const cwdError = validateCwd(cwd, workspaceRoot);
    if (cwdError) {
      auditLog.auditLog('command.blocked', {
        reason: cwdError,
        command: params.command.slice(0, 100),
        cwd,
        workspaceRoot,
      }, 'failure');
      throw new Error(cwdError);
    }

    // ── Check for dangerous commands ──────────────────────────────────────
    const dangerousCheck = checkDangerousCommand(params.command);
    if (dangerousCheck) {
      auditLog.auditLog('command.blocked', {
        reason: dangerousCheck,
        command: params.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(dangerousCheck);
    }

    // ── Check for system directory targeting ──────────────────────────────
    const sysDirCheck = checkSystemDirectoryTargeting(params.command);
    if (sysDirCheck) {
      auditLog.auditLog('command.blocked', {
        reason: sysDirCheck,
        command: params.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(sysDirCheck);
    }

    // ── Check for piped dangerous operations ──────────────────────────────
    const pipeCheck = checkPipedDangerousOperations(params.command);
    if (pipeCheck) {
      auditLog.auditLog('command.blocked', {
        reason: pipeCheck,
        command: params.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(pipeCheck);
    }

    // ── Check for environment variable expansion leaking secrets ──────────
    const envCheck = checkEnvVarExpansion(params.command);
    if (envCheck) {
      auditLog.auditLog('command.blocked', {
        reason: envCheck,
        command: params.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(envCheck);
    }

    const useShell = params.shell !== false; // default true

    // ── Build environment: filter secrets, merge with custom env ──────────
    const baseEnv = filterEnvironment(process.env as Record<string, string>);
    const env: Record<string, string> = { ...baseEnv };
    if (params.env && typeof params.env === 'object') {
      const filteredCustom = filterEnvironment(params.env);
      Object.assign(env, filteredCustom);
    }

    // ── Audit log: command execution starting ─────────────────────────────
    auditLog.auditLog('command.execute', {
      command: params.command.slice(0, 200),
      cwd,
      timeout,
      stepId: step.id,
      planId: step.planId,
    });

    const startTime = Date.now();

    return new Promise<CommandResult>((resolve, reject) => {
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

      // Collect stdout with size limit
      child.stdout.on('data', (data: Buffer) => {
        if (Buffer.byteLength(stdout, 'utf-8') < MAX_OUTPUT_BYTES * 2) {
          stdout += data.toString('utf-8');
        }
      });

      // Collect stderr with size limit
      child.stderr.on('data', (data: Buffer) => {
        if (Buffer.byteLength(stderr, 'utf-8') < MAX_OUTPUT_BYTES * 2) {
          stderr += data.toString('utf-8');
        }
      });

      // Handle timeout
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
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

        // Truncate outputs
        const finalStdout = truncateOutput(stdout);
        const finalStderr = truncateOutput(stderr);

        // Audit log: command execution result
        auditLog.auditLog('command.result', {
          command: params.command.slice(0, 100),
          exitCode: code,
          duration,
          timedOut,
          stdoutSize: finalStdout.length,
          stderrSize: finalStderr.length,
        }, code === 0 ? 'success' : 'failure');

        resolve({
          exitCode: code,
          stdout: finalStdout,
          stderr: finalStderr,
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

        auditLog.auditLog('command.error', {
          command: params.command.slice(0, 100),
          error: err.message,
          duration,
        }, 'failure');

        resolve({
          exitCode: null,
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr) + '\nSpawn error: ' + err.message,
          duration,
          timedOut: false,
        });
      });
    });
  };
};
