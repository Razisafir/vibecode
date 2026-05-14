import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.c': 'C',
  '.cpp': 'C++',
  '.h': 'C/C++',
  '.hpp': 'C++',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.sql': 'SQL',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'LESS',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.xml': 'XML',
  '.md': 'Markdown',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
};

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'target',
  '.venv',
  'venv',
  '.env',
  '.idea',
  '.vscode',
  '.cache',
  'coverage',
  '.turbo',
  '.vercel',
  '.netlify',
]);

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerWorkspaceHandlers(): void {
  // ── workspace:analyze ──────────────────────────────────────────────────
  ipcMain.handle('workspace:analyze', async (_event, workspacePath: string) => {
    try {
      const resolved = path.resolve(workspacePath);

      if (!fs.existsSync(resolved)) {
        return err(`Workspace path not found: ${resolved}`);
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return err(`Path is not a directory: ${resolved}`);
      }

      const info = analyzeWorkspace(resolved);
      return ok({ workspace: info });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:open ─────────────────────────────────────────────────────
  ipcMain.handle('workspace:open', async (event, workspacePath?: string) => {
    try {
      let selectedPath: string | null = workspacePath ?? null;

      // If no path provided, show directory picker dialog
      if (!selectedPath) {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
          return err('No window found');
        }

        const result = await dialog.showOpenDialog(win, {
          title: 'Open Workspace',
          properties: ['openDirectory', 'createDirectory'],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return ok({ canceled: true, workspace: null });
        }

        selectedPath = result.filePaths[0];
      }

      const resolved = path.resolve(selectedPath);
      if (!fs.existsSync(resolved)) {
        return err(`Workspace path not found: ${resolved}`);
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return err(`Path is not a directory: ${resolved}`);
      }

      const info = analyzeWorkspace(resolved);
      return ok({ canceled: false, workspace: info });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:close ────────────────────────────────────────────────────
  ipcMain.handle('workspace:close', async () => {
    try {
      // In a full implementation, this would clean up watchers,
      // save session state, etc.
      return ok({ closed: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── workspace:recent ───────────────────────────────────────────────────
  ipcMain.handle('workspace:recent', async () => {
    try {
      // Return recent workspaces — in production, this would be
      // persisted via electron-store or similar
      return ok({ workspaces: [] });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Workspace handlers registered');
}

// ─── Workspace Analysis ─────────────────────────────────────────────────────

function analyzeWorkspace(rootPath: string): WorkspaceInfo {
  const name = path.basename(rootPath);
  const files: string[] = [];
  const directories: string[] = [];
  const languages: Record<string, number> = {};
  let totalSize = 0;
  let totalFiles = 0;

  // Walk the directory tree (max depth 3 to avoid slowness)
  function walk(dir: string, depth: number) {
    if (depth > 3) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied
    }

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

        try {
          const stat = fs.statSync(fullPath);
          totalSize += stat.size;
        } catch {
          // Permission denied
        }

        // Detect language
        const ext = path.extname(entry.name).toLowerCase();
        const lang = LANGUAGE_EXTENSIONS[ext];
        if (lang) {
          languages[lang] = (languages[lang] ?? 0) + 1;
        }
      }
    }
  }

  walk(rootPath, 0);

  // Detect project type
  let type: WorkspaceInfo['type'] = 'generic';
  if (fs.existsSync(path.join(rootPath, 'package.json'))) {
    type = 'node';
  } else if (fs.existsSync(path.join(rootPath, 'requirements.txt')) || fs.existsSync(path.join(rootPath, 'pyproject.toml'))) {
    type = 'python';
  } else if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) {
    type = 'rust';
  } else if (fs.existsSync(path.join(rootPath, 'go.mod'))) {
    type = 'go';
  } else if (fs.existsSync(path.join(rootPath, 'pom.xml')) || fs.existsSync(path.join(rootPath, 'build.gradle'))) {
    type = 'java';
  }

  return {
    rootPath,
    name,
    type,
    hasGit: fs.existsSync(path.join(rootPath, '.git')),
    hasPackageJson: fs.existsSync(path.join(rootPath, 'package.json')),
    hasReadme: fs.existsSync(path.join(rootPath, 'README.md')) || fs.existsSync(path.join(rootPath, 'readme.md')),
    files: files.slice(0, 500), // Limit to prevent huge payloads
    directories: directories.slice(0, 200),
    languages,
    totalFiles,
    totalSize,
  };
}
