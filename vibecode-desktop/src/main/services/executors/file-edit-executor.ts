import * as fs from 'fs';
import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';
import { validateWorkspacePath } from './file-write-executor';
import { authorizeFsOp } from '../../core/execution-audit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileEdit {
  type: 'replace' | 'insert' | 'delete';
  search?: string;     // For 'replace'
  replace?: string;    // For 'replace'
  line?: number;       // For 'insert' and 'delete' (1-based)
  content?: string;    // For 'insert'
}

export interface FileEditParams {
  filePath: string;    // Relative to workspace root
  edits: FileEdit[];
}

export interface FileEditResult {
  filePath: string;
  editsApplied: number;
  backupPath: string;
}

// ─── Backup Helper ────────────────────────────────────────────────────────────

async function createBackup(
  absolutePath: string,
  workspaceRoot: string
): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const backupDir = path.join(homeDir, '.vibecode', 'backups');
  await fs.promises.mkdir(backupDir, { recursive: true });

  // Create a unique backup filename
  const relativePath = path.relative(workspaceRoot, absolutePath);
  const sanitized = relativePath.replace(/[\\/]/g, '__');
  const timestamp = Date.now();
  const backupFileName = `${sanitized}.${timestamp}.bak`;
  const backupPath = path.join(backupDir, backupFileName);

  await fs.promises.copyFile(absolutePath, backupPath);

  return backupPath;
}

// ─── File Edit Executor ───────────────────────────────────────────────────────

export const createFileEditExecutor = (workspaceRoot: string): StepExecutor => {
  return async (step: ExecutionStep): Promise<FileEditResult> => {
    const params = step.params as unknown as FileEditParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('file_edit executor: "filePath" is required and must be a string');
    }
    if (!Array.isArray(params.edits) || params.edits.length === 0) {
      throw new Error('file_edit executor: "edits" is required and must be a non-empty array');
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(params.filePath, workspaceRoot);

    // ── Read the file ─────────────────────────────────────────────────────
    let content: string;
    try {
      content = await fs.promises.readFile(absolutePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `file_edit executor: Cannot read file "${params.filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ── Create backup before editing ──────────────────────────────────────
    const backupPath = await createBackup(absolutePath, workspaceRoot);

    // ── Apply edits ───────────────────────────────────────────────────────
    let editsApplied = 0;
    const lines = content.split('\n');

    for (const edit of params.edits) {
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

    // ARC 15: Authorize FS write through the audit system
    authorizeFsOp(params.filePath, step.id, 'write');

    // ── Write the modified file ───────────────────────────────────────────
    await fs.promises.writeFile(absolutePath, lines.join('\n'), 'utf-8');

    return {
      filePath: params.filePath,
      editsApplied,
      backupPath,
    };
  };
};
