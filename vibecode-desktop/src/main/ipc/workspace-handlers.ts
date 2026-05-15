// ─── Workspace IPC Handlers ─────────────────────────────────────────────────
//
// Enhanced with the WorkspaceAnalyzer service for deeper project intelligence.
// The `workspace:analyze` IPC now uses the full analyzer with caching,
// while workspace open/switch still uses the fast synchronous analyzer
// for quick UI updates.
// ─────────────────────────────────────────────────────────────────────────────

import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  kernelFsExists,
  kernelFsStatSync,
  kernelFsReaddirSync,
} from '../kernel/kernel-fs';
import * as path from 'path';
// ARC 12: Import ESM workspace setter instead of legacy execution-handlers
import { getStateMachine } from './state-machine-handlers';
import { WorkspaceStore, detectProjectType } from '../services/workspace-store';
import { analyzeWorkspace as deepAnalyzeWorkspace, clearAnalysisCache, WorkspaceAnalysis } from '../services/workspace-analyzer';
import { validateWithError } from '../utils/validation';
import { WorkspacePathSchema } from '../utils/schemas';
import { auditLog } from '../utils/audit-log';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function err(message: string): IpcResult {
  return { success: false, error: message };
}

interface WorkspaceInfo {
  rootPath: string;
  name: string;
  type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic';
  hasGit: boolean;
  hasPackageJson: boolean;
  hasReadme: boolean;
  files: string[];
  directories: string[];
  languages: Record<string, number>;
  totalFiles: number;
  totalSize: number;
}

// ─── Language Detection ─────────────────────────────────────────────────────

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
  '.c': 'C', '.cpp': 'C++', '.h': 'C/C++', '.hpp': 'C++', '.cs': 'C#',
  '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.sh': 'Shell', '.bash': 'Shell',
  '.sql': 'SQL', '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
  '.md': 'Markdown', '.vue': 'Vue', '.svelte': 'Svelte',
};

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', '.nuxt', 'dist', 'build',
  'target', '.venv', 'venv', '.env', '.idea', '.vscode', '.cache',
  'coverage', '.turbo', '.vercel', '.netlify',
]);

// ─── Singleton Store ────────────────────────────────────────────────────────

const workspaceStore = new WorkspaceStore();

// ─── Current workspace state ────────────────────────────────────────────────

let currentWorkspace: WorkspaceInfo | null = null;

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerWorkspaceHandlers(): void {
  // ── workspace:analyze (enhanced: uses WorkspaceAnalyzer with caching) ──
  ipcMain.handle('workspace:analyze', async (_event, workspacePath: string) => {
    try {
      const pathV = validateWithError(WorkspacePathSchema, workspacePath);
      if (!pathV.success) return err(pathV.error!);

      const resolved = path.resolve(workspacePath);
      if (!kernelFsExists(resolved)) return err(`Workspace path not found: ${resolved}`);
      const stat = kernelFsStatSync(resolved);
      if (!stat.isDirectory()) return err(`Path is not a directory: ${resolved}`);

      // Use the deep analyzer with caching
      const analysis = await deepAnalyzeWorkspace(resolved);
      return ok({ workspace: analysis });
    } catch (error) {
      logger.error('workspace', 'Failed to analyze workspace', { error: String(error) });
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:open ─────────────────────────────────────────────────────
  ipcMain.handle('workspace:open', async (event, workspacePath?: string) => {
    try {
      let selectedPath: string | null = workspacePath ?? null;

      if (!selectedPath) {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return err('No window found');

        const result = await dialog.showOpenDialog(win, {
          title: 'Open Workspace',
          properties: ['openDirectory', 'createDirectory'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return ok({ canceled: true, workspace: null });
        }
        selectedPath = result.filePaths[0];
      }

      const pathV = validateWithError(WorkspacePathSchema, selectedPath);
      if (!pathV.success) return err(pathV.error!);

      const resolved = path.resolve(selectedPath);
      if (!kernelFsExists(resolved)) return err(`Workspace path not found: ${resolved}`);
      const stat = kernelFsStatSync(resolved);
      if (!stat.isDirectory()) return err(`Path is not a directory: ${resolved}`);

      const info = analyzeWorkspace(resolved);
      currentWorkspace = info;
      workspaceStore.addRecent(resolved, info.name, info.type);
      // ARC 12: Set ESM workspace root
      const sm = getStateMachine();
      if (sm) { sm.setWorkspaceRoot(resolved); sm.registerExecutorsFromWorkspace(); }

      // Clear the deep analysis cache for this workspace (might have changed)
      clearAnalysisCache(resolved);

      auditLog.auditLog('workspace.open', { rootPath: resolved, name: info.name, type: info.type });
      return ok({ canceled: false, workspace: info });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:close ────────────────────────────────────────────────────
  ipcMain.handle('workspace:close', async () => {
    try {
      const prevPath = currentWorkspace?.rootPath;
      currentWorkspace = null;
      if (prevPath) {
        auditLog.auditLog('workspace.close', { rootPath: prevPath });
      }
      return ok({ closed: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:recent ───────────────────────────────────────────────────
  ipcMain.handle('workspace:recent', async (_event, limit?: number) => {
    try {
      const workspaces = workspaceStore.getRecent(limit);
      return ok({ workspaces });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:addRecent ────────────────────────────────────────────────
  ipcMain.handle('workspace:addRecent', async (_event, wsPath: string, name?: string, type?: string) => {
    try {
      const pathV = validateWithError(WorkspacePathSchema, wsPath);
      if (!pathV.success) return err(pathV.error!);

      const entry = workspaceStore.addRecent(wsPath, name, type as any);
      return ok({ workspace: entry });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:removeRecent ─────────────────────────────────────────────
  ipcMain.handle('workspace:removeRecent', async (_event, wsPath: string) => {
    try {
      const pathV = validateWithError(WorkspacePathSchema, wsPath);
      if (!pathV.success) return err(pathV.error!);

      const removed = workspaceStore.removeRecent(wsPath);
      return ok({ removed, path: wsPath });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:switchWorkspace ──────────────────────────────────────────
  ipcMain.handle('workspace:switchWorkspace', async (_event, wsPath: string) => {
    try {
      const pathV = validateWithError(WorkspacePathSchema, wsPath);
      if (!pathV.success) return err(pathV.error!);

      const resolved = path.resolve(wsPath);
      if (!kernelFsExists(resolved)) return err(`Workspace path not found: ${resolved}`);
      const stat = kernelFsStatSync(resolved);
      if (!stat.isDirectory()) return err(`Path is not a directory: ${resolved}`);

      const info = analyzeWorkspace(resolved);
      currentWorkspace = info;
      workspaceStore.addRecent(resolved, info.name, info.type);
      // ARC 12: Set ESM workspace root on switch
      const sm2 = getStateMachine();
      if (sm2) { sm2.setWorkspaceRoot(resolved); sm2.registerExecutorsFromWorkspace(); }

      // Clear the deep analysis cache for this workspace
      clearAnalysisCache(resolved);

      auditLog.auditLog('workspace.switch', { rootPath: resolved, name: info.name });
      return ok({ workspace: info });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:getInfo ──────────────────────────────────────────────────
  ipcMain.handle('workspace:getInfo', async () => {
    try {
      return ok({
        workspace: currentWorkspace ? {
          rootPath: currentWorkspace.rootPath, name: currentWorkspace.name,
          type: currentWorkspace.type, hasGit: currentWorkspace.hasGit,
          totalFiles: currentWorkspace.totalFiles, languages: currentWorkspace.languages,
        } : null,
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:searchFiles ──────────────────────────────────────────────
  ipcMain.handle('workspace:searchFiles', async (_event, pattern: string, maxResults?: number) => {
    try {
      if (!currentWorkspace) return err('No workspace open');
      if (!pattern || typeof pattern !== 'string') return err('Pattern is required');
      const results = searchFiles(currentWorkspace.rootPath, pattern, maxResults ?? 50);
      return ok({ files: results });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:fuzzySearch ──────────────────────────────────────────────
  ipcMain.handle('workspace:fuzzySearch', async (_event, query: string, maxResults?: number) => {
    try {
      if (!currentWorkspace) return err('No workspace open');
      if (!query || typeof query !== 'string') return err('Query is required');
      const results = fuzzySearchFiles(currentWorkspace.rootPath, query, maxResults ?? 50);
      return ok({ files: results });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  logger.info('ipc', 'Workspace handlers registered (with enhanced analyzer)');
}

// ─── Fast Workspace Analysis (for open/switch) ─────────────────────────────

function analyzeWorkspace(rootPath: string): WorkspaceInfo {
  const name = path.basename(rootPath);
  const files: string[] = [];
  const directories: string[] = [];
  const languages: Record<string, number> = {};
  let totalSize = 0;
  let totalFiles = 0;

  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    let entries: ReturnType<typeof kernelFsReaddirSync>;
    try { entries = kernelFsReaddirSync(dir); } catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        directories.push(relativePath);
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        files.push(relativePath);
        totalFiles++;
        try { const stat = kernelFsStatSync(fullPath); totalSize += stat.size; } catch { /* Permission denied */ }
        const ext = path.extname(entry.name).toLowerCase();
        const lang = LANGUAGE_EXTENSIONS[ext];
        if (lang) { languages[lang] = (languages[lang] ?? 0) + 1; }
      }
    }
  }

  walk(rootPath, 0);

  let type: WorkspaceInfo['type'] = 'generic';
  if (kernelFsExists(path.join(rootPath, 'package.json'))) type = 'node';
  else if (kernelFsExists(path.join(rootPath, 'requirements.txt')) || kernelFsExists(path.join(rootPath, 'pyproject.toml'))) type = 'python';
  else if (kernelFsExists(path.join(rootPath, 'Cargo.toml'))) type = 'rust';
  else if (kernelFsExists(path.join(rootPath, 'go.mod'))) type = 'go';
  else if (kernelFsExists(path.join(rootPath, 'pom.xml')) || kernelFsExists(path.join(rootPath, 'build.gradle'))) type = 'java';

  return {
    rootPath, name, type,
    hasGit: kernelFsExists(path.join(rootPath, '.git')),
    hasPackageJson: kernelFsExists(path.join(rootPath, 'package.json')),
    hasReadme: kernelFsExists(path.join(rootPath, 'README.md')) || kernelFsExists(path.join(rootPath, 'readme.md')),
    files: files.slice(0, 500),
    directories: directories.slice(0, 200),
    languages, totalFiles, totalSize,
  };
}

// ─── File Search ────────────────────────────────────────────────────────────

interface FileSearchResult {
  path: string;
  name: string;
  extension: string;
  relativePath: string;
}

function searchFiles(rootPath: string, pattern: string, maxResults: number): FileSearchResult[] {
  const results: FileSearchResult[] = [];
  const lowerPattern = pattern.toLowerCase();

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: ReturnType<typeof kernelFsReaddirSync>;
    try { entries = kernelFsReaddirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase().includes(lowerPattern)) {
          results.push({
            path: fullPath, name: entry.name,
            extension: path.extname(entry.name).toLowerCase(),
            relativePath: path.relative(rootPath, fullPath),
          });
        }
      }
    }
  }

  walk(rootPath);
  return results;
}

// ─── Fuzzy File Search ──────────────────────────────────────────────────────

function fuzzySearchFiles(rootPath: string, query: string, maxResults: number): FileSearchResult[] {
  const allFiles: FileSearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  const queryChars = lowerQuery.split('');

  function walk(dir: string) {
    let entries: ReturnType<typeof kernelFsReaddirSync>;
    try { entries = kernelFsReaddirSync(dir); } catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        allFiles.push({
          path: fullPath, name: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          relativePath: path.relative(rootPath, fullPath),
        });
      }
    }
  }

  walk(rootPath);

  const scored = allFiles.map((file) => {
    const lowerName = file.name.toLowerCase();
    const lowerRelPath = file.relativePath.toLowerCase();
    let score = 0;

    if (lowerName === lowerQuery) score = 1000;
    else if (lowerName.startsWith(lowerQuery)) score = 800;
    else if (lowerName.includes(lowerQuery)) score = 600;
    else if (lowerRelPath.includes(lowerQuery)) score = 400;
    else {
      let charIndex = 0;
      let consecutive = 0;
      let lastMatchPos = -2;
      for (let i = 0; i < lowerName.length && charIndex < queryChars.length; i++) {
        if (lowerName[i] === queryChars[charIndex]) {
          if (i === lastMatchPos + 1) { consecutive++; score += consecutive * 10; }
          score += 50;
          lastMatchPos = i;
          charIndex++;
        }
      }
      if (charIndex < queryChars.length) score = 0;
    }

    return { file, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.file);
}
