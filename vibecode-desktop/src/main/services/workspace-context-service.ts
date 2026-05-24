// ─── VibeCode Desktop — Workspace Context Engine ──────────────────────────────
// ARC 20 P0-1: True workspace intelligence layer.
//
// The AI must maintain LIVE awareness of:
//   - open files & recently edited files
//   - dependency relationships
//   - terminal history & execution history
//   - recent errors & git diff state
//   - user intent continuity
//
// This service runs in the main process and assembles token-efficient
// AI context WITHOUT manual prompting. The AI automatically knows:
//   - which files matter
//   - what changed recently
//   - where bugs likely originate
//   - what the user is trying to do
// ──────────────────────────────────────────────────────────────────────────────

import * as path from 'path';
import { EventEmitter } from 'events';
import {
  kernelFsRead,
  kernelFsExistsAsync,
  kernelFsReaddir,
} from '../kernel/kernel-fs';
import { logger } from '../utils/logger';
import type { ExecutionNode } from './execution-state-machine';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Represents a file in the workspace with relevance metadata */
export interface WorkspaceFile {
  /** Absolute path */
  filePath: string;
  /** Relative to workspace root */
  relativePath: string;
  /** Language from extension */
  language: string;
  /** Last modified timestamp */
  lastModified: number;
  /** Is currently open in editor */
  isOpen: boolean;
  /** Is currently focused/active */
  isActive: boolean;
  /** Number of times edited in this session */
  editCount: number;
  /** Has unsaved changes */
  isDirty: boolean;
  /** Relevance score (0-1, computed from recency + frequency + context) */
  relevance: number;
  /** File size in bytes */
  size: number;
}

/** Terminal command with context */
export interface TerminalContext {
  /** Command string */
  command: string;
  /** Working directory */
  cwd: string;
  /** Exit code */
  exitCode: number | null;
  /** Whether it failed */
  failed: boolean;
  /** Timestamp */
  timestamp: number;
  /** Captured output snippet (last N lines) */
  outputSnippet: string;
  /** AI-detected intent */
  intent?: CommandIntent;
}

/** Detected intent of a terminal command */
export type CommandIntent =
  | 'install'      // npm install, pip install, etc.
  | 'build'        // npm run build, cargo build, etc.
  | 'test'         // npm test, pytest, etc.
  | 'run'          // npm start, python main.py, etc.
  | 'deploy'       // deploy commands
  | 'debug'        // debugging commands
  | 'git'          // git operations
  | 'explore'      // ls, cat, find, etc.
  | 'unknown';

/** Git diff summary */
export interface GitDiffSummary {
  /** Files modified (not staged) */
  modified: string[];
  /** Files added (not staged) */
  added: string[];
  /** Files deleted (not staged) */
  deleted: string[];
  /** Files staged for commit */
  staged: string[];
  /** Current branch */
  branch: string;
  /** Whether there are uncommitted changes */
  isDirty: boolean;
  /** Last commit message */
  lastCommitMessage: string;
}

/** Recent error from execution or terminal */
export interface RecentError {
  /** Source: 'terminal' | 'execution' | 'linter' | 'runtime' */
  source: string;
  /** Error message */
  message: string;
  /** File path if applicable */
  filePath?: string;
  /** Line number if applicable */
  line?: number;
  /** Timestamp */
  timestamp: number;
  /** Related node ID if from execution graph */
  nodeId?: string;
  /** Suggested fix (AI-generated) */
  suggestedFix?: string;
}

/** User intent tracking */
export interface UserIntent {
  /** What the user appears to be doing */
  currentGoal: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Evidence supporting this intent */
  evidence: string[];
  /** When this intent was detected */
  detectedAt: number;
  /** Related files */
  relatedFiles: string[];
}

/** The full workspace context — assembled for AI consumption */
export interface WorkspaceContext {
  /** Project metadata */
  project: {
    name: string;
    root: string;
    type: string;
    languages: string[];
    frameworks: string[];
    packageManager: string;
  };
  /** Relevant files ranked by importance */
  relevantFiles: WorkspaceFile[];
  /** Recently edited files (last 10) */
  recentEdits: WorkspaceFile[];
  /** Active file with surrounding context */
  activeFile: {
    path: string;
    language: string;
    cursorLine: number;
    selectedText?: string;
    visibleRange?: { startLine: number; endLine: number };
  } | null;
  /** Terminal history (last 5 commands) */
  terminalHistory: TerminalContext[];
  /** Recent errors (last 5) */
  recentErrors: RecentError[];
  /** Git state */
  gitState: GitDiffSummary | null;
  /** Detected user intent */
  userIntent: UserIntent | null;
  /** Active objectives from memory */
  activeObjectives: string[];
  /** When this context was assembled */
  assembledAt: number;
}

/** Compressed context for token-efficient AI prompts */
export interface CompressedContext {
  /** Project summary (1-2 sentences) */
  projectSummary: string;
  /** Key files with brief descriptions */
  keyFiles: Array<{ path: string; relevance: number; summary: string }>;
  /** Active file context */
  activeFileContext: string;
  /** Recent activity summary */
  recentActivity: string;
  /** Error context if any */
  errorContext: string;
  /** User intent summary */
  intentSummary: string;
  /** Estimated token count */
  estimatedTokens: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE CONTEXT SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class WorkspaceContextService extends EventEmitter {
  private workspaceRoot: string;
  private files: Map<string, WorkspaceFile> = new Map();
  private terminalHistory: TerminalContext[] = [];
  private recentErrors: RecentError[] = [];
  private gitState: GitDiffSummary | null = null;
  private userIntent: UserIntent | null = null;
  private activeFilePath: string | null = null;
  private activeCursorLine: number = 0;
  private activeSelectedText: string | undefined;
  private activeVisibleRange: { startLine: number; endLine: number } | undefined;
  private openFiles: Set<string> = new Set();
  private dirtyFiles: Set<string> = new Set();
  private activeObjectives: string[] = [];

  /** Cache of file dependency relationships: filePath → imported files */
  private dependencyCache: Map<string, string[]> = new Map();
  private dependencyCacheTimestamp: number = 0;
  private readonly DEPENDENCY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /** Context reassembly debounce */
  private reassembleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly REASSEMBLE_DELAY = 300; // ms

  /** Max terminal history entries */
  private readonly MAX_TERMINAL_HISTORY = 50;
  /** Max recent errors */
  private readonly MAX_RECENT_ERRORS = 20;

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.setMaxListeners(50);
  }

  // ─── Live State Updates ────────────────────────────────────────────────

  /** Update which files are open in the editor */
  updateOpenFiles(filePaths: string[], activeFile?: string): void {
    this.openFiles = new Set(filePaths);
    if (activeFile) {
      this.activeFilePath = activeFile;
    }
    // Update file metadata
    for (const fp of filePaths) {
      const existing = this.files.get(fp);
      if (existing) {
        existing.isOpen = true;
        existing.isActive = fp === this.activeFilePath;
      } else {
        this.registerFile(fp);
      }
    }
    // Mark closed files
    for (const [fp, file] of this.files) {
      if (!this.openFiles.has(fp)) {
        file.isOpen = false;
        file.isActive = false;
      }
    }
    this.scheduleReassemble();
  }

  /** Update cursor position and selection in active file */
  updateCursorPosition(filePath: string, line: number, selectedText?: string, visibleRange?: { startLine: number; endLine: number }): void {
    this.activeFilePath = filePath;
    this.activeCursorLine = line;
    this.activeSelectedText = selectedText;
    this.activeVisibleRange = visibleRange;
    this.scheduleReassemble();
  }

  /** Record a file edit event */
  recordFileEdit(filePath: string): void {
    const file = this.files.get(filePath);
    if (file) {
      file.editCount++;
      file.lastModified = Date.now();
      file.isDirty = true;
    } else {
      this.registerFile(filePath, { isDirty: true, editCount: 1 });
    }
    this.scheduleReassemble();
  }

  /** Mark a file as saved */
  recordFileSave(filePath: string): void {
    const file = this.files.get(filePath);
    if (file) {
      file.isDirty = false;
    }
    this.dirtyFiles.delete(filePath);
    this.scheduleReassemble();
  }

  /** Record a terminal command execution */
  recordTerminalCommand(command: string, cwd: string, exitCode: number | null, outputSnippet: string): void {
    const entry: TerminalContext = {
      command,
      cwd,
      exitCode,
      failed: exitCode !== null && exitCode !== 0,
      timestamp: Date.now(),
      outputSnippet: outputSnippet.slice(-500), // Keep last 500 chars
      intent: detectCommandIntent(command),
    };

    this.terminalHistory.push(entry);
    if (this.terminalHistory.length > this.MAX_TERMINAL_HISTORY) {
      this.terminalHistory = this.terminalHistory.slice(-this.MAX_TERMINAL_HISTORY);
    }

    // If the command failed, record it as a recent error
    if (entry.failed) {
      this.recentErrors.push({
        source: 'terminal',
        message: `Command failed: ${command} (exit code ${exitCode})`,
        timestamp: Date.now(),
        suggestedFix: suggestFixForCommand(command, exitCode, outputSnippet),
      });
      this.trimRecentErrors();
    }

    this.scheduleReassemble();
    this.emit('terminal:command', entry);
  }

  /** Record an execution error */
  recordExecutionError(error: RecentError): void {
    this.recentErrors.push(error);
    this.trimRecentErrors();
    this.scheduleReassemble();
    this.emit('error:recorded', error);
  }

  /** Update git state */
  updateGitState(state: GitDiffSummary): void {
    this.gitState = state;
    this.scheduleReassemble();
  }

  /** Update detected user intent */
  updateUserIntent(intent: UserIntent): void {
    this.userIntent = intent;
    this.scheduleReassemble();
  }

  /** Set active objectives from memory */
  setActiveObjectives(objectives: string[]): void {
    this.activeObjectives = objectives;
  }

  // ─── Context Assembly ──────────────────────────────────────────────────

  /** Assemble the full workspace context for AI consumption */
  assembleContext(): WorkspaceContext {
    const relevantFiles = this.computeRelevantFiles();
    const recentEdits = this.getRecentEdits();

    return {
      project: {
        name: path.basename(this.workspaceRoot),
        root: this.workspaceRoot,
        type: 'unknown', // Will be filled by workspace-analyzer
        languages: [],
        frameworks: [],
        packageManager: 'unknown',
      },
      relevantFiles,
      recentEdits,
      activeFile: this.activeFilePath ? {
        path: this.activeFilePath,
        language: this.getLanguageForFile(this.activeFilePath),
        cursorLine: this.activeCursorLine,
        selectedText: this.activeSelectedText,
        visibleRange: this.activeVisibleRange,
      } : null,
      terminalHistory: this.terminalHistory.slice(-5),
      recentErrors: this.recentErrors.slice(-5),
      gitState: this.gitState,
      userIntent: this.userIntent,
      activeObjectives: this.activeObjectives,
      assembledAt: Date.now(),
    };
  }

  /** Assemble a token-efficient compressed context for AI prompts */
  assembleCompressedContext(maxTokens: number = 2000): CompressedContext {
    const full = this.assembleContext();
    const result: CompressedContext = {
      projectSummary: '',
      keyFiles: [],
      activeFileContext: '',
      recentActivity: '',
      errorContext: '',
      intentSummary: '',
      estimatedTokens: 0,
    };

    // Project summary
    result.projectSummary = `Project: ${full.project.name} (${full.project.type})`;

    // Key files — top 10 by relevance
    const ranked = full.relevantFiles
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);
    result.keyFiles = ranked.map(f => ({
      path: f.relativePath,
      relevance: Math.round(f.relevance * 100) / 100,
      summary: summarizeFile(f),
    }));

    // Active file context
    if (full.activeFile) {
      const parts: string[] = [`Active file: ${full.activeFile.path} (line ${full.activeFile.cursorLine})`];
      if (full.activeFile.selectedText) {
        parts.push(`Selected: "${full.activeFile.selectedText.slice(0, 200)}"`);
      }
      result.activeFileContext = parts.join('\n');
    }

    // Recent activity
    const activities: string[] = [];
    if (full.recentEdits.length > 0) {
      activities.push(`Recently edited: ${full.recentEdits.map(f => f.relativePath).join(', ')}`);
    }
    if (full.terminalHistory.length > 0) {
      const cmds = full.terminalHistory.slice(-3).map(t => t.command);
      activities.push(`Recent commands: ${cmds.join('; ')}`);
    }
    if (full.gitState?.isDirty) {
      activities.push(`Git: ${full.gitState.modified.length} modified, ${full.gitState.added.length} added`);
    }
    result.recentActivity = activities.join('\n');

    // Error context
    if (full.recentErrors.length > 0) {
      result.errorContext = full.recentErrors
        .slice(-3)
        .map(e => `${e.source}: ${e.message}${e.suggestedFix ? ` → Fix: ${e.suggestedFix}` : ''}`)
        .join('\n');
    }

    // Intent summary
    if (full.userIntent) {
      result.intentSummary = `User appears to be: ${full.userIntent.currentGoal} (confidence: ${Math.round(full.userIntent.confidence * 100)}%)`;
    }

    // Estimate tokens (rough: 1 token ≈ 4 chars)
    const totalChars = JSON.stringify(result).length;
    result.estimatedTokens = Math.ceil(totalChars / 4);

    return result;
  }

  /** Format context as a system prompt section for AI */
  formatAsSystemPrompt(): string {
    const compressed = this.assembleCompressedContext();
    const lines: string[] = [];

    lines.push('## Workspace Context');
    lines.push(compressed.projectSummary);
    lines.push('');

    if (compressed.keyFiles.length > 0) {
      lines.push('### Key Files');
      for (const f of compressed.keyFiles) {
        lines.push(`- ${f.path} (${f.relevance}) — ${f.summary}`);
      }
      lines.push('');
    }

    if (compressed.activeFileContext) {
      lines.push('### Current Focus');
      lines.push(compressed.activeFileContext);
      lines.push('');
    }

    if (compressed.recentActivity) {
      lines.push('### Recent Activity');
      lines.push(compressed.recentActivity);
      lines.push('');
    }

    if (compressed.errorContext) {
      lines.push('### Recent Errors');
      lines.push(compressed.errorContext);
      lines.push('');
    }

    if (compressed.intentSummary) {
      lines.push('### User Intent');
      lines.push(compressed.intentSummary);
      lines.push('');
    }

    if (this.activeObjectives.length > 0) {
      lines.push('### Active Objectives');
      for (const obj of this.activeObjectives) {
        lines.push(`- ${obj}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ─── File Relevance Ranking ───────────────────────────────────────────

  /** Compute relevance scores for all known files */
  private computeRelevanceFiles(): WorkspaceFile[] {
    const now = Date.now();
    const files = Array.from(this.files.values());

    for (const file of files) {
      let score = 0;

      // Currently active file gets highest boost
      if (file.isActive) score += 0.4;

      // Open files get significant boost
      if (file.isOpen) score += 0.25;

      // Dirty files are being worked on
      if (file.isDirty) score += 0.15;

      // Edit frequency (normalized to 0-0.2 range)
      score += Math.min(file.editCount / 20, 0.2);

      // Recency of last edit (exponential decay, half-life 10 min)
      const ageMs = now - file.lastModified;
      const ageMin = ageMs / (1000 * 60);
      const recencyScore = Math.pow(0.5, ageMin / 10) * 0.15;
      score += recencyScore;

      // File type importance (source > config > other)
      const ext = path.extname(file.filePath).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
        score += 0.05;
      }

      // Dependency: files imported by the active file get a boost
      if (this.activeFilePath) {
        const deps = this.dependencyCache.get(this.activeFilePath);
        if (deps?.includes(file.relativePath)) {
          score += 0.1;
        }
      }

      file.relevance = Math.min(1, Math.max(0, score));
    }

    return files.sort((a, b) => b.relevance - a.relevance);
  }

  /** Get files ranked by relevance */
  private computeRelevantFiles(): WorkspaceFile[] {
    return this.computeRelevanceFiles().slice(0, 20);
  }

  /** Get recently edited files (last 10) */
  private getRecentEdits(): WorkspaceFile[] {
    return Array.from(this.files.values())
      .filter(f => f.editCount > 0)
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 10);
  }

  // ─── Dependency Analysis ───────────────────────────────────────────────

  /** Build file dependency graph (lazy, cached) */
  async buildDependencyGraph(): Promise<void> {
    const now = Date.now();
    if (now - this.dependencyCacheTimestamp < this.DEPENDENCY_CACHE_TTL) return;

    this.dependencyCache.clear();

    try {
      const srcDir = path.join(this.workspaceRoot, 'src');
      if (!(await kernelFsExistsAsync(srcDir))) return;

      // Simple import scanning — find import/require patterns
      await this.scanDirectoryForImports(srcDir);
      this.dependencyCacheTimestamp = now;

      logger.info('workspace-context', `Dependency graph built: ${this.dependencyCache.size} files`);
    } catch (err) {
      logger.warn('workspace-context', `Failed to build dependency graph: ${err}`);
    }
  }

  private async scanDirectoryForImports(dir: string, depth: number = 0): Promise<void> {
    if (depth > 5) return;
    try {
      const entries = await kernelFsReaddir(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          await this.scanDirectoryForImports(fullPath, depth + 1);
        } else if (entry.isFile() && ['.ts', '.tsx', '.js', '.jsx'].includes(path.extname(entry.name))) {
          try {
            const content = await kernelFsRead(fullPath);
            const imports = this.extractImports(content, path.relative(this.workspaceRoot, fullPath));
            const relPath = path.relative(this.workspaceRoot, fullPath);
            this.dependencyCache.set(relPath, imports);
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  private extractImports(content: string, fromPath: string): string[] {
    const imports: string[] = [];
    const importRegex = /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      if (importPath && importPath.startsWith('.')) {
        // Relative import — resolve to file path
        const dir = path.dirname(fromPath);
        let resolved = path.normalize(path.join(dir, importPath));
        // Add extension if missing
        if (!path.extname(resolved)) {
          resolved += '.ts'; // Default to .ts
        }
        imports.push(resolved);
      }
    }

    return imports;
  }

  // ─── File Registration ─────────────────────────────────────────────────

  private registerFile(filePath: string, overrides?: Partial<WorkspaceFile>): void {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    this.files.set(filePath, {
      filePath,
      relativePath,
      language: this.getLanguageForFile(filePath),
      lastModified: Date.now(),
      isOpen: this.openFiles.has(filePath),
      isActive: filePath === this.activeFilePath,
      editCount: 0,
      isDirty: false,
      relevance: 0,
      size: 0,
      ...overrides,
    });
  }

  private getLanguageForFile(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
      '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML',
      '.json': 'JSON', '.md': 'Markdown', '.yaml': 'YAML',
    };
    return map[ext] || 'Unknown';
  }

  // ─── Utilities ─────────────────────────────────────────────────────────

  private scheduleReassemble(): void {
    if (this.reassembleTimer) clearTimeout(this.reassembleTimer);
    this.reassembleTimer = setTimeout(() => {
      this.emit('context:updated', this.assembleContext());
      this.reassembleTimer = null;
    }, this.REASSEMBLE_DELAY);
  }

  private trimRecentErrors(): void {
    if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
      this.recentErrors = this.recentErrors.slice(-this.MAX_RECENT_ERRORS);
    }
  }

  /** Get raw file map for external queries */
  getFiles(): Map<string, WorkspaceFile> {
    return this.files;
  }

  /** Get terminal history */
  getTerminalHistory(): TerminalContext[] {
    return [...this.terminalHistory];
  }

  /** Get recent errors */
  getRecentErrors(): RecentError[] {
    return [...this.recentErrors];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Detect the intent of a terminal command */
function detectCommandIntent(command: string): CommandIntent {
  const cmd = command.trim().toLowerCase();

  if (/\b(npm|yarn|pnpm|bun)\s+install\b/.test(cmd) ||
      /\bpip\s+install\b/.test(cmd) ||
      /\bcargo\s+add\b/.test(cmd) ||
      /\bgo\s+get\b/.test(cmd)) {
    return 'install';
  }
  if (/\b(npm|yarn|pnpm|bun)\s+run\s+build\b/.test(cmd) ||
      /\bcargo\s+build\b/.test(cmd) ||
      /\bgo\s+build\b/.test(cmd) ||
      /\bmake\b/.test(cmd)) {
    return 'build';
  }
  if (/\b(npm|yarn|pnpm|bun)\s+(test|run\s+test)\b/.test(cmd) ||
      /\bpytest\b/.test(cmd) ||
      /\bcargo\s+test\b/.test(cmd) ||
      /\bgo\s+test\b/.test(cmd)) {
    return 'test';
  }
  if (/\b(npm|yarn|pnpm|bun)\s+(start|run\s+(dev|start|serve))\b/.test(cmd) ||
      /\bpython\s+/.test(cmd) ||
      /\bnode\s+/.test(cmd)) {
    return 'run';
  }
  if (/\bgit\s+/.test(cmd)) {
    return 'git';
  }
  if (/\bls\b/.test(cmd) || /\bcat\b/.test(cmd) || /\bfind\b/.test(cmd) ||
      /\bhead\b/.test(cmd) || /\btail\b/.test(cmd)) {
    return 'explore';
  }
  if (/\bgdb\b/.test(cmd) || /\blldb\b/.test(cmd) || /\bnode\s+--inspect\b/.test(cmd)) {
    return 'debug';
  }

  return 'unknown';
}

/** Suggest a fix for a failed command */
function suggestFixForCommand(command: string, exitCode: number | null, output: string): string {
  const cmd = command.toLowerCase();
  const out = output.toLowerCase();

  // npm/yarn install failures
  if (/\b(npm|yarn|pnpm)\s+install\b/.test(cmd)) {
    if (out.includes('eacces') || out.includes('permission denied')) {
      return 'Try running with appropriate permissions or check file ownership';
    }
    if (out.includes('enotfound') || out.includes('network')) {
      return 'Check your network connection and npm registry settings';
    }
    if (out.includes('peer dep')) {
      return 'Try with --legacy-peer-deps or resolve the peer dependency conflict';
    }
    return 'Try removing node_modules and lockfile, then reinstall';
  }

  // Build failures
  if (out.includes('type error') || out.includes('cannot find module')) {
    return 'Check for missing type definitions or incorrect import paths';
  }
  if (out.includes('syntax error') || out.includes('unexpected token')) {
    return 'Review syntax — there may be a missing bracket, comma, or incorrect syntax';
  }
  if (out.includes('module not found')) {
    return 'Run package install to install missing dependencies';
  }

  // Test failures
  if (out.includes('assertion') || out.includes('expected') && out.includes('received')) {
    return 'Test assertion failed — review expected vs actual values';
  }

  return 'Review the error output above for details';
}

/** Summarize a file for compressed context */
function summarizeFile(file: WorkspaceFile): string {
  const parts: string[] = [];
  if (file.isActive) parts.push('active');
  if (file.isOpen) parts.push('open');
  if (file.isDirty) parts.push('modified');
  if (file.editCount > 0) parts.push(`edited ${file.editCount}x`);
  parts.push(file.language);
  return parts.join(', ');
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let workspaceContextService: WorkspaceContextService | null = null;

export function getWorkspaceContextService(workspaceRoot?: string): WorkspaceContextService {
  if (!workspaceContextService && workspaceRoot) {
    workspaceContextService = new WorkspaceContextService(workspaceRoot);
  }
  if (!workspaceContextService) {
    throw new Error('WorkspaceContextService not initialized — call getWorkspaceContextService(workspaceRoot) first');
  }
  return workspaceContextService;
}

export function resetWorkspaceContextService(workspaceRoot: string): WorkspaceContextService {
  workspaceContextService = new WorkspaceContextService(workspaceRoot);
  return workspaceContextService;
}
