// ============================================================
// VibeCode Desktop — Window Creation & Management
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Creates the main BrowserWindow with core event handlers.
//
// Phase 2: Crash recovery handlers extracted to
// src/system/supervision/crash-recovery.ts.
// lifecycle.ts calls registerCrashHandlers() after createWindow().
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { BrowserWindow, shell } from 'electron';
import * as path from 'path';
import { getMainWindow, setMainWindow, getIsDev } from '../kernel/state';

const VITE_DEV_SERVER_URL = 'http://localhost:5173';

/**
 * Create the main BrowserWindow with core event handlers.
 * Handles: ready-to-show, closed, external links.
 *
 * Crash recovery handlers (render-process-gone, unresponsive/responsive,
 * GPU crash) are registered separately by registerCrashHandlers() in
 * src/system/supervision/crash-recovery.ts — called from lifecycle.ts
 * after this function returns.
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
