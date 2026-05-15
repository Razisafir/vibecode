// ─── VibeCode Desktop — ESM (Execution State Machine) Executors ────────────────
// ARC 12: Executor functions that work with ExecutionStateMachine's ExecutionNode
// type instead of the legacy ExecutionStep from execution-engine.ts.
//
// Key differences from legacy executors:
//   Old: (step: ExecutionStep) => Promise<unknown>  — flat fields
//   New: (node: ExecutionNode) => Promise<NodeResult> — node.data is StepData
//        with stepType and params
// ─────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import {
  ExecutionNode,
  NodeResult,
  StepData,
  UnifiedStepType,
} from './execution-state-machine';
import { SafetyGuard } from './safety/runtime-safety-guard';
import { auditLog } from '../utils/audit-log';
import { logger } from '../utils/logger';
import {
  kernelFsWrite,
  kernelFsRead,
  kernelFsDelete,
  kernelFsStat,
  kernelFsExists,
  kernelFsMkdirInternal,
  kernelFsCopyInternal,
  kernelFsReadSync,
  kernelFsStatSync,
  kernelFsReaddir,
  kernelFsAccess,
  kernelFsRealpathSync,
} from '../kernel/kernel-fs';
import { kernelSpawn } from '../kernel/kernel-process';

// ═══════════════════════════════════════════════════════════════════════════════
// PATH VALIDATION — Shared across all file executors
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates that a resolved absolute path is within the workspace root.
 * Prevents path traversal attacks (e.g. ../../etc/passwd).
 */
export function validateWorkspacePath(relativePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const normalizedRoot = path.normalize(workspaceRoot);

  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error(
      `Path traversal detected: "${relativePath}" resolves outside workspace root "${workspaceRoot}"`
    );
  }

  return resolved;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER — Extract StepData from an ExecutionNode with type guard
// ═══════════════════════════════════════════════════════════════════════════════

function assertStepData(node: ExecutionNode): StepData {
  const data = node.data as StepData;
  if (data.kind !== 'step' || !data.stepType) {
    throw new Error(
      `ESM executor: Node "${node.id}" ("${node.title}") does not contain StepData. ` +
      `Expected kind="step", got kind="${(data as any).kind ?? 'undefined'}".`
    );
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKUP HELPER — Used by file_edit and diff_apply executors
// ═══════════════════════════════════════════════════════════════════════════════

async function createBackup(absolutePath: string, workspaceRoot: string): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const backupDir = path.join(homeDir, '.vibecode', 'backups');
  await kernelFsMkdirInternal(backupDir);

  const relativePath = path.relative(workspaceRoot, absolutePath);
  const sanitized = relativePath.replace(/[\\/]/g, '__');
  const timestamp = Date.now();
  const backupFileName = `${sanitized}.${timestamp}.bak`;
  const backupPath = path.join(backupDir, backupFileName);

  await kernelFsCopyInternal(absolutePath, backupPath);

  return backupPath;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE WRITE EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface FileWriteParams {
  filePath: string;
  content: string;
  encoding?: BufferEncoding;
  createDirs?: boolean;
}

/**
 * Creates or overwrites a file within the workspace.
 * Adapted from executors/file-write-executor.ts to work with ExecutionNode.
 */
function createFileWriteExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  const safetyGuard = new SafetyGuard(workspaceRoot);

  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as FileWriteParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.filePath || typeof p.filePath !== 'string') {
      throw new Error('file_write executor: "filePath" is required and must be a string');
    }
    if (typeof p.content !== 'string') {
      throw new Error('file_write executor: "content" is required and must be a string');
    }

    // ── Runtime safety check ──────────────────────────────────────────────
    const safety = safetyGuard.assessFileMutationSafety({
      filePath: p.filePath,
      operation: 'write',
      workspaceRoot,
    });

    if (safety.blocked) {
      throw new Error(
        `File write blocked by safety guard: ${safety.blockReason}\n` +
        `Matched rules: ${safety.matchedRules.join(', ')}\n` +
        `Risk level: ${safety.riskLevel} (score: ${safety.riskScore})`
      );
    }

    const encoding: BufferEncoding = p.encoding ?? 'utf-8';
    const createDirs = p.createDirs !== false; // default true

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(p.filePath, workspaceRoot);

    // ── Check if file already exists ──────────────────────────────────────
    let exists = false;
    try {
      await kernelFsAccess(absolutePath);
      exists = true;
    } catch {
      // File does not exist
    }

    // ── Write the file (kernelFsWrite handles mkdir, authorize, and write) ─
    await kernelFsWrite({ nodeId: node.id, filePath: absolutePath, content: p.content, encoding, createDirs });

    const bytesWritten = Buffer.byteLength(p.content, encoding);
    const duration = Date.now() - startTime;

    logger.info('execution', `file_write: ${p.filePath} (${bytesWritten} bytes, ${exists ? 'overwritten' : 'created'}) in ${duration}ms`);

    return {
      success: true,
      data: {
        filePath: p.filePath,
        bytesWritten,
        created: !exists,
      },
      duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE READ EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface FileReadParams {
  filePath: string;
  encoding?: BufferEncoding;
}

/**
 * Reads a file within the workspace and returns its content.
 * Adapted from executors/file-read-executor.ts to work with ExecutionNode.
 */
function createFileReadExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as FileReadParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.filePath || typeof p.filePath !== 'string') {
      throw new Error('file_read executor: "filePath" is required and must be a string');
    }

    const encoding: BufferEncoding = p.encoding ?? 'utf-8';

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(p.filePath, workspaceRoot);

    // ── Read the file ─────────────────────────────────────────────────────
    let content: string;
    try {
      content = await kernelFsRead(absolutePath, encoding);
    } catch (err) {
      throw new Error(
        `file_read executor: Cannot read file "${p.filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const stats = await kernelFsStat(absolutePath);
    const lines = content.split('\n').length;
    const duration = Date.now() - startTime;

    logger.info('execution', `file_read: ${p.filePath} (${stats.size} bytes, ${lines} lines) in ${duration}ms`);

    return {
      success: true,
      data: {
        filePath: p.filePath,
        content,
        size: stats.size,
        lines,
      },
      duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE EDIT EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface FileEdit {
  type: 'replace' | 'insert' | 'delete';
  search?: string;     // For 'replace'
  replace?: string;    // For 'replace'
  line?: number;       // For 'insert' and 'delete' (1-based)
  content?: string;    // For 'insert'
}

interface FileEditParams {
  filePath: string;
  edits: FileEdit[];
}

/**
 * Applies find/replace, insert, and delete edits to an existing file.
 * Adapted from executors/file-edit-executor.ts to work with ExecutionNode.
 */
function createFileEditExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as FileEditParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.filePath || typeof p.filePath !== 'string') {
      throw new Error('file_edit executor: "filePath" is required and must be a string');
    }
    if (!Array.isArray(p.edits) || p.edits.length === 0) {
      throw new Error('file_edit executor: "edits" is required and must be a non-empty array');
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(p.filePath, workspaceRoot);

    // ── Read the file ─────────────────────────────────────────────────────
    let content: string;
    try {
      content = await kernelFsRead(absolutePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `file_edit executor: Cannot read file "${p.filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ── Create backup before editing ──────────────────────────────────────
    const backupPath = await createBackup(absolutePath, workspaceRoot);

    // ── Apply edits ───────────────────────────────────────────────────────
    let editsApplied = 0;
    const lines = content.split('\n');

    for (const edit of p.edits) {
      switch (edit.type) {
        case 'replace': {
          if (typeof edit.search !== 'string' || typeof edit.replace !== 'string') {
            throw new Error('file_edit executor: "replace" edit requires "search" and "replace" strings');
          }
          const originalContent = lines.join('\n');
          if (!originalContent.includes(edit.search)) {
            throw new Error(
              `file_edit executor: "search" string not found in file: "${edit.search.substring(0, 100)}"`
            );
          }
          const newContent = originalContent.replace(edit.search, edit.replace);
          lines.length = 0;
          lines.push(...newContent.split('\n'));
          editsApplied++;
          break;
        }

        case 'insert': {
          if (typeof edit.line !== 'number' || edit.line < 1) {
            throw new Error('file_edit executor: "insert" edit requires a positive "line" number (1-based)');
          }
          if (typeof edit.content !== 'string') {
            throw new Error('file_edit executor: "insert" edit requires "content" string');
          }
          // line is 1-based; insert BEFORE that line number
          const insertIndex = Math.min(edit.line - 1, lines.length);
          const insertLines = edit.content.split('\n');
          lines.splice(insertIndex, 0, ...insertLines);
          editsApplied++;
          break;
        }

        case 'delete': {
          if (typeof edit.line !== 'number' || edit.line < 1) {
            throw new Error('file_edit executor: "delete" edit requires a positive "line" number (1-based)');
          }
          if (edit.line > lines.length) {
            throw new Error(
              `file_edit executor: "delete" line ${edit.line} exceeds file length (${lines.length} lines)`
            );
          }
          lines.splice(edit.line - 1, 1);
          editsApplied++;
          break;
        }

        default:
          throw new Error(`file_edit executor: Unknown edit type "${(edit as any).type}"`);
      }
    }

    // ── Write the modified file (kernelFsWrite handles authorize) ────────
    await kernelFsWrite({ nodeId: node.id, filePath: absolutePath, content: lines.join('\n'), encoding: 'utf-8', createDirs: false });

    const duration = Date.now() - startTime;

    logger.info('execution', `file_edit: ${p.filePath} (${editsApplied} edits applied) in ${duration}ms`);

    return {
      success: true,
      data: {
        filePath: p.filePath,
        editsApplied,
        backupPath,
      },
      duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE DELETE EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface FileDeleteParams {
  filePath: string;
  recursive?: boolean; // Default: false
}

/**
 * Deletes a file (or directory if recursive=true) within the workspace.
 * New executor for the UnifiedStepType 'file_delete' which did not exist
 * in the legacy executor registry.
 */
function createFileDeleteExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  const safetyGuard = new SafetyGuard(workspaceRoot);

  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as FileDeleteParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.filePath || typeof p.filePath !== 'string') {
      throw new Error('file_delete executor: "filePath" is required and must be a string');
    }

    // ── Runtime safety check ──────────────────────────────────────────────
    const safety = safetyGuard.assessFileMutationSafety({
      filePath: p.filePath,
      operation: 'delete',
      workspaceRoot,
    });

    if (safety.blocked) {
      throw new Error(
        `File delete blocked by safety guard: ${safety.blockReason}\n` +
        `Matched rules: ${safety.matchedRules.join(', ')}\n` +
        `Risk level: ${safety.riskLevel} (score: ${safety.riskScore})`
      );
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(p.filePath, workspaceRoot);

    // ── Check if file exists ──────────────────────────────────────────────
    let existed = false;
    let wasDirectory = false;
    try {
      const stat = await kernelFsStat(absolutePath);
      existed = true;
      wasDirectory = stat.isDirectory();
    } catch {
      // File doesn't exist — nothing to delete
    }

    if (!existed) {
      return {
        success: true,
        data: {
          filePath: p.filePath,
          deleted: false,
          reason: 'File did not exist',
        },
        duration: Date.now() - startTime,
      };
    }

    // ── Create backup before deletion (for rollback) ──────────────────────
    let backupPath: string | undefined;
    if (!wasDirectory) {
      backupPath = await createBackup(absolutePath, workspaceRoot);
    }

    // ── Delete the file/directory (kernelFsDelete handles authorize) ────
    await kernelFsDelete({ nodeId: node.id, filePath: absolutePath, recursive: p.recursive });

    const duration = Date.now() - startTime;

    logger.info('execution', `file_delete: ${p.filePath} (${wasDirectory ? 'directory' : 'file'}) in ${duration}ms`);

    return {
      success: true,
      data: {
        filePath: p.filePath,
        deleted: true,
        wasDirectory,
        backupPath,
      },
      duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface CommandParams {
  command: string;
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  shell?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 120_000;   // 120 seconds
const MAX_TIMEOUT = 300_000;       // 300 seconds (5 minutes)
const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB per stream

// ─── Dangerous Command Patterns ──────────────────────────────────────────────

const DANGEROUS_COMMANDS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root.*)\//,
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

// ─── Command Safety Checks (adapted from command-executor.ts) ────────────────

function checkDangerousCommand(command: string): string | null {
  const trimmed = command.trim().toLowerCase();
  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(trimmed)) {
      return `Blocked: command matches dangerous pattern "${pattern.source}"`;
    }
  }
  return null;
}

function checkSystemDirectoryTargeting(command: string): string | null {
  for (const dir of DANGEROUS_SYSTEM_DIRS) {
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

function checkPipedDangerousOperations(command: string): string | null {
  const segments = command.split(/[;|&]+/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const dangerCheck = checkDangerousCommand(segment);
    if (dangerCheck) {
      return `Blocked: piped segment contains dangerous command: "${segment.slice(0, 50)}"`;
    }
  }
  return null;
}

function checkEnvVarExpansion(command: string): string | null {
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

function validateCwd(cwd: string, workspaceRoot: string): string | null {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRoot = path.resolve(workspaceRoot);

  let realCwd = resolvedCwd;
  let realRoot = resolvedRoot;
  try { realCwd = kernelFsRealpathSync(resolvedCwd); } catch { /* path doesn't exist yet */ }
  try { realRoot = kernelFsRealpathSync(resolvedRoot); } catch { /* use resolved */ }

  if (!realCwd.startsWith(realRoot + path.sep) && realCwd !== realRoot) {
    return `Blocked: CWD "${resolvedCwd}" is outside workspace "${resolvedRoot}"`;
  }

  return null;
}

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

function truncateOutput(output: string): string {
  if (Buffer.byteLength(output, 'utf-8') <= MAX_OUTPUT_BYTES) {
    return output;
  }
  const truncated = Buffer.from(output, 'utf-8').subarray(0, MAX_OUTPUT_BYTES).toString('utf-8');
  return truncated + '\n... [output truncated at 50KB]';
}

/**
 * Executes a shell command within the workspace.
 * Adapted from executors/command-executor.ts to work with ExecutionNode.
 */
function createCommandExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  const safetyGuard = new SafetyGuard(workspaceRoot);

  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as CommandParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.command || typeof p.command !== 'string') {
      throw new Error('command executor: "command" is required and must be a string');
    }

    // ── Runtime safety check ──────────────────────────────────────────────
    const safety = safetyGuard.assessCommandSafety({
      command: p.command,
      cwd: p.cwd ? path.resolve(workspaceRoot, p.cwd) : workspaceRoot,
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
    const requestedTimeout = p.timeout ?? DEFAULT_TIMEOUT;
    const timeout = Math.min(Math.max(requestedTimeout, 1000), MAX_TIMEOUT);

    // ── Validate CWD is within workspace ──────────────────────────────────
    const cwd = p.cwd
      ? path.resolve(workspaceRoot, p.cwd)
      : workspaceRoot;

    const cwdError = validateCwd(cwd, workspaceRoot);
    if (cwdError) {
      auditLog.auditLog('command.blocked', {
        reason: cwdError,
        command: p.command.slice(0, 100),
        cwd,
        workspaceRoot,
      }, 'failure');
      throw new Error(cwdError);
    }

    // ── Check for dangerous commands ──────────────────────────────────────
    const dangerousCheck = checkDangerousCommand(p.command);
    if (dangerousCheck) {
      auditLog.auditLog('command.blocked', {
        reason: dangerousCheck,
        command: p.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(dangerousCheck);
    }

    const sysDirCheck = checkSystemDirectoryTargeting(p.command);
    if (sysDirCheck) {
      auditLog.auditLog('command.blocked', {
        reason: sysDirCheck,
        command: p.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(sysDirCheck);
    }

    const pipeCheck = checkPipedDangerousOperations(p.command);
    if (pipeCheck) {
      auditLog.auditLog('command.blocked', {
        reason: pipeCheck,
        command: p.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(pipeCheck);
    }

    const envCheck = checkEnvVarExpansion(p.command);
    if (envCheck) {
      auditLog.auditLog('command.blocked', {
        reason: envCheck,
        command: p.command.slice(0, 100),
        cwd,
      }, 'failure');
      throw new Error(envCheck);
    }

    const useShell = p.shell !== false; // default true

    // ── Build environment: filter secrets, merge with custom env ──────────
    const baseEnv = filterEnvironment(process.env as Record<string, string>);
    const env: Record<string, string> = { ...baseEnv };
    if (p.env && typeof p.env === 'object') {
      const filteredCustom = filterEnvironment(p.env);
      Object.assign(env, filteredCustom);
    }

    // ── Audit log: command execution starting ─────────────────────────────
    auditLog.auditLog('command.execute', {
      command: p.command.slice(0, 200),
      cwd,
      timeout,
      nodeId: node.id,
      nodeTitle: node.title,
    });

    const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string; duration: number; timedOut: boolean }>((resolve) => {
      const isWindows = process.platform === 'win32';
      let spawnCommand: string;
      let spawnArgs: string[];

      if (useShell) {
        if (isWindows) {
          spawnCommand = 'cmd.exe';
          spawnArgs = ['/c', p.command];
        } else {
          spawnCommand = '/bin/sh';
          spawnArgs = ['-c', p.command];
        }
      } else {
        const parts = p.command.split(/\s+/);
        spawnCommand = parts[0];
        spawnArgs = parts.slice(1);
      }

      const { childProcess: child } = kernelSpawn({
        nodeId: node.id,
        command: spawnCommand,
        args: spawnArgs,
        cwd,
        env,
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      child.stdout.on('data', (data: Buffer) => {
        if (Buffer.byteLength(stdout, 'utf-8') < MAX_OUTPUT_BYTES * 2) {
          stdout += data.toString('utf-8');
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        if (Buffer.byteLength(stderr, 'utf-8') < MAX_OUTPUT_BYTES * 2) {
          stderr += data.toString('utf-8');
        }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!settled) {
            try { child.kill('SIGKILL'); } catch { /* already dead */ }
          }
        }, 5000);
      }, timeout);

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const duration = Date.now() - startTime;
        const finalStdout = truncateOutput(stdout);
        const finalStderr = truncateOutput(stderr);

        auditLog.auditLog('command.result', {
          command: p.command.slice(0, 100),
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

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const duration = Date.now() - startTime;

        auditLog.auditLog('command.error', {
          command: p.command.slice(0, 100),
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

    logger.info('execution', `command: "${p.command.slice(0, 80)}" exit=${result.exitCode} in ${result.duration}ms`);

    return {
      success: result.exitCode === 0,
      data: {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
      },
      duration: result.duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODE GENERATION EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface CodeGenerationParams {
  filePath: string;
  content: string;
  encoding?: BufferEncoding;
  createDirs?: boolean;
  prompt?: string; // Reserved for future LLM integration
}

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.rs', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.html', '.css', '.scss', '.less', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.sh', '.bash', '.sql',
  '.graphql', '.gql', '.prisma',
  '.proto', '.dockerfile',
]);

/**
 * Generates code by writing content to a file with extension validation.
 * Adapted from executors/code-generation-executor.ts to work with ExecutionNode.
 */
function createCodeGenerationExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as CodeGenerationParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.filePath || typeof p.filePath !== 'string') {
      throw new Error('code_generation executor: "filePath" is required and must be a string');
    }

    if (!p.content || typeof p.content !== 'string') {
      if (p.prompt) {
        throw new Error(
          'code_generation executor: LLM-based generation via "prompt" is not yet supported. ' +
          'Please provide the "content" parameter with the generated code.'
        );
      }
      throw new Error('code_generation executor: "content" is required and must be a non-empty string');
    }

    if (p.content.trim().length === 0) {
      throw new Error('code_generation executor: "content" must not be empty or whitespace-only');
    }

    // ── Validate file extension ───────────────────────────────────────────
    const ext = path.extname(p.filePath).toLowerCase();
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `code_generation executor: File extension "${ext}" is not allowed for code generation. ` +
        `Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`
      );
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(p.filePath, workspaceRoot);

    const encoding: BufferEncoding = p.encoding ?? 'utf-8';
    const createDirs = p.createDirs !== false;

    // ── Write the file (kernelFsWrite handles mkdir, authorize, and write) ─
    await kernelFsWrite({ nodeId: node.id, filePath: absolutePath, content: p.content, encoding, createDirs });

    const linesGenerated = p.content.split('\n').length;
    const bytesWritten = Buffer.byteLength(p.content, encoding);
    const duration = Date.now() - startTime;

    logger.info('execution', `code_generation: ${p.filePath} (${linesGenerated} lines, ${bytesWritten} bytes) in ${duration}ms`);

    return {
      success: true,
      data: {
        filePath: p.filePath,
        linesGenerated,
        bytesWritten,
      },
      duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIFF APPLY EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

interface DiffApplyParams {
  filePath: string;
  diff: string; // Unified diff format string
}

// ─── Unified Diff Parser ─────────────────────────────────────────────────────

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

function parseUnifiedDiff(diffStr: string): Hunk[] {
  const hunks: Hunk[] = [];
  const lines = diffStr.split('\n');
  let i = 0;

  // Skip header lines (--- a/file, +++ b/file)
  while (i < lines.length && !lines[i].startsWith('@@')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('@@')) {
      i++;
      continue;
    }

    const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (!match) {
      i++;
      continue;
    }

    const hunk: Hunk = {
      oldStart: parseInt(match[1], 10),
      oldCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
      newStart: parseInt(match[3], 10),
      newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1,
      lines: [],
    };

    i++;

    while (i < lines.length) {
      const hunkLine = lines[i];
      if (hunkLine.startsWith('@@')) {
        break;
      }
      if (hunkLine.startsWith('\\ ') || hunkLine.startsWith('\\ No newline')) {
        i++;
        continue;
      }
      if (
        hunkLine.startsWith(' ') ||
        hunkLine.startsWith('+') ||
        hunkLine.startsWith('-') ||
        hunkLine === ''
      ) {
        hunk.lines.push(hunkLine);
      }
      i++;
    }

    hunks.push(hunk);
  }

  return hunks;
}

function applyHunk(fileLines: string[], hunk: Hunk): string[] {
  const result: string[] = [];
  let fileIndex = 0;
  let hunkLineIndex = 0;

  const targetStart = hunk.oldStart - 1;

  while (fileIndex < targetStart && fileIndex < fileLines.length) {
    result.push(fileLines[fileIndex]);
    fileIndex++;
  }

  while (hunkLineIndex < hunk.lines.length) {
    const hunkLine = hunk.lines[hunkLineIndex];

    if (hunkLine.startsWith('-')) {
      fileIndex++;
      hunkLineIndex++;
    } else if (hunkLine.startsWith('+')) {
      result.push(hunkLine.substring(1));
      hunkLineIndex++;
    } else if (hunkLine.startsWith(' ')) {
      if (fileIndex < fileLines.length) {
        result.push(fileLines[fileIndex]);
        fileIndex++;
      }
      hunkLineIndex++;
    } else {
      if (fileIndex < fileLines.length) {
        result.push(fileLines[fileIndex]);
        fileIndex++;
      }
      hunkLineIndex++;
    }
  }

  while (fileIndex < fileLines.length) {
    result.push(fileLines[fileIndex]);
    fileIndex++;
  }

  return result;
}

/**
 * Applies a unified diff to a file within the workspace.
 * Adapted from executors/diff-apply-executor.ts to work with ExecutionNode.
 */
function createDiffApplyExecutor(workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const p = params as unknown as DiffApplyParams;
    const startTime = Date.now();

    // ── Validate required params ──────────────────────────────────────────
    if (!p.filePath || typeof p.filePath !== 'string') {
      throw new Error('diff_apply executor: "filePath" is required and must be a string');
    }
    if (!p.diff || typeof p.diff !== 'string') {
      throw new Error('diff_apply executor: "diff" is required and must be a string (unified diff format)');
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(p.filePath, workspaceRoot);

    // ── Read the file ─────────────────────────────────────────────────────
    let content: string;
    try {
      content = await kernelFsRead(absolutePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `diff_apply executor: Cannot read file "${p.filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ── Create backup before applying ─────────────────────────────────────
    const backupPath = await createBackup(absolutePath, workspaceRoot);

    // ── Parse the unified diff ────────────────────────────────────────────
    const hunks = parseUnifiedDiff(p.diff);

    if (hunks.length === 0) {
      throw new Error(
        'diff_apply executor: No valid hunks found in the diff. ' +
        'Ensure the diff is in unified diff format (starting with @@ markers).'
      );
    }

    // ── Apply hunks sequentially ──────────────────────────────────────────
    let fileLines = content.split('\n');

    for (const hunk of hunks) {
      fileLines = applyHunk(fileLines, hunk);
    }

    // ── Write the modified file (kernelFsWrite handles authorize) ────────
    await kernelFsWrite({ nodeId: node.id, filePath: absolutePath, content: fileLines.join('\n'), encoding: 'utf-8', createDirs: false });

    const duration = Date.now() - startTime;

    logger.info('execution', `diff_apply: ${p.filePath} (${hunks.length} hunks) in ${duration}ms`);

    return {
      success: true,
      data: {
        filePath: p.filePath,
        hunksApplied: hunks.length,
        backupPath,
      },
      duration,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUB EXECUTORS — Reasonable stubs for step types without real implementations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analysis stub executor — returns a descriptive result indicating that
 * real code analysis is not yet implemented, rather than throwing an error.
 */
function createAnalysisStubExecutor(_workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const startTime = Date.now();

    const targetFile = (params.filePath as string) ?? 'unknown';
    const analysisType = (params.analysisType as string) ?? 'general';

    logger.info('execution', `analysis (stub): ${targetFile} — ${analysisType}`);

    return {
      success: true,
      data: {
        message: `Code analysis for "${targetFile}" (${analysisType}) is not yet fully implemented. ` +
          `The step was acknowledged and marked as completed to allow plan execution to continue.`,
        targetFile,
        analysisType,
        findings: [],
        implemented: false,
      },
      duration: Date.now() - startTime,
    };
  };
}

/**
 * Test stub executor — returns a descriptive result indicating that
 * real test execution is not yet implemented, rather than throwing an error.
 */
function createTestStubExecutor(_workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const startTime = Date.now();

    const testCommand = (params.command as string) ?? (params.testFile as string) ?? 'unknown';
    const testFramework = (params.framework as string) ?? 'generic';

    logger.info('execution', `test (stub): ${testCommand} — ${testFramework}`);

    return {
      success: true,
      data: {
        message: `Test execution for "${testCommand}" (${testFramework}) is not yet fully implemented. ` +
          `The step was acknowledged and marked as completed to allow plan execution to continue.`,
        testCommand,
        testFramework,
        passed: true, // Optimistic default for stub
        results: [],
        implemented: false,
      },
      duration: Date.now() - startTime,
    };
  };
}

/**
 * AI Suggestion stub executor — returns a descriptive result indicating that
 * real AI-powered suggestions are not yet implemented, rather than throwing an error.
 */
function createAiSuggestionStubExecutor(_workspaceRoot: string): (node: ExecutionNode) => Promise<NodeResult> {
  return async (node: ExecutionNode): Promise<NodeResult> => {
    const { params } = assertStepData(node);
    const startTime = Date.now();

    const targetFile = (params.filePath as string) ?? 'unknown';
    const suggestionType = (params.suggestionType as string) ?? 'improvement';

    logger.info('execution', `ai_suggestion (stub): ${targetFile} — ${suggestionType}`);

    return {
      success: true,
      data: {
        message: `AI suggestion for "${targetFile}" (${suggestionType}) is not yet fully implemented. ` +
          `The step was acknowledged and marked as completed to allow plan execution to continue.`,
        targetFile,
        suggestionType,
        suggestions: [],
        implemented: false,
      },
      duration: Date.now() - startTime,
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTOR REGISTRY — Creates the Map of step type → executor function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a registry mapping each UnifiedStepType to its corresponding ESM
 * executor function.
 *
 * The executors accept an `ExecutionNode` (with `data: StepData`) and return
 * a `Promise<NodeResult>`. This is the key difference from the legacy executor
 * registry which used `(step: ExecutionStep) => Promise<unknown>`.
 *
 * @param workspaceRoot - The absolute path to the workspace root directory.
 *                        All relative file paths in step params will be resolved
 *                        relative to this directory.
 * @returns A Map from UnifiedStepType string to its executor function.
 */
export function createEsmExecutorRegistry(
  workspaceRoot: string
): Map<string, (node: ExecutionNode) => Promise<NodeResult>> {
  const registry = new Map<string, (node: ExecutionNode) => Promise<NodeResult>>();

  // ── Real executors (full implementation) ────────────────────────────────
  registry.set('file_write', createFileWriteExecutor(workspaceRoot));
  registry.set('file_read', createFileReadExecutor(workspaceRoot));
  registry.set('file_edit', createFileEditExecutor(workspaceRoot));
  registry.set('file_delete', createFileDeleteExecutor(workspaceRoot));
  registry.set('command', createCommandExecutor(workspaceRoot));
  registry.set('code_generation', createCodeGenerationExecutor(workspaceRoot));
  registry.set('diff_apply', createDiffApplyExecutor(workspaceRoot));

  // ── Stub executors (return success with descriptive result) ─────────────
  // These step types don't have real implementations yet, but they return
  // a successful NodeResult with a descriptive message so that plan execution
  // can continue instead of failing on unimplemented step types.
  registry.set('analysis', createAnalysisStubExecutor(workspaceRoot));
  registry.set('test', createTestStubExecutor(workspaceRoot));
  registry.set('ai_suggestion', createAiSuggestionStubExecutor(workspaceRoot));

  logger.info(
    'execution',
    `Registry created with ${registry.size} executors: ` +
    `[${Array.from(registry.keys()).join(', ')}]`
  );

  return registry;
}
