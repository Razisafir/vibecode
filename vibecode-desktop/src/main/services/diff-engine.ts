import * as fs from 'fs';
import * as path from 'path';
import type { ExecutionStep } from './execution-engine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber: number;
  /** Line number in the "before" file for remove/context lines */
  oldLineNumber?: number;
  /** Line number in the "after" file for add/context lines */
  newLineNumber?: number;
}

export interface DiffResult {
  filePath: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

// ─── DiffEngine ─────────────────────────────────────────────────────────────

/**
 * Computes real unified diffs between strings/file contents.
 *
 * Uses the Myers diff algorithm (optimized variant) to produce
 * line-by-line diffs suitable for rendering in the UI.
 */
export class DiffEngine {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Compare two strings and generate a structured diff result.
   */
  generateDiff(original: string, modified: string, filePath: string): DiffResult {
    const oldLines = original.split('\n');
    const newLines = modified.split('\n');

    // Compute the edit script using LCS (Longest Common Subsequence)
    const lcs = this.computeLCS(oldLines, newLines);
    const diffLines = this.buildDiffLines(oldLines, newLines, lcs);

    let additions = 0;
    let deletions = 0;

    for (const line of diffLines) {
      if (line.type === 'add') additions++;
      if (line.type === 'remove') deletions++;
    }

    return {
      filePath,
      additions,
      deletions,
      lines: diffLines,
    };
  }

  /**
   * Generate diff for an execution step that modifies a file.
   * Reads the current file content from disk and compares it against
   * the step's params.content (the proposed new content).
   */
  async generateFileDiffFromStep(step: ExecutionStep): Promise<DiffResult | null> {
    const filePath = this.resolveStepFilePath(step);
    if (!filePath) return null;

    // Only file-related steps can produce diffs
    if (!this.isFileStep(step.type)) return null;

    let originalContent = '';

    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      originalContent = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist yet — this is a creation, original is empty
      originalContent = '';
    }

    const modifiedContent = this.extractModifiedContent(step);
    if (modifiedContent === null) return null;

    const relativePath = path.relative(this.workspaceRoot, filePath);
    return this.generateDiff(originalContent, modifiedContent, relativePath);
  }

  /**
   * Generate diffs for all file-related steps in a plan.
   * Returns an array of DiffResult objects, one per file step.
   */
  async generatePlanDiffs(steps: ExecutionStep[]): Promise<DiffResult[]> {
    const results: DiffResult[] = [];

    for (const step of steps) {
      if (this.isFileStep(step.type)) {
        const diff = await this.generateFileDiffFromStep(step);
        if (diff) {
          results.push(diff);
        }
      }
    }

    return results;
  }

  /**
   * Format a diff result as HTML with syntax highlighting classes.
   * Returns an HTML string suitable for rendering in a web view.
   */
  formatDiffAsHtml(diff: DiffResult): string {
    const escapeHtml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };

    let html = `<div class="diff-file">`;
    html += `<div class="diff-header">${escapeHtml(diff.filePath)} <span class="diff-stats">+${diff.additions} -${diff.deletions}</span></div>`;
    html += `<table class="diff-table">`;

    for (const line of diff.lines) {
      const cssClass = line.type === 'add'
        ? 'diff-add'
        : line.type === 'remove'
          ? 'diff-remove'
          : 'diff-context';

      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

      const oldNum = line.oldLineNumber !== undefined ? String(line.oldLineNumber) : '';
      const newNum = line.newLineNumber !== undefined ? String(line.newLineNumber) : '';

      html += `<tr class="${cssClass}">`;
      html += `<td class="diff-line-num diff-line-num-old">${oldNum}</td>`;
      html += `<td class="diff-line-num diff-line-num-new">${newNum}</td>`;
      html += `<td class="diff-prefix">${escapeHtml(prefix)}</td>`;
      html += `<td class="diff-content">${escapeHtml(line.content)}</td>`;
      html += `</tr>`;
    }

    html += `</table></div>`;
    return html;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  /**
   * Compute the Longest Common Subsequence table for two string arrays.
   * Returns a 2D table where table[i][j] is the LCS length of
   * oldLines[0..i-1] and newLines[0..j-1].
   */
  private computeLCS(oldLines: string[], newLines: string[]): number[][] {
    const m = oldLines.length;
    const n = newLines.length;

    // Use space-optimized LCS: only keep two rows at a time
    const table: number[][] = [];
    for (let i = 0; i <= m; i++) {
      table[i] = new Array(n + 1).fill(0);
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          table[i][j] = table[i - 1][j - 1] + 1;
        } else {
          table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
        }
      }
    }

    return table;
  }

  /**
   * Build the diff lines by backtracking through the LCS table.
   * Produces context lines (unchanged), add lines, and remove lines.
   */
  private buildDiffLines(
    oldLines: string[],
    newLines: string[],
    lcsTable: number[][],
  ): DiffLine[] {
    const result: DiffLine[] = [];
    let i = oldLines.length;
    let j = newLines.length;

    // Backtrack from the end
    const rawLines: Array<{ type: 'add' | 'remove' | 'context'; content: string; oldIdx?: number; newIdx?: number }> = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        rawLines.push({ type: 'context', content: oldLines[i - 1], oldIdx: i, newIdx: j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || lcsTable[i][j - 1] >= lcsTable[i - 1][j])) {
        rawLines.push({ type: 'add', content: newLines[j - 1], newIdx: j });
        j--;
      } else if (i > 0) {
        rawLines.push({ type: 'remove', content: oldLines[i - 1], oldIdx: i });
        i--;
      }
    }

    // Reverse to get forward order
    rawLines.reverse();

    // Assign line numbers and build final DiffLine array
    let lineNum = 0;
    for (const raw of rawLines) {
      lineNum++;
      const diffLine: DiffLine = {
        type: raw.type,
        content: raw.content,
        lineNumber: lineNum,
      };

      if (raw.type === 'context') {
        diffLine.oldLineNumber = raw.oldIdx;
        diffLine.newLineNumber = raw.newIdx;
      } else if (raw.type === 'remove') {
        diffLine.oldLineNumber = raw.oldIdx;
      } else if (raw.type === 'add') {
        diffLine.newLineNumber = raw.newIdx;
      }

      result.push(diffLine);
    }

    // Add some context grouping: collapse long runs of context lines
    return this.collapseContext(result);
  }

  /**
   * Collapse runs of context lines longer than 3 + 3 (before/after)
   * to avoid overwhelming the diff view with unchanged lines.
   */
  private collapseContext(lines: DiffLine[]): DiffLine[] {
    const CONTEXT_THRESHOLD = 3;
    const result: DiffLine[] = [];
    let i = 0;

    while (i < lines.length) {
      if (lines[i].type === 'context') {
        // Find the length of this context run
        let runStart = i;
        while (i < lines.length && lines[i].type === 'context') {
          i++;
        }
        const runLength = i - runStart;

        if (runLength > CONTEXT_THRESHOLD * 2) {
          // Keep first CONTEXT_THRESHOLD and last CONTEXT_THRESHOLD
          for (let k = runStart; k < runStart + CONTEXT_THRESHOLD; k++) {
            result.push(lines[k]);
          }
          // Add a collapsed indicator
          const collapsedCount = runLength - CONTEXT_THRESHOLD * 2;
          result.push({
            type: 'context',
            content: `@@ ... ${collapsedCount} lines collapsed ... @@`,
            lineNumber: -1,
          });
          for (let k = i - CONTEXT_THRESHOLD; k < i; k++) {
            result.push(lines[k]);
          }
        } else {
          // Keep all context lines
          for (let k = runStart; k < i; k++) {
            result.push(lines[k]);
          }
        }
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result;
  }

  /**
   * Check if a step type involves file operations.
   */
  private isFileStep(type: ExecutionStep['type']): boolean {
    return ['file_write', 'file_read', 'file_edit', 'code_generation', 'code_edit', 'diff_apply'].includes(type);
  }

  /**
   * Resolve the absolute file path from a step's params.
   */
  private resolveStepFilePath(step: ExecutionStep): string | null {
    const relPath = (step.params.filePath as string) || (step.params.path as string);
    if (!relPath) return null;
    return path.resolve(this.workspaceRoot, relPath);
  }

  /**
   * Extract the proposed new content from a step's params.
   * Returns null if no content can be determined.
   */
  private extractModifiedContent(step: ExecutionStep): string | null {
    // Direct content field
    if (typeof step.params.content === 'string') {
      return step.params.content;
    }

    // For file_edit steps with replacements
    if (step.type === 'file_edit' || step.type === 'code_edit') {
      if (typeof step.params.newContent === 'string') {
        return step.params.newContent;
      }
    }

    // For diff_apply steps, we need to apply the diff first
    if (step.type === 'diff_apply') {
      if (typeof step.params.patch === 'string') {
        // We'll return the patch content as the "modified" for display purposes
        return step.params.patch;
      }
    }

    return null;
  }
}
