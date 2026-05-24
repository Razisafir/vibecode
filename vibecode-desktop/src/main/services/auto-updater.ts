// Phase 2 shim — delegates to src/system/supervision/auto-updater; remove in Phase 4

import { BrowserWindow } from 'electron';
import {
  initializeAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  quitAndInstall,
  setUpdateChannel,
  getUpdateStatus,
  startPeriodicChecks,
  stopPeriodicChecks,
  onUpdateStatusChange,
  UpdateChannel,
  UpdateStatus,
  UpdateProgress,
} from '../../system/supervision/auto-updater';

export {
  initializeAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  quitAndInstall,
  setUpdateChannel,
  getUpdateStatus,
  startPeriodicChecks,
  stopPeriodicChecks,
  onUpdateStatusChange,
  UpdateChannel,
  UpdateStatus,
  UpdateProgress,
};

// ─── Backward-compatible singleton-like API ─────────────────────────────────
// Old code accesses autoUpdateService.initialize(), etc.
// This shim provides the same interface via an object with the same method names.
// NOTE: registerIpcHandlers() is NOT included — IPC is handled by updater-handlers.ts.

export const autoUpdateService = {
  initialize: initializeAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  quitAndInstall,
  setChannel: setUpdateChannel,
  getStatus: getUpdateStatus,
  startPeriodicChecks,
  stopPeriodicChecks,
  onStatusChange: onUpdateStatusChange,
  // registerIpcHandlers intentionally NOT included — IPC is in updater-handlers.ts
};
