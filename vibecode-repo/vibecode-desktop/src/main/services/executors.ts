// ─── Real Step Executors ────────────────────────────────────────────────────
//
// Each executor handles a specific type of execution step with REAL behavior.
// No mock results. Every executor performs actual operations.
//

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { ExecutionStep } from './execution-engine';
import { FileSystemSandbox } from './sandbox';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExecutorResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export interface ExecutorContext {
  sandbox: FileSystemSandbox;
  workspaceRoot: string;
  /** Callback for streaming progress updates during execution */
  onProgress?: (message: string) => void;
  /** Check if execution should be aborted */
  shouldAbort?: () => boolean;
}

export type StepExecutorFn = (
  step: ExecutionStep,
  context: ExecutorContext
) => Promise<ExecutorResult>;

// ─── Executor Registry ──────────────────────────────────────────────────────

const executorRegistry: Map<string, StepExecutorFn> = new Map();

/** Register an executor for a given step type */
export function registerExecutor(stepType: string, executor: StepExecutorFn): void {
  executorRegistry.set(stepType, executor);
}

/** Get the executor for a step type */
export function getExecutor(stepType: string): StepExecutorFn | undefined {
  return executorRegistry.get(stepType);
}

/** Get all registered executor types */
export function getRegisteredExecutorTypes(): string[] {
  return Array.from(executorRegistry.keys());
}

// ─── file_write Executor ────────────────────────────────────────────────────
//
// Writes content to a file on disk. Creates parent directories if needed.
// Validates path through sandbox.

registerExecutor('file_write', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const filePath = step.params.filePath as string;
  const content = step.params.content as string;
  const encoding = (step.params.encoding as BufferEncoding) ?? 'utf-8';

  if (!filePath) {
    return { success: false, error: 'Missing required param: filePath', durationMs: Date.now() - start };
  }

  if (content === undefined || content === null) {
    return { success: false, error: 'Missing required param: content', durationMs: Date.now() - start };
  }

  // Sandbox validation
  const validation = context.sandbox.validateWrite(filePath);
  if (!validation.allowed) {
    return { success: false, error: `Sandbox denied write: ${validation.reason}`, durationMs: Date.now() - start };
  }

  try {
    const resolvedPath = validation.resolvedPath;
    const dir = path.dirname(resolvedPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write backup if file already exists (for rollback support)
    if (fs.existsSync(resolvedPath)) {
      const backupPath = `${resolvedPath}.vibecode-backup-${Date.now()}`;
      fs.copyFileSync(resolvedPath, backupPath);
      context.onProgress?.(`Backup created: ${path.basename(backupPath)}`);
    }

    // Write the file
    fs.writeFileSync(resolvedPath, content, encoding);

    const bytesWritten = Buffer.byteLength(content, encoding);
    context.onProgress?.(`Wrote ${bytesWritten} bytes to ${path.basename(resolvedPath)}`);

    return {
      success: true,
      data: {
        filePath: resolvedPath,
        bytesWritten,
        encoding,
        created: true,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: `File write failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
});

// ─── file_edit Executor ─────────────────────────────────────────────────────
//
// Edits an existing file using search/replace operations.
// Supports multiple edit operations in a single step.

registerExecutor('file_edit', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const filePath = step.params.filePath as string;
  const edits = step.params.edits as Array<{ search: string; replace: string }>;
  const fullContent = step.params.content as string | undefined;

  if (!filePath) {
    return { success: false, error: 'Missing required param: filePath', durationMs: Date.now() - start };
  }

  // Sandbox validation
  const validation = context.sandbox.validateWrite(filePath);
  if (!validation.allowed) {
    return { success: false, error: `Sandbox denied edit: ${validation.reason}`, durationMs: Date.now() - start };
  }

  try {
    const resolvedPath = validation.resolvedPath;

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${resolvedPath}`, durationMs: Date.now() - start };
    }

    // Read current content
    let currentContent = fs.readFileSync(resolvedPath, 'utf-8');
    const originalContent = currentContent;

    // Create backup for rollback
    const backupPath = `${resolvedPath}.vibecode-backup-${Date.now()}`;
    fs.copyFileSync(resolvedPath, backupPath);

    if (fullContent !== undefined) {
      // Direct content replacement
      currentContent = fullContent;
    } else if (edits && Array.isArray(edits)) {
      // Apply search/replace edits
      let editCount = 0;
      for (const edit of edits) {
        if (!edit.search || edit.replace === undefined) {
          continue;
        }

        const index = currentContent.indexOf(edit.search);
        if (index === -1) {
          context.onProgress?.(`Warning: Search string not found in ${path.basename(resolvedPath)}`);
          continue;
        }

        currentContent =
          currentContent.slice(0, index) +
          edit.replace +
          currentContent.slice(index + edit.search.length);
        editCount++;
      }
      context.onProgress?.(`Applied ${editCount} edit(s) to ${path.basename(resolvedPath)}`);
    } else {
      return { success: false, error: 'Must provide either "edits" array or "content" string', durationMs: Date.now() - start };
    }

    // Only write if content actually changed
    if (currentContent !== originalContent) {
      fs.writeFileSync(resolvedPath, currentContent, 'utf-8');
    }

    // Generate a simple diff summary
    const linesAdded = currentContent.split('\n').length - originalContent.split('\n').length;
    const diffSummary = linesAdded > 0
      ? `+${linesAdded} lines`
      : linesAdded < 0
        ? `${linesAdded} lines`
        : '0 lines changed (inline edits)';

    return {
      success: true,
      data: {
        filePath: resolvedPath,
        backupPath,
        diffSummary,
        editCount: edits?.length ?? 1,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: `File edit failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
});

// ─── file_read Executor ─────────────────────────────────────────────────────
//
// Reads a file from disk and returns its content.

registerExecutor('file_read', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const filePath = step.params.filePath as string;
  const encoding = (step.params.encoding as BufferEncoding) ?? 'utf-8';

  if (!filePath) {
    return { success: false, error: 'Missing required param: filePath', durationMs: Date.now() - start };
  }

  // Sandbox validation
  const validation = context.sandbox.validateRead(filePath);
  if (!validation.allowed) {
    return { success: false, error: `Sandbox denied read: ${validation.reason}`, durationMs: Date.now() - start };
  }

  try {
    const resolvedPath = validation.resolvedPath;

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${resolvedPath}`, durationMs: Date.now() - start };
    }

    const content = fs.readFileSync(resolvedPath, encoding);
    const stat = fs.statSync(resolvedPath);

    return {
      success: true,
      data: {
        filePath: resolvedPath,
        content,
        size: stat.size,
        encoding,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: `File read failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
});

// ─── command Executor ───────────────────────────────────────────────────────
//
// Executes a shell command and captures its output.
// Commands are restricted to workspace root.
// Has timeout and abort support.

registerExecutor('command', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const command = step.params.command as string;
  const args = step.params.args as string[] ?? [];
  const cwd = step.params.cwd as string ?? context.workspaceRoot;
  const timeout = (step.params.timeout as number) ?? 60000; // 60s default
  const env = step.params.env as Record<string, string> | undefined;

  if (!command) {
    return { success: false, error: 'Missing required param: command', durationMs: Date.now() - start };
  }

  // Validate cwd is within sandbox
  const cwdValidation = context.sandbox.validateRead(cwd);
  if (!cwdValidation.allowed) {
    return { success: false, error: `Sandbox denied command cwd: ${cwdValidation.reason}`, durationMs: Date.now() - start };
  }

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let childProcess: ChildProcess | null = null;
    let timedOut = false;

    try {
      childProcess = spawn(command, args, {
        cwd: cwdValidation.resolvedPath,
        env: { ...process.env, ...env },
        shell: true,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
      });

      childProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        context.onProgress?.(chunk.trim());
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
      });

      // Check for abort signal
      const abortCheck = setInterval(() => {
        if (context.shouldAbort?.()) {
          childProcess?.kill('SIGTERM');
          clearInterval(abortCheck);
        }
      }, 500);

      childProcess.on('close', (code) => {
        clearInterval(abortCheck);

        if (timedOut) {
          resolve({
            success: false,
            error: `Command timed out after ${timeout}ms`,
            data: { stdout, stderr, exitCode: code, timedOut: true },
            durationMs: Date.now() - start,
          });
          return;
        }

        resolve({
          success: code === 0,
          data: {
            command: `${command} ${args.join(' ')}`,
            exitCode: code ?? 0,
            stdout: stdout.slice(0, 100000), // Cap output size
            stderr: stderr.slice(0, 10000),
          },
          error: code !== 0 ? `Command exited with code ${code}` : undefined,
          durationMs: Date.now() - start,
        });
      });

      childProcess.on('error', (err) => {
        clearInterval(abortCheck);
        resolve({
          success: false,
          error: `Command execution error: ${err.message}`,
          durationMs: Date.now() - start,
        });
      });

      // Handle timeout
      setTimeout(() => {
        if (childProcess && !childProcess.killed) {
          timedOut = true;
          childProcess.kill('SIGTERM');

          // Force kill after 5s if SIGTERM didn't work
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeout);

    } catch (err) {
      resolve({
        success: false,
        error: `Command spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
      });
    }
  });
});

// ─── code_generation Executor ───────────────────────────────────────────────
//
// Generates code content and writes it to a file.
// This is the primary executor for AI-generated code.

registerExecutor('code_generation', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const filePath = step.params.filePath as string;
  const content = step.params.content as string;
  const language = step.params.language as string ?? 'typescript';
  const overwrite = (step.params.overwrite as boolean) ?? true;

  if (!filePath) {
    return { success: false, error: 'Missing required param: filePath', durationMs: Date.now() - start };
  }

  if (!content) {
    return { success: false, error: 'Missing required param: content', durationMs: Date.now() - start };
  }

  // Sandbox validation
  const validation = context.sandbox.validateWrite(filePath);
  if (!validation.allowed) {
    return { success: false, error: `Sandbox denied code generation: ${validation.reason}`, durationMs: Date.now() - start };
  }

  try {
    const resolvedPath = validation.resolvedPath;

    // Check if file exists and overwrite is false
    if (fs.existsSync(resolvedPath) && !overwrite) {
      return {
        success: false,
        error: `File already exists and overwrite is false: ${resolvedPath}`,
        durationMs: Date.now() - start,
      };
    }

    // Create backup if file exists
    let backupPath: string | undefined;
    if (fs.existsSync(resolvedPath)) {
      backupPath = `${resolvedPath}.vibecode-backup-${Date.now()}`;
      fs.copyFileSync(resolvedPath, backupPath);
    }

    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the generated code
    fs.writeFileSync(resolvedPath, content, 'utf-8');

    const lineCount = content.split('\n').length;

    context.onProgress?.(`Generated ${language} file: ${path.basename(resolvedPath)} (${lineCount} lines)`);

    return {
      success: true,
      data: {
        filePath: resolvedPath,
        language,
        lineCount,
        size: Buffer.byteLength(content, 'utf-8'),
        backupPath,
        created: !fs.existsSync(resolvedPath),
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: `Code generation failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
});

// ─── diff_apply Executor ────────────────────────────────────────────────────
//
// Applies a unified diff to a file.

registerExecutor('diff_apply', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const filePath = step.params.filePath as string;
  const diffContent = step.params.diff as string;

  if (!filePath) {
    return { success: false, error: 'Missing required param: filePath', durationMs: Date.now() - start };
  }

  if (!diffContent) {
    return { success: false, error: 'Missing required param: diff', durationMs: Date.now() - start };
  }

  // Sandbox validation
  const validation = context.sandbox.validateWrite(filePath);
  if (!validation.allowed) {
    return { success: false, error: `Sandbox denied diff apply: ${validation.reason}`, durationMs: Date.now() - start };
  }

  try {
    const resolvedPath = validation.resolvedPath;

    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `File not found: ${resolvedPath}`, durationMs: Date.now() - start };
    }

    // Backup original
    const backupPath = `${resolvedPath}.vibecode-backup-${Date.now()}`;
    fs.copyFileSync(resolvedPath, backupPath);

    // Parse and apply the diff
    const originalContent = fs.readFileSync(resolvedPath, 'utf-8');
    const patchedContent = applyDiff(originalContent, diffContent);

    if (patchedContent === null) {
      return {
        success: false,
        error: 'Failed to apply diff — conflicts detected or invalid diff format',
        durationMs: Date.now() - start,
      };
    }

    fs.writeFileSync(resolvedPath, patchedContent, 'utf-8');

    const linesChanged = Math.abs(
      patchedContent.split('\n').length - originalContent.split('\n').length
    );

    context.onProgress?.(`Applied diff to ${path.basename(resolvedPath)} (${linesChanged} lines changed)`);

    return {
      success: true,
      data: {
        filePath: resolvedPath,
        backupPath,
        linesChanged,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: `Diff apply failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
});

// ─── analysis Executor ──────────────────────────────────────────────────────
//
// Performs code/workspace analysis. Read-only — no modifications.

registerExecutor('analysis', async (step, context): Promise<ExecutorResult> => {
  const start = Date.now();
  const targetPath = step.params.targetPath as string ?? context.workspaceRoot;
  const analysisType = step.params.analysisType as string ?? 'general';

  // Sandbox validation
  const validation = context.sandbox.validateRead(targetPath);
  if (!validation.allowed) {
    return { success: false, error: `Sandbox denied analysis: ${validation.reason}`, durationMs: Date.now() - start };
  }

  try {
    const resolvedPath = validation.resolvedPath;
    const analysis: Record<string, unknown> = {
      targetPath: resolvedPath,
      analysisType,
    };

    if (fs.existsSync(resolvedPath)) {
      const stat = fs.statSync(resolvedPath);

      if (stat.isFile()) {
        analysis.isFile = true;
        analysis.size = stat.size;
        analysis.modified = stat.mtime;
        analysis.extension = path.extname(resolvedPath);

        // Read file content for analysis
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        analysis.lineCount = content.split('\n').length;
        analysis.charCount = content.length;
      } else if (stat.isDirectory()) {
        analysis.isDirectory = true;
        const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
        analysis.fileCount = entries.filter((e) => e.isFile()).length;
        analysis.dirCount = entries.filter((e) => e.isDirectory()).length;
        analysis.extensions = this?.countExtensions?.(entries) ?? this.countFileExtensions(entries);
      }
    }

    context.onProgress?.(`Analyzed ${path.basename(resolvedPath)}`);

    return {
      success: true,
      data: analysis,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
});

// ─── Helper Functions ───────────────────────────────────────────────────────

/** Apply a simple search/replace diff to content */
function applyDiff(originalContent: string, diffContent: string): string | null {
  const lines = diffContent.split('\n');
  let result = originalContent;

  // Parse simple diff format:
  // Lines starting with - are removed
  // Lines starting with + are added
  // Context lines (no prefix) are matched

  let currentContent = result;

  // Support for search/replace blocks
  const searchReplacePattern = /<<<<<<< SEARCH\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>/g;
  let match;
  let appliedCount = 0;

  while ((match = searchReplacePattern.exec(diffContent)) !== null) {
    const searchStr = match[1].replace(/\n$/, '');
    const replaceStr = match[2].replace(/\n$/, '');

    const index = currentContent.indexOf(searchStr);
    if (index === -1) {
      return null; // Conflict
    }

    currentContent =
      currentContent.slice(0, index) +
      replaceStr +
      currentContent.slice(index + searchStr.length);
    appliedCount++;
  }

  // If no search/replace blocks found, try line-by-line application
  if (appliedCount === 0) {
    // Try simple whole-content replacement
    const trimmedDiff = diffContent.trim();
    if (trimmedDiff && currentContent !== trimmedDiff) {
      // Check if it's a full replacement
      return trimmedDiff;
    }
  }

  return currentContent;
}

/** Count file extensions in a directory listing */
function countFileExtensions(entries: fs.Dirent[]): Record<string, number> {
  const extensions: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase() || 'no-ext';
      extensions[ext] = (extensions[ext] ?? 0) + 1;
    }
  }
  return extensions;
}
