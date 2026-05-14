import { ipcMain } from 'electron';
import { MemoryStore, MemoryEntry } from '../services/memory-store';
import { validateWithError } from '../utils/validation';
import { MemoryEntryInputSchema, MemoryUpdateSchema, IdSchema } from '../utils/schemas';

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

// ─── Singleton Memory Store ─────────────────────────────────────────────────

const memoryStore = new MemoryStore();

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
        const validation = validateWithError(MemoryEntryInputSchema, entry);
        if (!validation.success) {
          return err(validation.error!);
        }

        const stored = memoryStore.store(validation.data!);
        return ok({ memory: stored });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── memory:retrieve ────────────────────────────────────────────────────
  ipcMain.handle('memory:retrieve', async (_event, id: string) => {
    try {
      const idV = validateWithError(IdSchema, id);
      if (!idV.success) return err(idV.error!);

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
        if (!query || typeof query !== 'string') {
          return err('Query is required and must be a string');
        }

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
      if (!query || typeof query !== 'string') {
        return err('Query is required and must be a string');
      }
      if (!Array.isArray(memories)) {
        return err('Memories must be an array');
      }

      const ranked = memoryStore.rank(query, memories);
      return ok({ ranked });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:delete ──────────────────────────────────────────────────────
  ipcMain.handle('memory:delete', async (_event, id: string) => {
    try {
      const idV = validateWithError(IdSchema, id);
      if (!idV.success) return err(idV.error!);

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
      if (!projectId || typeof projectId !== 'string') {
        return err('Project ID is required and must be a string');
      }

      const memories = memoryStore.list(projectId);
      return ok({ memories, count: memories.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:summarize ───────────────────────────────────────────────────
  ipcMain.handle('memory:summarize', async (_event, projectId: string) => {
    try {
      if (!projectId || typeof projectId !== 'string') {
        return err('Project ID is required and must be a string');
      }

      const summary = memoryStore.summarize(projectId);
      return ok({ summary });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── memory:update ──────────────────────────────────────────────────────
  ipcMain.handle('memory:update', async (_event, id: string, updates: Partial<MemoryEntry>) => {
    try {
      const idV = validateWithError(IdSchema, id);
      if (!idV.success) return err(idV.error!);

      const updatesV = validateWithError(MemoryUpdateSchema, updates);
      if (!updatesV.success) return err(updatesV.error!);

      const updated = memoryStore.update(id, updatesV.data!);
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
      if (typeof olderThanDays !== 'number' || olderThanDays < 1 || olderThanDays > 3650) {
        return err('olderThanDays must be a number between 1 and 3650');
      }

      const removed = memoryStore.prune(olderThanDays);
      return ok({ removed, olderThanDays });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Memory handlers registered');
}

/** Expose memoryStore for use in other handlers */
export { memoryStore };
