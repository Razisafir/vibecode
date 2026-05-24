// ============================================================
// VibeCode Desktop — Application Lifecycle
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Manages the entire app lifecycle: single instance lock,
// initialization sequence, app event handlers, and cleanup.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { app, BrowserWindow, dialog } from 'electron';
import { setIsSafeMode, getIsSafeMode, getMainWindow, getIsDev, setIsQuitting, setIsDev, setAppStartTime, setLogger } from '../kernel/state';
import { setupContentSecurityPolicy } from './csp';
import { detectSafeMode, applySafeModeRestrictions, showSafeModeDialog } from './safe-mode';
import { createWindow, destroyWindow } from './window';
import { registerCrashHandlers, setRecreateWindowCallback } from '../supervision/crash-recovery';
import { setupTray, destroyTray, setTrayQuitHandler } from './tray';
import { setupMenu, setMenuQuitHandler } from './menu';
import { registerAllIpcHandlers } from '../../main/ipc/index';
import { setQuitting, isQuitting } from '../../main/ipc/app-handlers';
import { memoryStore } from '../../main/ipc/memory-handlers';
import { sessionManager } from '../../main/ipc/session-handlers';
import { telemetry } from '../../main/services/telemetry';
import { watchdog } from '../../main/services/watchdog';
import { crashDumpService } from '../../main/services/crash-dump';
import { autoUpdateService } from '../../main/services/auto-updater';
import { analyticsService } from '../../main/services/analytics';
import { startHealthServer, stopHealthServer } from '../../main/services/health-server';
import { logger } from '../../main/utils/logger';
import { auditLog } from '../../main/utils/audit-log';

// ─── Cleanup & Quit ─────────────────────────────────────────────────────────

/**
 * Perform cleanup and quit the application.
 * Stops all services, flushes state, destroys window, and calls app.quit().
 * Must be safe to call multiple times (idempotent).
 */
export function cleanupAndQuit(): void {
  logger.info('general', 'Performing cleanup before quit...');

  // Stop auto-updater
  try {
    autoUpdateService.stopPeriodicChecks();
    logger.info('general', 'Auto-updater stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop auto-updater', { error: String(err) });
  }

  // Stop analytics
  try {
    analyticsService.stopSession();
    logger.info('general', 'Analytics stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop analytics', { error: String(err) });
  }

  // Stop telemetry monitoring
  try {
    telemetry.stopMonitoring();
    logger.info('general', 'Telemetry monitoring stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop telemetry', { error: String(err) });
  }

  // Stop watchdog
  try {
    watchdog.stopWatching();
    logger.info('general', 'Watchdog stopped');
  } catch (err) {
    logger.error('general', 'Failed to stop watchdog', { error: String(err) });
  }

  // Mark safe shutdown FIRST
  try {
    sessionManager.markSafeShutdown();
    logger.info('general', 'Marked safe shutdown');
  } catch (err) {
    logger.error('general', 'Failed to mark safe shutdown', { error: String(err) });
  }

  // Stop health server if running
  stopHealthServer();

  // Flush memory store to disk
  try {
    memoryStore.flush();
    logger.info('general', 'Memory store flushed');
  } catch (err) {
    logger.error('general', 'Failed to flush memory store', { error: String(err) });
  }

  // Dispose session manager (stop auto-save timers, flush current state)
  try {
    sessionManager.dispose();
    logger.info('general', 'Session manager disposed');
  } catch (err) {
    logger.error('general', 'Failed to dispose session manager', { error: String(err) });
  }

  // Flush logger
  try {
    logger.flush();
  } catch {
    // Best-effort
  }

  // Flush audit log
  try {
    auditLog.forceFlush();
  } catch {
    // Best-effort
  }

  // Destroy tray icon
  destroyTray();

  // Destroy window if it exists
  destroyWindow();

  app.quit();
}

// ─── Boot ───────────────────────────────────────────────────────────────────

/**
 * Initialize the application lifecycle.
 * Registers all app event handlers: ready, window-all-closed,
 * activate, before-quit. Orchestrates service initialization.
 *
 * This is called from the thin main.ts boot file.
 */
export function boot(): void {
  // Initialize shared state
  const isDev = !app.isPackaged || !!process.env.VIBECODE_DEV;
  setIsDev(isDev);
  setAppStartTime(Date.now());
  setLogger(logger);

  // Ensure single instance
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
    return;
  }

  // Second instance: focus the existing window
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // ─── App Lifecycle ──────────────────────────────────────────────────────

  app.on('ready', () => {
    // Detect safe mode before anything else
    setIsSafeMode(detectSafeMode());

    // Initialize crash dump service (register global error handlers)
    crashDumpService.initialize();

    // Initialize telemetry monitoring
    telemetry.startMonitoring();

    // Initialize analytics service (only starts tracking if user has opted in)
    if (analyticsService.getConfig().enabled) {
      analyticsService.startSession();
    }

    // Check for crashed sessions BEFORE creating the window
    const crashed = sessionManager.wasCrashed();
    if (crashed) {
      logger.info('session', 'Previous session crashed — recovery will be offered');
    }

    // Apply safe mode restrictions if needed
    if (getIsSafeMode()) {
      applySafeModeRestrictions();
    }

    // ── Content Security Policy ─────────────────────────────────────────────
    setupContentSecurityPolicy();

    createWindow();

    // Register crash recovery handlers on the new window
    // (extracted from window.ts in Phase 2 — avoids circular dependency)
    const crashWin = getMainWindow();
    if (crashWin) {
      setRecreateWindowCallback(() => {
        destroyWindow();
        createWindow();
      });
      registerCrashHandlers(crashWin);
    }

    registerAllIpcHandlers();
    setupMenu();
    setupTray();

    // Register quit handler for tray (avoids circular dependency)
    setTrayQuitHandler(() => {
      cleanupAndQuit();
    });

    // Register quit handler for menu (avoids circular dependency)
    setMenuQuitHandler(() => {
      cleanupAndQuit();
    });

    // Initialize auto-updater after window is created
    const win = getMainWindow();
    if (win) {
      autoUpdateService.initialize(win);
      // Start periodic update checks (every 4 hours) in production
      if (!getIsDev()) {
        autoUpdateService.startPeriodicChecks();
      }
    }

    // Start watchdog monitoring after window is created
    if (win) {
      watchdog.startWatching();

      watchdog.on('watchdog:unresponsive', (data) => {
        logger.warn('watchdog', 'Renderer unresponsive detected', data);
      });

      watchdog.on('watchdog:recovered', (data) => {
        logger.info('watchdog', 'Renderer recovered', data);
      });

      watchdog.on('watchdog:failed', (data) => {
        logger.error('watchdog', 'Watchdog recovery failed — recreating window', data);
        // Last resort: destroy and recreate window
        destroyWindow();
        createWindow();
      });
    }

    // Start health server (NO-OP unless VIBECODE_HEALTH_PORT is set)
    startHealthServer();

    if (getIsDev()) {
      logger.info('general', 'Running in development mode');
    }

    // Show safe mode dialog if crash dumps exist
    if (getIsSafeMode() && getMainWindow()) {
      showSafeModeDialog();
    }
  });

  app.on('window-all-closed', () => {
    // On macOS, apps typically stay active until the user explicitly quits
    if (process.platform !== 'darwin') {
      setQuitting(true);
      setIsQuitting(true);
      app.quit();
    }
  });

  app.on('activate', () => {
    // On macOS, re-create a window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      const win = getMainWindow();
      if (win) {
        win.show();
      }
    }
  });

  // ─── Death Bug Prevention ─────────────────────────────────────────────
  // Prevent accidental quits — only allow quit when the isQuitting flag is set
  app.on('before-quit', (event) => {
    if (!isQuitting) {
      event.preventDefault();

      // Ask the user to confirm
      const choice = dialog.showMessageBoxSync(getMainWindow()!, {
        type: 'question',
        title: 'Quit VibeCode?',
        message: 'Are you sure you want to quit VibeCode?',
        detail: 'Unsaved changes will be preserved in your session.',
        buttons: ['Cancel', 'Quit'],
        defaultId: 0,
        cancelId: 0,
      });

      if (choice === 1) {
        // User confirmed quit
        setQuitting(true);
        setIsQuitting(true);
        cleanupAndQuit();
      }
    } else {
      // Mark safe shutdown before quitting
      try {
        sessionManager.markSafeShutdown();
        logger.info('general', 'Marked safe shutdown');
      } catch (err) {
        logger.error('general', 'Failed to mark safe shutdown', { error: String(err) });
      }
    }
  });
}
