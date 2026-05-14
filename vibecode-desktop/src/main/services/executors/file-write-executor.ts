import * as fs from 'fs';
import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';

// ─── Path Validation ──────────────────────────────────────────────────────────

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

// ─── File Write Executor ──────────────────────────────────────────────────────

export interface FileWriteParams {
  filePath: string;       // Relative to workspace root
  content: string;
  encoding?: BufferEncoding; // Default: 'utf-8'
  createDirs?: boolean;      // Default: true
}

export interface FileWriteResult {
  filePath: string;
  bytesWritten: number;
  created: boolean;
}

export const createFileWriteExecutor = (workspaceRoot: string): StepExecutor => {
  return async (step: ExecutionStep): Promise<FileWriteResult> => {
    const params = step.params as unknown as FileWriteParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('file_write executor: "filePath" is required and must be a string');
    }
    if (typeof params.content !== 'string') {
      throw new Error('file_write executor: "content" is required and must be a string');
    }

    const encoding: BufferEncoding = params.encoding ?? 'utf-8';
    const createDirs = params.createDirs !== false; // default true

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(params.filePath, workspaceRoot);

    // ── Check if file already exists ──────────────────────────────────────
    let exists = false;
    try {
      await fs.promises.access(absolutePath, fs.constants.F_OK);
      exists = true;
    } catch {
      // File does not exist
    }

    // ── Create parent directories if needed ───────────────────────────────
    if (createDirs) {
      const dir = path.dirname(absolutePath);
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // ── Write the file ────────────────────────────────────────────────────
    await fs.promises.writeFile(absolutePath, params.content, encoding);

    const bytesWritten = Buffer.byteLength(params.content, encoding);

    return {
      filePath: params.filePath,
      bytesWritten,
      created: !exists,
    };
  };
};
