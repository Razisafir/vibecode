// ============================================================
// VibeCode Desktop — Safe Mode Detection & Restrictions
// ============================================================
//
// Extracted from main.ts during Phase 1 refactoring.
// Handles safe mode detection, restriction application,
// and the user-facing safe mode dialog.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import { app, dialog } from 'electron';
import { getMainWindow, setIsSafeMode, getIsSafeMode } from '../kernel/state';
import { crashDumpService } from '../../main/services/crash-dump';
import { logger } from '../../main/utils/logger';

/** Check if the app should start in safe mode */
export function detectSafeMode(): boolean {
  // Check for --safe-mode command line flag
  if (process.argv.includes('--safe-mode')) {
    logger.info('general', 'Safe mode requested via --safe-mode flag');
    return true;
  }

  // Check for existing crash dumps
  if (crashDumpService.hasCrashDumps()) {
    logger.warn('general', 'Crash dumps detected — safe mode recommended');
    return true;
  }

  return false;
}

/** Apply safe mode restrictions */
export function applySafeModeRestrictions(): void {
  logger.info('general', 'Applying safe mode restrictions');

  // Disable streaming by default (set environment variable for providers to check)
  process.env.VIBECODE_SAFE_MODE = 'true';
  process.env.VIBECODE_NO_STREAMING = 'true';

  // Reduce memory limits
  process.env.VIBECODE_MAX_MEMORY_MB = '256';

  // Disable auto-save
  process.env.VIBECODE_NO_AUTO_SAVE = 'true';

  logger.info('general', 'Safe mode restrictions applied: streaming disabled, memory limited, auto-save disabled');
}

/** Show safe mode dialog with option to clear crash data and restart */
export function showSafeModeDialog(): void {
  const mainWindow = getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const crashDumps = crashDumpService.listCrashDumps();
  const recentCrash = crashDumps[0];

  const message = recentCrash
    ? `VibeCode detected a previous crash:\n\n${recentCrash.error.message}\n\nSafe mode has been enabled with reduced functionality. You can restart normally after this session.`
    : 'VibeCode is starting in safe mode with reduced functionality.';

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Safe Mode',
    message: 'VibeCode — Safe Mode',
    detail: message,
    buttons: ['OK', 'Clear Crash Data & Restart Normally'],
    defaultId: 0,
    cancelId: 0,
  }).then((result) => {
    if (result.response === 1) {
      // Clear crash data and restart normally
      crashDumpService.clearCrashDumps().then(() => {
        setIsSafeMode(false);
        delete process.env.VIBECODE_SAFE_MODE;
        delete process.env.VIBECODE_NO_STREAMING;
        delete process.env.VIBECODE_MAX_MEMORY_MB;
        delete process.env.VIBECODE_NO_AUTO_SAVE;
        // Restart the app
        app.relaunch();
        app.exit(0);
      });
    }
  }).catch(() => {
    // Dialog may fail if window is destroyed
  });
}
