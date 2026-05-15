import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';
import { SafetyGuard } from '../safety/runtime-safety-guard';
import { kernelFsExistsAsync, kernelFsWrite } from '../../kernel/kernel-fs';

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
  const safetyGuard = new SafetyGuard(workspaceRoot);

  return async (step: ExecutionStep): Promise<FileWriteResult> => {
    const params = step.params as unknown as FileWriteParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('file_write executor: "filePath" is required and must be a string');
    }
    if (typeof params.content !== 'string') {
      throw new Error('file_write executor: "content" is required and must be a string');
    }

    // ── Runtime safety check ──────────────────────────────────────────────
    const safety = safetyGuard.assessFileMutationSafety({
      filePath: params.filePath,
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

    const encoding: BufferEncoding = params.encoding ?? 'utf-8';
    const createDirs = params.createDirs !== false; // default true

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(params.filePath, workspaceRoot);

    // ── Check if file already exists ──────────────────────────────────────
    const exists = await kernelFsExistsAsync(absolutePath);

    // ── Write the file via kernel (handles mkdir + audit authorization) ──
    const writeResult = await kernelFsWrite({
      nodeId: step.id,
      filePath: absolutePath,
      content: params.content,
      encoding,
      createDirs,
    });

    const bytesWritten = writeResult.bytesWritten;

    return {
      filePath: params.filePath,
      bytesWritten,
      created: !exists,
    };
  };
};
