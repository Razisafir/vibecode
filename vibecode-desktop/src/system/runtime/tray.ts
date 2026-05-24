// ============================================================
// VibeCode Desktop — System Tray
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Sets up the system tray icon with context menu.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { Tray, Menu, nativeImage } from 'electron';
import { getMainWindow, setTrayIcon, getTrayIcon, setIsQuitting } from '../kernel/state';
import { getTrayIconPath, getAppMetadata } from '../../main/services/branding';
import { logger } from '../../main/utils/logger';

// ─── Quit Handler Callback ──────────────────────────────────────────────────

/**
 * Callback registered by lifecycle module to handle quit requests
 * from the tray menu. This avoids a circular dependency between
 * tray.ts and lifecycle.ts.
 */
let _quitHandler: (() => void) | null = null;

/**
 * Register a quit handler callback. Called by lifecycle.ts during boot.
 */
export function setTrayQuitHandler(handler: () => void): void {
  _quitHandler = handler;
}

// ─── Tray Setup ─────────────────────────────────────────────────────────────

/**
 * Sets up the system tray icon with context menu.
 * Only creates the tray if a valid icon asset is found.
 * This function is ready to be called — it will silently skip
 * if no tray icon asset is available yet.
 */
export function setupTray(): void {
  const trayIconPath = getTrayIconPath();
  if (!trayIconPath) {
    logger.info('general', 'No tray icon available — skipping tray setup');
    return;
  }

  try {
    const icon = nativeImage.createFromPath(trayIconPath);
    if (icon.isEmpty()) {
      logger.warn('general', 'Tray icon image is empty — skipping tray setup');
      return;
    }

    const metadata = getAppMetadata();

    const tray = new Tray(icon.resize({ width: 16, height: 16 }));
    setTrayIcon(tray);
    tray.setToolTip(metadata.name);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Show ${metadata.name}`,
        click: () => {
          const win = getMainWindow();
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          setIsQuitting(true);
          if (_quitHandler) {
            _quitHandler();
          }
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    // On Windows/Linux, clicking the tray shows the window
    tray.on('click', () => {
      const win = getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });

    logger.info('general', 'System tray icon created successfully');
  } catch (err) {
    logger.error('general', 'Failed to create tray icon', { error: String(err) });
    setTrayIcon(null);
  }
}

/**
 * Destroy the system tray icon (called during cleanup).
 */
export function destroyTray(): void {
  const tray = getTrayIcon();
  if (tray) {
    tray.destroy();
    setTrayIcon(null);
  }
}
