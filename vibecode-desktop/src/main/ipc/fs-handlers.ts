import { ipcMain } from 'electron';
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

// ─── Active Watchers ────────────────────────────────────────────────────────

interface WatcherEntry {
  watcher: fs.FSWatcher;
  webContentsId: number;
}

const activeWatchers: Map<string, WatcherEntry> = new Map();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerFsHandlers(): void {
  // ── fs:readFile ────────────────────────────────────────────────────────
  ipcMain.handle('fs:readFile', async (_event, filePath: string, encoding: BufferEncoding = 'utf-8') => {
    try {
      const resolved = path.resolve(filePath);

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
      const watchId = `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Close existing watchers from the same renderer
      const webContentsId = event.sender.id;
      for (const [id, entry] of activeWatchers) {
        if (entry.webContentsId === webContentsId && id.startsWith('watch_')) {
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
              // Structured event for new API consumers
              event.sender.send('fs:watch:event', {
                watchId,
                event: eventName,
                path: fullPath,
                timestamp: Date.now(),
              });

              // Legacy compatible event for preload (filePath, eventType) format
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

      activeWatchers.set(watchId, { watcher, webContentsId });

      return ok({ watchId, path: resolved });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:watch (send-based for preload compatibility) ────────────────────
  ipcMain.on('fs:watch', (event, watchPath: string) => {
    try {
      const resolved = path.resolve(watchPath);
      const webContentsId = event.sender.id;

      // Close existing watchers from the same renderer
      for (const [id, entry] of activeWatchers) {
        if (entry.webContentsId === webContentsId && id.startsWith('watch_')) {
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

      activeWatchers.set(watchId, { watcher, webContentsId });
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

  // ── fs:stat ────────────────────────────────────────────────────────────
  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    try {
      const resolved = path.resolve(filePath);

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

  console.log('[IPC] File system handlers registered');
}
