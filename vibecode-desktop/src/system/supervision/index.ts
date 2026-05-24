// ─── Supervision Module Barrel Export ─────────────────────────────────────
// Re-exports all public APIs from the supervision modules.
// Created during Phase 2 refactoring.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Crash Dump ─────────────────────────────────────────────────────────────
export {
  initializeCrashDump,
  generateCrashDump,
  hasCrashDumps,
  listCrashDumps,
  clearCrashDumps,
  getCrashDumpsDir,
  CrashDump,
} from './crash-dump';

// ─── Session Recovery ───────────────────────────────────────────────────────
export {
  wasCrashed,
  markCrash,
  markSafeShutdown,
  getRecoverySession,
  getRecoveryInfo,
  archiveCrashedSession,
  SessionState,
  EnhancedSessionState,
  CrashInfo,
  RecoveryInfo,
} from './session-recovery';

// ─── Crash Recovery ─────────────────────────────────────────────────────────
export {
  registerCrashHandlers,
  setRecreateWindowCallback,
} from './crash-recovery';

// ─── Watchdog ───────────────────────────────────────────────────────────────
export {
  startWatchdog,
  stopWatchdog,
  forceWatchdogRecovery,
  onWatchdogEvent,
  offWatchdogEvent,
  getWatchdogState,
  WatchdogEvent,
  WatchdogState,
} from './watchdog';

// ─── Auto Updater ───────────────────────────────────────────────────────────
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
} from './auto-updater';
