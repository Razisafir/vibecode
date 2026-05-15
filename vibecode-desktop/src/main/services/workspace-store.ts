// ─── Workspace Store — Recent Workspaces Persistence ──────────────────────
//
// Persists recent workspace info to ~/.vibecode/workspaces.json.
// Tracks: path, name, lastOpened timestamp, project type.

import {
  kernelFsExists,
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsWriteInternalSync,
  kernelFsRenameInternalSync,
  kernelFsMkdirInternalSync,
} from '../kernel/kernel-fs';
import path from 'path';
import { getWorkspacesDir, ensureDirectories } from '../utils/paths';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecentWorkspace {
  path: string;
  name: string;
  lastOpened: number;
  projectType: ProjectType;
}

export type ProjectType = 'node' | 'python' | 'rust' | 'go' | 'java' | 'generic';

interface WorkspaceStoreData {
  version: number;
  recentWorkspaces: RecentWorkspace[];
}

// ─── Project Type Detection ─────────────────────────────────────────────────

export function detectProjectType(dirPath: string): ProjectType {
  try {
    if (kernelFsExists(path.join(dirPath, 'package.json'))) return 'node';
    if (kernelFsExists(path.join(dirPath, 'requirements.txt')) || kernelFsExists(path.join(dirPath, 'pyproject.toml'))) return 'python';
    if (kernelFsExists(path.join(dirPath, 'Cargo.toml'))) return 'rust';
    if (kernelFsExists(path.join(dirPath, 'go.mod'))) return 'go';
    if (kernelFsExists(path.join(dirPath, 'pom.xml')) || kernelFsExists(path.join(dirPath, 'build.gradle'))) return 'java';
  } catch {
    // Permission errors, etc.
  }
  return 'generic';
}

// ─── WorkspaceStore Class ───────────────────────────────────────────────────

export class WorkspaceStore {
  private filePath: string;

  constructor() {
    ensureDirectories();
    this.filePath = path.join(getWorkspacesDir(), 'recent.json');
    this.ensureFile();
  }

  private ensureFile(): void {
    const dir = path.dirname(this.filePath);
    if (!kernelFsExistsInternal(dir)) {
      kernelFsMkdirInternalSync(dir);
    }
    if (!kernelFsExistsInternal(this.filePath)) {
      this.writeData({ version: 1, recentWorkspaces: [] });
    }
  }

  private readData(): WorkspaceStoreData {
    try {
      const raw = kernelFsReadSync(this.filePath);
      return JSON.parse(raw);
    } catch {
      return { version: 1, recentWorkspaces: [] };
    }
  }

  private writeData(data: WorkspaceStoreData): void {
    try {
      const tmpPath = this.filePath + '.tmp';
      kernelFsWriteInternalSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      kernelFsRenameInternalSync(tmpPath, this.filePath);
    } catch (error) {
      console.error('[WorkspaceStore] Failed to write:', error);
    }
  }

  // ─── Public Methods ───────────────────────────────────────────────────

  /** Add or update a recent workspace entry */
  addRecent(wsPath: string, name?: string, type?: ProjectType): RecentWorkspace {
    const data = this.readData();
    const resolvedPath = path.resolve(wsPath);
    const workspaceName = name ?? path.basename(resolvedPath);
    const projectType = type ?? detectProjectType(resolvedPath);

    // Remove existing entry for this path (to update it)
    const filtered = data.recentWorkspaces.filter((w) => w.path !== resolvedPath);

    const entry: RecentWorkspace = {
      path: resolvedPath,
      name: workspaceName,
      lastOpened: Date.now(),
      projectType,
    };

    // Add to front
    filtered.unshift(entry);

    // Keep at most 20 entries
    data.recentWorkspaces = filtered.slice(0, 20);

    this.writeData(data);
    return entry;
  }

  /** Get recent workspaces, sorted by lastOpened desc */
  getRecent(limit?: number): RecentWorkspace[] {
    const data = this.readData();
    const sorted = data.recentWorkspaces.sort((a, b) => b.lastOpened - a.lastOpened);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /** Remove a workspace from recent list */
  removeRecent(wsPath: string): boolean {
    const data = this.readData();
    const resolvedPath = path.resolve(wsPath);
    const initialLength = data.recentWorkspaces.length;
    data.recentWorkspaces = data.recentWorkspaces.filter((w) => w.path !== resolvedPath);

    if (data.recentWorkspaces.length < initialLength) {
      this.writeData(data);
      return true;
    }
    return false;
  }

  /** Clear all recent workspaces */
  clearRecent(): void {
    this.writeData({ version: 1, recentWorkspaces: [] });
  }
}
