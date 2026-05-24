// ============================================================
// VibeCode Desktop — Window Creation & Management
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Creates the main BrowserWindow with all event handlers
// including crash recovery logic.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { BrowserWindow, shell, app } from 'electron';
import * as path from 'path';
import { getMainWindow, setMainWindow, getIsDev } from '../kernel/state';
import { crashDumpService } from '../../main/services/crash-dump';
import { sessionManager } from '../../main/ipc/session-handlers';
import { logger } from '../../main/utils/logger';

const VITE_DEV_SERVER_URL = 'http://localhost:5173';

/**
 * Create the main BrowserWindow with all event handlers.
 * Handles: ready-to-show, closed, external links,
 * render-process-gone (crash recovery), unresponsive/responsive,
 * and GPU process crash.
 */
export function createWindow(): void {
  const win = new BrowserWindow({
    title: 'VibeCode',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    frame: false, // Custom titlebar
    backgroundColor: '#0a0a0f', // Deep dark
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  });

  setMainWindow(win);

  // ─── Load Content ─────────────────────────────────────────────────────

  const isDev = getIsDev();

  if (isDev) {
    win.loadURL(VITE_DEV_SERVER_URL);

    // Open DevTools in dev mode
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from built files
    const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
    win.loadFile(indexPath);
  }

  // ─── Window Events ────────────────────────────────────────────────────

  // Show window when content is ready (prevents flash of white/background)
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Clean up reference on close
  win.on('closed', () => {
    setMainWindow(null);
  });

  // Handle external links — open in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ─── Crash Recovery ───────────────────────────────────────────────────

  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('general', 'Render process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });

    // Generate crash dump
    const error = new Error(`render-process-gone: ${details.reason || 'unknown'}`);
    crashDumpService.generateCrashDump(error, {
      source: 'render-process-gone',
      reason: details.reason,
      exitCode: details.exitCode,
    }).catch(() => {
      // Best-effort crash dump
    });

    // Mark the session as crashed
    try {
      sessionManager.markCrash(`render-process-gone: ${details.reason}`);
    } catch (err) {
      logger.error('general', 'Failed to mark crash', { error: String(err) });
    }

    if (details.reason === 'crashed' || details.reason === 'oom') {
      // Attempt recovery by reloading
      const recoveryDelay = 2000;
      logger.info('general', `Attempting crash recovery in ${recoveryDelay}ms...`);

      setTimeout(() => {
        const currentWin = getMainWindow();
        if (currentWin && !currentWin.isDestroyed()) {
          try {
            currentWin.reload();
            logger.info('general', 'Crash recovery: window reloaded');
          } catch (err) {
            logger.error('general', 'Crash recovery failed', { error: String(err) });
            // Last resort: recreate window
            createWindow();
          }
        } else {
          // Window was destroyed, recreate
          createWindow();
        }
      }, recoveryDelay);
    }
  });

  // Handle unresponsive renderer
  win.on('unresponsive', () => {
    logger.warn('general', 'Renderer is unresponsive');
  });

  win.on('responsive', () => {
    logger.info('general', 'Renderer is responsive again');
  });

  // Handle GPU process crash (Electron 33+ uses 'child-process-gone' instead)
  try {
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU' && details.reason !== 'killed') {
        logger.error('general', 'GPU process crashed', { reason: details.reason });
        try {
          sessionManager.markCrash(`gpu-process-crashed: ${details.reason}`);
        } catch {
          // Best-effort
        }
      }
    });
  } catch {
    // Older Electron versions may not support this event
  }
}

/**
 * Destroy the main window if it exists (for cleanup).
 */
export function destroyWindow(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
  setMainWindow(null);
}
