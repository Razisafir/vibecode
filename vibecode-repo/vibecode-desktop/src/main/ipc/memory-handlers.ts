import { ipcMain } from 'electron';
import { MemoryStoreOptimized, MemoryEntry } from '../services/memory-store-optimized';

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

// ─── Singleton Memory Store (Optimized) ─────────────────────────────────────

const memoryStore = new MemoryStoreOptimized({
  maxCacheSize: 500,
  maxProjectEntries: 200,
  compactionIntervalMs: 5 * 60 * 1000, // 5 min
  idleThresholdMs: 30 * 60 * 1000, // 30 min
});

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerMemoryHandlers(): void {
  // ── memory:store ───────────────────────────────────────────────────────
  ipcMain.handle(
    'memory:store',
    async (
      _event,
      entry: Omit<MemoryEntry, 'id' | 'timestamp' | 'lastAccessed' | 'accessCount'>
    ) => {
      try {
        const stored = memoryStore.store(entry);
        return ok({ memory: stored });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── memory:retrieve ────────────────────────────────────────────────────
  ipcMain.handle('memory:retrieve', async (_event, id: string) => {
    try {
      const memory = memoryStore.retrieve(id);
      if (!memory) {
        return err(`Memory not found: ${id}`);
      }
      return ok({ memory });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:search ──────────────────────────────────────────────────────
  ipcMain.handle(
    'memory:search',
    async (_event, query: string, projectId?: string, limit?: number) => {
      try {
        const results = memoryStore.search(query, projectId, limit);
        return ok({ results, count: results.length });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── memory:rank ────────────────────────────────────────────────────────
  ipcMain.handle('memory:rank', async (_event, query: string, memories: MemoryEntry[]) => {
    try {
      const ranked = memoryStore.rank(query, memories);
      return ok({ ranked });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:delete ──────────────────────────────────────────────────────
  ipcMain.handle('memory:delete', async (_event, id: string) => {
    try {
      const deleted = memoryStore.delete(id);
      if (!deleted) {
        return err(`Memory not found: ${id}`);
      }
      return ok({ deleted: true, id });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:list ────────────────────────────────────────────────────────
  ipcMain.handle('memory:list', async (_event, projectId: string) => {
    try {
      const memories = memoryStore.list(projectId);
      return ok({ memories, count: memories.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:summarize ───────────────────────────────────────────────────
  ipcMain.handle('memory:summarize', async (_event, projectId: string) => {
    try {
      const summary = memoryStore.summarize(projectId);
      return ok({ summary });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:update ──────────────────────────────────────────────────────
  ipcMain.handle('memory:update', async (_event, id: string, updates: Partial<MemoryEntry>) => {
    try {
      const updated = memoryStore.update(id, updates);
      if (!updated) {
        return err(`Memory not found: ${id}`);
      }
      return ok({ memory: updated });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:prune ───────────────────────────────────────────────────────
  ipcMain.handle('memory:prune', async (_event, olderThanDays: number = 90) => {
    try {
      const removed = memoryStore.prune(olderThanDays);
      return ok({ removed, olderThanDays });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:cacheStats ──────────────────────────────────────────────────
  ipcMain.handle('memory:cacheStats', async () => {
    try {
      return ok({
        cacheSize: memoryStore.getCacheSize(),
        loadedProjectCount: memoryStore.getLoadedProjectCount(),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Memory handlers registered (optimized with LRU + lazy loading)');
}

/** Expose memoryStore for use in other handlers */
export { memoryStore };
