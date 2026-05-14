import { ipcMain } from 'electron';
import { SessionManager, SessionState } from '../services/session-manager';

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

// ─── Singleton Session Manager ──────────────────────────────────────────────

const sessionManager = new SessionManager();

// Track auto-save state per renderer
const autoSaveSessions: Map<number, string> = new Map();

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerSessionHandlers(): void {
  // ── session:save ───────────────────────────────────────────────────────
  ipcMain.handle('session:save', async (_event, state: SessionState) => {
    try {
      sessionManager.save(state);
      return ok({ sessionId: state.id, saved: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── session:restore ────────────────────────────────────────────────────
  ipcMain.handle('session:restore', async (_event, sessionId: string) => {
    try {
      const state = sessionManager.restore(sessionId);
      if (!state) {
        return err(`Session not found: ${sessionId}`);
      }
      return ok({ session: state });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── session:list ───────────────────────────────────────────────────────
  ipcMain.handle('session:list', async (_event, projectId?: string) => {
    try {
      let sessions = sessionManager.list();
      if (projectId) {
        sessions = sessions.filter((s) => s.projectId === projectId);
      }
      return ok({ sessions, count: sessions.length });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── session:delete ─────────────────────────────────────────────────────
  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    try {
      const deleted = sessionManager.delete(sessionId);
      if (!deleted) {
        return err(`Session not found: ${sessionId}`);
      }
      return ok({ deleted: true, sessionId });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── session:autoSave ───────────────────────────────────────────────────
  ipcMain.handle(
    'session:autoSave',
    async (event, state: SessionState, interval?: number) => {
      try {
        const webContentsId = event.sender.id;
        const sessionId = state.id;

        // Stop previous auto-save for this renderer
        const previousSessionId = autoSaveSessions.get(webContentsId);
        if (previousSessionId) {
          sessionManager.stopAutoSave(previousSessionId);
        }

        // Start new auto-save
        sessionManager.autoSave(state, interval);
        autoSaveSessions.set(webContentsId, sessionId);

        return ok({ sessionId, autoSave: true, interval: interval ?? 30000 });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── session:stopAutoSave ───────────────────────────────────────────────
  ipcMain.handle('session:stopAutoSave', async (event, sessionId: string) => {
    try {
      sessionManager.stopAutoSave(sessionId);
      autoSaveSessions.delete(event.sender.id);
      return ok({ sessionId, autoSave: false });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── session:getLatest ──────────────────────────────────────────────────
  ipcMain.handle('session:getLatest', async (_event, projectId: string) => {
    try {
      const state = sessionManager.getLatest(projectId);
      if (!state) {
        return ok({ session: null });
      }
      return ok({ session: state });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── session:create ─────────────────────────────────────────────────────
  ipcMain.handle('session:create', async (_event, projectId: string) => {
    try {
      const state = sessionManager.create(projectId);
      return ok({ session: state });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] Session handlers registered');
}

/** Expose sessionManager for use in other handlers */
export { sessionManager };
