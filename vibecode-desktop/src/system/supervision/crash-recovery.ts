// ─── Crash Recovery ───────────────────────────────────────────────────────
// Handles render-process-gone, unresponsive/responsive events,
// and GPU process crash handlers.
//
// Extracted from src/system/runtime/window.ts during Phase 2 refactoring.
//
// CRITICAL: window.ts does NOT import this module (avoids circular dependency).
// Instead, lifecycle.ts calls registerCrashHandlers() after createWindow().
//
// Dependencies: crash-dump.ts (generateCrashDump), session-recovery.ts (markCrash)
// ─────────────────────────────────────────────────────────────────────────────

import { BrowserWindow, app } from 'electron';
import { getMainWindow } from '../kernel/state';
import { generateCrashDump } from './crash-dump';
import { markCrash } from './session-recovery';
import { logger } from '../../main/utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Callback to recreate the main window (provided by lifecycle.ts to avoid
 * circular dependency between window.ts and crash-recovery.ts).
 */
let _recreateWindowCallback: (() => void) | null = null;

/**
 * Set the window recreation callback.
 * Called by lifecycle.ts during initialization.
 * This avoids crash-recovery.ts importing from window.ts (circular dep).
 */
export function setRecreateWindowCallback(callback: () => void): void {
  _recreateWindowCallback = callback;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Register crash recovery handlers on the main BrowserWindow.
 *
 * Handles:
 *   - render-process-gone: generates crash dump, marks session, attempts reload/recreate
 *   - unresponsive: logs warning
 *   - responsive: logs recovery
 *   - GPU process crash: marks session
 *
 * Must be called AFTER createWindow() from lifecycle.ts.
 * window.ts does NOT import this module (avoids circular dependency).
 */
export function registerCrashHandlers(window: BrowserWindow): void {
  // ─── Render Process Gone ──────────────────────────────────────────────

  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error('general', 'Render process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });

    // Generate crash dump
    const error = new Error(`render-process-gone: ${details.reason || 'unknown'}`);
    generateCrashDump(error, {
      source: 'render-process-gone',
      reason: details.reason,
      exitCode: details.exitCode,
    }).catch(() => {
      // Best-effort crash dump
    });

    // Mark the session as crashed
    try {
      markCrash(`render-process-gone: ${details.reason}`);
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
            if (_recreateWindowCallback) {
              _recreateWindowCallback();
            }
          }
        } else {
          // Window was destroyed, recreate
          if (_recreateWindowCallback) {
            _recreateWindowCallback();
          }
        }
      }, recoveryDelay);
    }
  });

  // ─── Unresponsive / Responsive ────────────────────────────────────────

  window.on('unresponsive', () => {
    logger.warn('general', 'Renderer is unresponsive');
  });

  window.on('responsive', () => {
    logger.info('general', 'Renderer is responsive again');
  });

  // ─── GPU Process Crash ────────────────────────────────────────────────
  // Electron 33+ uses 'child-process-gone' instead of 'gpu-process-crashed'

  try {
    app.on('child-process-gone', (_event, details) => {
      if (details.type === 'GPU' && details.reason !== 'killed') {
        logger.error('general', 'GPU process crashed', { reason: details.reason });
        try {
          markCrash(`gpu-process-crashed: ${details.reason}`);
        } catch {
          // Best-effort
        }
      }
    });
  } catch {
    // Older Electron versions may not support this event
  }
}
