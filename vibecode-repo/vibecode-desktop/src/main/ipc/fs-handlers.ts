import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { FileSystemSandbox } from '../services/sandbox';

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

// ─── Sandbox ────────────────────────────────────────────────────────────────

const sandbox = new FileSystemSandbox({
  allowedRoots: [],
  blockExternalSymlinks: true,
  logBlockedAccess: true,
});

/** Expose sandbox for use in other handlers */
export { sandbox };

// ─── Active Watchers ────────────────────────────────────────────────────────

interface WatcherEntry {
  watcher: fs.FSWatcher;
  webContentsId: number;
  watchPath: string;
}

const activeWatchers: Map<string, WatcherEntry> = new Map();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerFsHandlers(): void {
  // ── fs:readFile ────────────────────────────────────────────────────────
  ipcMain.handle('fs:readFile', async (_event, filePath: string, encoding: BufferEncoding = 'utf-8') => {
    try {
      const resolved = path.resolve(filePath);

      // Sandbox validation
      const validation = sandbox.validateRead(resolved);
      if (!validation.allowed) {
        return err(`Access denied: ${validation.reason}`);
      }

      if (!fs.existsSync(resolved)) {
        return err(`File not found: ${resolved}`);
      }

      const content = fs.readFileSync(resolved, encoding);
      return ok({ path: resolved, content, encoding });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:writeFile ───────────────────────────────────────────────────────
  ipcMain.handle(
    'fs:writeFile',
    async (_event, filePath: string, content: string, encoding: BufferEncoding = 'utf-8') => {
      try {
        const resolved = path.resolve(filePath);

        // Sandbox validation
        const validation = sandbox.validateWrite(resolved);
        if (!validation.allowed) {
          return err(`Access denied: ${validation.reason}`);
        }

        const dir = path.dirname(resolved);

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(resolved, content, encoding);
        return ok({ path: resolved, bytesWritten: Buffer.byteLength(content, encoding) });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── fs:listDir ─────────────────────────────────────────────────────────
  ipcMain.handle('fs:listDir', async (_event, dirPath: string) => {
    try {
      const resolved = path.resolve(dirPath);

      // Sandbox validation
      const validation = sandbox.validateRead(resolved);
      if (!validation.allowed) {
        return err(`Access denied: ${validation.reason}`);
      }

      if (!fs.existsSync(resolved)) {
        return err(`Directory not found: ${resolved}`);
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return err(`Path is not a directory: ${resolved}`);
      }

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const items = entries.map((entry) => {
        const fullPath = path.join(resolved, entry.name);
        let entryStat: fs.Stats | null = null;

        try {
          entryStat = fs.statSync(fullPath);
        } catch {
          // Permission denied or other stat error
        }

        return {
          name: entry.name,
          path: fullPath,
          isFile: entry.isFile(),
          isDirectory: entry.isDirectory(),
          isSymbolicLink: entry.isSymbolicLink(),
          size: entryStat?.size ?? 0,
          modifiedTime: entryStat?.mtime?.getTime() ?? 0,
          createdTime: entryStat?.birthtime?.getTime() ?? 0,
        };
      });

      // Sort: directories first, then alphabetically
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return ok({ path: resolved, entries: items });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:watch ───────────────────────────────────────────────────────────
  ipcMain.handle('fs:watch', async (event, watchPath: string, _options?: { recursive?: boolean }) => {
    try {
      const resolved = path.resolve(watchPath);

      // Sandbox validation
      const validation = sandbox.validateRead(resolved);
      if (!validation.allowed) {
        return err(`Access denied: ${validation.reason}`);
      }

      const watchId = `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Close existing watchers from the same renderer
      const webContentsId = event.sender.id;
      for (const [id, entry] of activeWatchers) {
        if (entry.webContentsId === webContentsId) {
          entry.watcher.close();
          activeWatchers.delete(id);
        }
      }

      const watcher = fs.watch(
        resolved,
        { recursive: true, persistent: true },
        (eventName, changedPath) => {
          const fullPath = changedPath ? path.join(resolved, changedPath) : resolved;
          try {
            if (!event.sender.isDestroyed()) {
              event.sender.send('fs:watch:event', {
                watchId,
                event: eventName,
                path: fullPath,
                timestamp: Date.now(),
              });

              event.sender.send('fs:watch:change', fullPath, eventName);
            }
          } catch {
            // Window might be closed
          }
        }
      );

      watcher.on('error', (error) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('fs:watch:error', {
              watchId,
              error: error.message,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Window might be closed
        }
      });

      activeWatchers.set(watchId, { watcher, webContentsId, watchPath: resolved });

      return ok({ watchId, path: resolved });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:watch (send-based for preload compatibility) ────────────────────
  ipcMain.on('fs:watch', (event, watchPath: string) => {
    try {
      const resolved = path.resolve(watchPath);

      // Sandbox validation
      const validation = sandbox.validateRead(resolved);
      if (!validation.allowed) {
        return; // Silently deny
      }

      const webContentsId = event.sender.id;

      // Close existing watchers from the same renderer
      for (const [id, entry] of activeWatchers) {
        if (entry.webContentsId === webContentsId) {
          entry.watcher.close();
          activeWatchers.delete(id);
        }
      }

      const watchId = `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const watcher = fs.watch(
        resolved,
        { recursive: true, persistent: true },
        (eventName, changedPath) => {
          const fullPath = changedPath ? path.join(resolved, changedPath) : resolved;
          try {
            if (!event.sender.isDestroyed()) {
              event.sender.send('fs:watch:change', fullPath, eventName);
              event.sender.send('fs:watch:event', {
                watchId,
                event: eventName,
                path: fullPath,
                timestamp: Date.now(),
              });
            }
          } catch {
            // Window might be closed
          }
        }
      );

      watcher.on('error', (error) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('fs:watch:error', {
              watchId,
              error: error.message,
              timestamp: Date.now(),
            });
          }
        } catch {
          // Window might be closed
        }
      });

      activeWatchers.set(watchId, { watcher, webContentsId, watchPath: resolved });
    } catch (error) {
      console.error('[IPC] fs:watch error:', error);
    }
  });

  // ── fs:unwatch ─────────────────────────────────────────────────────────
  ipcMain.handle('fs:unwatch', async (_event, watchId: string) => {
    try {
      const entry = activeWatchers.get(watchId);
      if (!entry) {
        return err(`Watcher not found: ${watchId}`);
      }

      entry.watcher.close();
      activeWatchers.delete(watchId);
      return ok({ watchId, stopped: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:unwatchAll ──────────────────────────────────────────────────────
  ipcMain.handle('fs:unwatchAll', async (_event) => {
    try {
      for (const [id, entry] of activeWatchers) {
        entry.watcher.close();
        activeWatchers.delete(id);
      }
      return ok({ stopped: true, count: activeWatchers.size });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:stat ────────────────────────────────────────────────────────────
  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    try {
      const resolved = path.resolve(filePath);

      // Sandbox validation
      const validation = sandbox.validateRead(resolved);
      if (!validation.allowed) {
        return err(`Access denied: ${validation.reason}`);
      }

      if (!fs.existsSync(resolved)) {
        return err(`Path not found: ${resolved}`);
      }

      const stat = fs.statSync(resolved);

      return ok({
        path: resolved,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        isSymbolicLink: stat.isSymbolicLink(),
        size: stat.size,
        modifiedTime: stat.mtime.getTime(),
        createdTime: stat.birthtime.getTime(),
        accessedTime: stat.atime.getTime(),
        mode: stat.mode,
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:mkdir ───────────────────────────────────────────────────────────
  ipcMain.handle('fs:mkdir', async (_event, dirPath: string, options?: { recursive?: boolean }) => {
    try {
      const resolved = path.resolve(dirPath);

      // Sandbox validation
      const validation = sandbox.validateWrite(resolved);
      if (!validation.allowed) {
        return err(`Access denied: ${validation.reason}`);
      }

      if (fs.existsSync(resolved)) {
        return err(`Directory already exists: ${resolved}`);
      }

      fs.mkdirSync(resolved, { recursive: options?.recursive ?? true });
      return ok({ path: resolved, created: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:delete ──────────────────────────────────────────────────────────
  ipcMain.handle('fs:delete', async (_event, targetPath: string, options?: { recursive?: boolean }) => {
    try {
      const resolved = path.resolve(targetPath);

      // Sandbox validation
      const validation = sandbox.validateDelete(resolved);
      if (!validation.allowed) {
        return err(`Access denied: ${validation.reason}`);
      }

      if (!fs.existsSync(resolved)) {
        return err(`Path not found: ${resolved}`);
      }

      const stat = fs.statSync(resolved);

      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: options?.recursive ?? false, force: true });
      } else {
        fs.unlinkSync(resolved);
      }

      return ok({ path: resolved, deleted: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:rename ──────────────────────────────────────────────────────────
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      const resolvedOld = path.resolve(oldPath);
      const resolvedNew = path.resolve(newPath);

      // Sandbox validation for both paths
      const readValidation = sandbox.validateRead(resolvedOld);
      if (!readValidation.allowed) {
        return err(`Read access denied: ${readValidation.reason}`);
      }

      const writeValidation = sandbox.validateWrite(resolvedNew);
      if (!writeValidation.allowed) {
        return err(`Write access denied: ${writeValidation.reason}`);
      }

      if (!fs.existsSync(resolvedOld)) {
        return err(`Source path not found: ${resolvedOld}`);
      }

      // Ensure target directory exists
      const targetDir = path.dirname(resolvedNew);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.renameSync(resolvedOld, resolvedNew);
      return ok({ oldPath: resolvedOld, newPath: resolvedNew, moved: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:addWorkspaceRoot ────────────────────────────────────────────────
  ipcMain.handle('fs:addWorkspaceRoot', async (_event, rootPath: string) => {
    try {
      const resolved = path.resolve(rootPath);
      if (!fs.existsSync(resolved)) {
        return err(`Path not found: ${resolved}`);
      }
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return err(`Path is not a directory: ${resolved}`);
      }

      sandbox.addRoot(resolved);
      return ok({ root: resolved, added: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:getWorkspaceRoots ───────────────────────────────────────────────
  ipcMain.handle('fs:getWorkspaceRoots', async () => {
    try {
      return ok({ roots: sandbox.getAllowedRoots() });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] File system handlers registered (with sandboxing)');
}
