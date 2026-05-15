import * as fs from 'fs';
import * as path from 'path';
import { ExecutionStep, StepExecutor } from '../execution-engine';
import { validateWorkspacePath } from './file-write-executor';
import { authorizeFsOp } from '../../core/execution-audit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiffApplyParams {
  filePath: string;   // Relative to workspace root
  diff: string;       // Unified diff format string
}

export interface DiffApplyResult {
  filePath: string;
  hunksApplied: number;
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

  const relativePath = path.relative(workspaceRoot, absolutePath);
  const sanitized = relativePath.replace(/[\\/]/g, '__');
  const timestamp = Date.now();
  const backupFileName = `${sanitized}.${timestamp}.bak`;
  const backupPath = path.join(backupDir, backupFileName);

  await fs.promises.copyFile(absolutePath, backupPath);
  return backupPath;
}

// ─── Unified Diff Parser ──────────────────────────────────────────────────────

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[]; // The content lines of the hunk (with +, -, or space prefix)
}

/**
 * Parse a unified diff string into structured hunks.
 * Supports standard unified diff format:
 *   --- a/file.txt
 *   +++ b/file.txt
 *   @@ -oldStart,oldCount +newStart,newCount @@
 *    context line
 *   -removed line
 *   +added line
 */
function parseUnifiedDiff(diffStr: string): Hunk[] {
  const hunks: Hunk[] = [];
  const lines = diffStr.split('\n');
  let i = 0;

  // Skip header lines (--- a/file, +++ b/file)
  while (i < lines.length && !lines[i].startsWith('@@')) {
    i++;
  }

  // Parse hunks
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('@@')) {
      i++;
      continue;
    }

    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
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

    i++; // Move past the @@ line

    // Read hunk content lines until next @@ or end
    while (i < lines.length) {
      const hunkLine = lines[i];
      if (hunkLine.startsWith('@@')) {
        break; // Next hunk
      }
      if (hunkLine.startsWith('\\ ') || hunkLine.startsWith('\\ No newline')) {
        // Metadata line, skip but record
        i++;
        continue;
      }
      // Only include actual diff lines (space, +, or - prefix)
      if (
        hunkLine.startsWith(' ') ||
        hunkLine.startsWith('+') ||
        hunkLine.startsWith('-') ||
        hunkLine === '' // Empty line within hunk
      ) {
        hunk.lines.push(hunkLine);
      }
      i++;
    }

    hunks.push(hunk);
  }

  return hunks;
}

/**
 * Apply a single hunk to an array of lines.
 * Returns the modified array and the number of hunks applied.
 */
function applyHunk(fileLines: string[], hunk: Hunk): string[] {
  const result: string[] = [];
  let fileIndex = 0; // 0-based index into fileLines
  let hunkLineIndex = 0;
  let _applied = false;

  // We need to find where in the file this hunk starts.
  // The hunk.oldStart is 1-based line number in the original file.
  const targetStart = hunk.oldStart - 1; // Convert to 0-based

  // Copy lines before the hunk
  while (fileIndex < targetStart && fileIndex < fileLines.length) {
    result.push(fileLines[fileIndex]);
    fileIndex++;
  }

  // Apply the hunk
  while (hunkLineIndex < hunk.lines.length) {
    const hunkLine = hunk.lines[hunkLineIndex];

    if (hunkLine.startsWith('-')) {
      // Remove line — skip it in the file
      fileIndex++;
      hunkLineIndex++;
    } else if (hunkLine.startsWith('+')) {
      // Add line
      result.push(hunkLine.substring(1));
      hunkLineIndex++;
    } else if (hunkLine.startsWith(' ')) {
      // Context line — keep it
      if (fileIndex < fileLines.length) {
        result.push(fileLines[fileIndex]);
        fileIndex++;
      }
      hunkLineIndex++;
    } else {
      // Empty line in diff (could be a blank context line)
      if (fileIndex < fileLines.length) {
        result.push(fileLines[fileIndex]);
        fileIndex++;
      }
      hunkLineIndex++;
    }
    _applied = true;
  }

  // Copy remaining lines after the hunk
  while (fileIndex < fileLines.length) {
    result.push(fileLines[fileIndex]);
    fileIndex++;
  }

  return result;
}

// ─── Diff Apply Executor ──────────────────────────────────────────────────────

export const createDiffApplyExecutor = (workspaceRoot: string): StepExecutor => {
  return async (step: ExecutionStep): Promise<DiffApplyResult> => {
    const params = step.params as unknown as DiffApplyParams;

    // ── Validate required params ──────────────────────────────────────────
    if (!params.filePath || typeof params.filePath !== 'string') {
      throw new Error('diff_apply executor: "filePath" is required and must be a string');
    }
    if (!params.diff || typeof params.diff !== 'string') {
      throw new Error('diff_apply executor: "diff" is required and must be a string (unified diff format)');
    }

    // ── Resolve and validate path ─────────────────────────────────────────
    const absolutePath = validateWorkspacePath(params.filePath, workspaceRoot);

    // ── Read the file ─────────────────────────────────────────────────────
    let content: string;
    try {
      content = await fs.promises.readFile(absolutePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `diff_apply executor: Cannot read file "${params.filePath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // ── Create backup before applying ─────────────────────────────────────
    const backupPath = await createBackup(absolutePath, workspaceRoot);

    // ── Parse the unified diff ────────────────────────────────────────────
    const hunks = parseUnifiedDiff(params.diff);

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

    // ARC 15: Authorize FS write through the audit system
    authorizeFsOp(params.filePath, step.id, 'write');

    // ── Write the modified file ───────────────────────────────────────────
    await fs.promises.writeFile(absolutePath, fileLines.join('\n'), 'utf-8');

    return {
      filePath: params.filePath,
      hunksApplied: hunks.length,
      backupPath,
    };
  };
};
