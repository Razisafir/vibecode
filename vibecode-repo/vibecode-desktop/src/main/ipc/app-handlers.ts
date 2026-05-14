import { ipcMain, app, BrowserWindow } from 'electron';

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

// ─── Quit Flag ──────────────────────────────────────────────────────────────

// This flag is shared with main.ts to coordinate safe quitting
// The main process sets `isQuitting = true` before calling `app.quit()`
export let isQuitting = false;

export function setQuitting(value: boolean): void {
  isQuitting = value;
}

// ─── Handler Registration ───────────────────────────────────────────────────

export function registerAppHandlers(): void {
  // ── app:getVersion ─────────────────────────────────────────────────────
  ipcMain.handle('app:getVersion', async () => {
    try {
      return ok({
        version: app.getVersion(),
        name: app.getName(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── app:quit ───────────────────────────────────────────────────────────
  // Supports both ipcRenderer.invoke() and ipcRenderer.send()
  ipcMain.handle('app:quit', async () => {
    setQuitting(true);
    app.quit();
    return ok({ quitting: true });
  });

  ipcMain.on('app:quit', () => {
    setQuitting(true);
    app.quit();
  });

  // ── app:minimize ───────────────────────────────────────────────────────
  ipcMain.handle('app:minimize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return err('No window found');
    win.minimize();
    return ok({ minimized: true });
  });

  ipcMain.on('app:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  // ── app:maximize ───────────────────────────────────────────────────────
  ipcMain.handle('app:maximize', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return err('No window found');
    if (win.isMaximized()) {
      win.unmaximize();
      return ok({ maximized: false, restored: true });
    } else {
      win.maximize();
      return ok({ maximized: true });
    }
  });

  ipcMain.on('app:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  // ── app:close ──────────────────────────────────────────────────────────
  ipcMain.handle('app:close', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return err('No window found');
    win.close();
    return ok({ closed: true });
  });

  ipcMain.on('app:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  // ── app:openDevTools ───────────────────────────────────────────────────
  ipcMain.handle('app:openDevTools', async (event) => {
    try {
      // Only allow in development mode
      if (app.isPackaged) {
        return err('DevTools can only be opened in development mode');
      }

      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) {
        return err('No window found');
      }
      win.webContents.openDevTools();
      return ok({ devTools: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── app:getWindowBounds ────────────────────────────────────────────────
  ipcMain.handle('app:getWindowBounds', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) {
        return err('No window found');
      }
      const bounds = win.getBounds();
      return ok({
        bounds,
        isMaximized: win.isMaximized(),
        isMinimized: win.isMinimized(),
        isFullScreen: win.isFullScreen(),
      });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── app:setWindowBounds ────────────────────────────────────────────────
  ipcMain.handle(
    'app:setWindowBounds',
    async (event, bounds: { x?: number; y?: number; width?: number; height?: number }) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
          return err('No window found');
        }
        win.setBounds(bounds);
        return ok({ bounds: win.getBounds() });
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error));
      }
    }
  );

  // ── app:isDev ──────────────────────────────────────────────────────────
  ipcMain.handle('app:isDev', async () => {
    return ok({ isDev: !app.isPackaged });
  });

  // ── app:getPath ────────────────────────────────────────────────────────
  ipcMain.handle('app:getPath', async (_event, name: string) => {
    try {
      const validNames = ['home', 'appData', 'userData', 'cache', 'temp', 'documents', 'downloads', 'desktop'];
      if (!validNames.includes(name)) {
        return err(`Invalid path name: ${name}. Valid names: ${validNames.join(', ')}`);
      }
      const filePath = app.getPath(name as any);
      return ok({ name, path: filePath });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  console.log('[IPC] App handlers registered');
}
