import * as fs from 'fs';
import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';
import { validateWorkspacePath } from './file-write-executor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileReadParams {
  filePath: string;       // Relative to workspace root
  encoding?: BufferEncoding; // Default: 'utf-8'
}

export interface FileReadResult {
  filePath: string;
  content: string;
  size: number;
  lines: number;
}

// ─── File Read Executor ───────────────────────────────────────────────────────

export const createFileReadExecutor = (workspaceRoot: string): StepExecutor => {
  return async (step: ExecutionStep): Promise<FileReadResult> => {
    const params = step.params as unknown as FileReadParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('file_read executor: "filePath" is required and must be a string');
    }

    const encoding: BufferEncoding = params.encoding ?? 'utf-8';

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(params.filePath, workspaceRoot);

    // ── Read the file ─────────────────────────────────────────────────────
    let content: string;
    try {
      content = await fs.promises.readFile(absolutePath, encoding);
    } catch (err) {
      throw new Error(
        `file_read executor: Cannot read file "${params.filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const stats = await fs.promises.stat(absolutePath);

    return {
      filePath: params.filePath,
      content,
      size: stats.size,
      lines: content.split('\n').length,
    };
  };
};
