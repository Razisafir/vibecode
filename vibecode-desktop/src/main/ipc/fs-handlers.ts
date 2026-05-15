import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathSandbox } from '../services/path-sandbox';
import { logger } from '../utils/logger';
import { checkFsAuthorization } from '../core/execution-audit';

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

// ─── Sandbox Helper ─────────────────────────────────────────────────────────

/**
 * Validate a path against the sandbox and return the resolved path on success,
 * or an IpcResult error on failure.
 */
function validateOrFail(requestedPath: string): { resolvedPath: string } | IpcResult {
  const validation = pathSandbox.validatePath(requestedPath);
  if (!validation.allowed) {
    return err(validation.error ?? 'Access denied by path sandbox');
  }
  return { resolvedPath: validation.resolvedPath };
}

/**
 * Validate a file path for reading, checking both sandbox containment
 * and the read extension allowlist.
 */
function validateReadOrFail(requestedPath: string): { resolvedPath: string } | IpcResult {
  const pathValidation = validateOrFail(requestedPath);
  if ('success' in pathValidation) return pathValidation;

  const extValidation = pathSandbox.validateReadExtension(pathValidation.resolvedPath);
  if (!extValidation.allowed) {
    return err(extValidation.error ?? 'File extension not allowed for reading');
  }

  return pathValidation;
}

/**
 * Validate a file path for writing, checking both sandbox containment
 * and the write extension allowlist.
 */
function validateWriteOrFail(requestedPath: string): { resolvedPath: string } | IpcResult {
  const pathValidation = validateOrFail(requestedPath);
  if ('success' in pathValidation) return pathValidation;

  const extValidation = pathSandbox.validateWriteExtension(pathValidation.resolvedPath);
  if (!extValidation.allowed) {
    return err(extValidation.error ?? 'File extension not allowed for writing');
  }

  return pathValidation;
}

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerFsHandlers(): void {
  // ── fs:setWorkspaceRoot ───────────────────────────────────────────────
  ipcMain.handle('fs:setWorkspaceRoot', async (_event, rootPath: string) => {
    try {
      const resolved = path.resolve(rootPath);

      // Validate that the path exists and is a directory
      if (!fs.existsSync(resolved)) {
        return err(`Workspace path does not exist: ${resolved}`);
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return err(`Workspace path is not a directory: ${resolved}`);
      }

      pathSandbox.setWorkspaceRoot(resolved);
      logger.info('ipc', `Workspace root set to: ${resolved}`);

      return ok({ workspaceRoot: resolved, set: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:readFile ────────────────────────────────────────────────────────
  ipcMain.handle('fs:readFile', async (_event, filePath: string, encoding: BufferEncoding = 'utf-8') => {
    try {
      const validation = validateReadOrFail(filePath);
      if ('success' in validation) return validation;
      const resolved = validation.resolvedPath;

      if (!fs.existsSync(resolved)) {
        return err(`File not found: ${resolved}`);
      }

      const content = fs.readFileSync(resolved, encoding);
      return ok({ path: resolved, content, encoding });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:writeFile (ARC 15: Gateway-enforced) ───────────────────────────
  // FS writes are now DERIVATIVE — they ONLY happen as side effects of
  // ExecutionNode execution. If no gateway-authorized node exists, the
  // audit system will flag it as a bypass.
  ipcMain.handle(
    'fs:writeFile',
    async (_event, filePath: string, content: string, encoding: BufferEncoding = 'utf-8') => {
      try {
        // ARC 15: Check if this write was authorized by the gateway
        const authorized = checkFsAuthorization(filePath, 'write');
        if (!authorized) {
          logger.error('ipc', `FS write BLOCKED — no gateway authorization: ${filePath}`);
          return err(`File write blocked: no execution node authorizes writing to ${filePath}. All FS writes must go through the ExecutionGateway.`);
        }

        const validation = validateWriteOrFail(filePath);
        if ('success' in validation) return validation;
        const resolved = validation.resolvedPath;
        const dir = path.dirname(resolved);

        // Ensure directory exists (and is within sandbox)
        const dirValidation = validateOrFail(dir);
        if ('success' in dirValidation) return dirValidation;

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
      const validation = validateOrFail(dirPath);
      if ('success' in validation) return validation;
      const resolved = validation.resolvedPath;

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
      const validation = validateOrFail(watchPath);
      if ('success' in validation) return validation;
      const resolved = validation.resolvedPath;
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
              // Validate that the changed path is still within sandbox
              if (!pathSandbox.isWithinWorkspace(fullPath)) {
                return; // Silently skip paths outside sandbox
              }

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
      const validation = validateOrFail(watchPath);
      if ('success' in validation) return;
      const resolved = validation.resolvedPath;
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
              // Validate that the changed path is still within sandbox
              if (!pathSandbox.isWithinWorkspace(fullPath)) {
                return;
              }

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
      const validation = validateOrFail(filePath);
      if ('success' in validation) return validation;
      const resolved = validation.resolvedPath;

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
      const validation = validateOrFail(dirPath);
      if ('success' in validation) return validation;
      const resolved = validation.resolvedPath;

      if (fs.existsSync(resolved)) {
        return err(`Directory already exists: ${resolved}`);
      }

      fs.mkdirSync(resolved, { recursive: options?.recursive ?? true });
      return ok({ path: resolved, created: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── fs:delete (ARC 15: Gateway-enforced) ───────────────────────────────
  ipcMain.handle('fs:delete', async (_event, targetPath: string, options?: { recursive?: boolean }) => {
    try {
      // ARC 15: Check if this delete was authorized by the gateway
      const authorized = checkFsAuthorization(targetPath, 'delete');
      if (!authorized) {
        logger.error('ipc', `FS delete BLOCKED — no gateway authorization: ${targetPath}`);
        return err(`File delete blocked: no execution node authorizes deleting ${targetPath}. All FS operations must go through the ExecutionGateway.`);
      }

      const validation = validateOrFail(targetPath);
      if ('success' in validation) return validation;
      const resolved = validation.resolvedPath;

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

  // ── fs:rename (ARC 15: Gateway-enforced) ───────────────────────────────
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      // ARC 15: Check if this rename was authorized by the gateway
      const authorized = checkFsAuthorization(oldPath, 'rename');
      if (!authorized) {
        logger.error('ipc', `FS rename BLOCKED — no gateway authorization: ${oldPath}`);
        return err(`File rename blocked: no execution node authorizes renaming ${oldPath}. All FS operations must go through the ExecutionGateway.`);
      }

      // Validate BOTH old and new paths
      const oldValidation = validateOrFail(oldPath);
      if ('success' in oldValidation) return oldValidation;
      const resolvedOld = oldValidation.resolvedPath;

      const newValidation = validateWriteOrFail(newPath);
      if ('success' in newValidation) return newValidation;
      const resolvedNew = newValidation.resolvedPath;

      if (!fs.existsSync(resolvedOld)) {
        return err(`Source path not found: ${resolvedOld}`);
      }

      // Ensure target directory exists
      const targetDir = path.dirname(resolvedNew);
      const dirValidation = validateOrFail(targetDir);
      if ('success' in dirValidation) return dirValidation;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.renameSync(resolvedOld, resolvedNew);
      return ok({ oldPath: resolvedOld, newPath: resolvedNew, moved: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] File system handlers registered (with PathSandbox)');
}

// ─── Exports ────────────────────────────────────────────────────────────────

/** Re-export the PathSandbox instance so other modules can access it. */
export { pathSandbox } from '../services/path-sandbox';
