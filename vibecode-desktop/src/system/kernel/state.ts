// ============================================================
// VibeCode Desktop — Shared State Module
// ============================================================
//
// Centralized state holder for shared mutable state that is
// currently scattered across main.ts closure variables and
// mutable exports in app-handlers.ts.
//
// CIRCULAR DEPENDENCY GUARANTEE:
//   This module imports ONLY:
//     - Electron's BrowserWindow type (type-only import)
//     - Basic TypeScript types
//     - The KernelLogger interface from ./types.ts
//
//   It NEVER imports from:
//     - Any service file (services/*)
//     - Any IPC handler file (ipc/*)
//     - The logger implementation (utils/logger)
//     - kernel-fs or any file that depends on kernel-fs
//
//   This ensures it sits at the BOTTOM of the dependency graph
//   and can be safely imported by any module without cycles.
//
// This is a VS Code fork competing with Cursor — not "an Electron app."
// ============================================================

import type { BrowserWindow } from 'electron';
import type { KernelLogger } from './types';

// ─── Internal State ────────────────────────────────────────────────────────

/**
 * Internal state container. Not exported — access is through
 * typed getter/setter functions which log state transitions.
 */
const state = {
  mainWindow: null as BrowserWindow | null,
  isQuitting: false,
  isSafeMode: false,
  isDev: false,
  trayIcon: null as Electron.Tray | null,
  appStartTime: Date.now(),
};

// ─── Logger ────────────────────────────────────────────────────────────────

/**
 * Logger instance for state transition logging.
 *
 * Initially set to a no-op logger. The SystemKernel replaces this
 * with the real logger during initialization. This avoids importing
 * the logger module directly (which would create circular deps
 * through kernel-fs).
 *
 * IMPORTANT: Call setLogger() before any state mutation if you
 * want transition logging. The no-op default ensures nothing
 * crashes if state is accessed before the kernel is ready.
 */
let _logger: KernelLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Replace the no-op logger with a real implementation.
 * Called once by the SystemKernel during initialization.
 */
export function setLogger(logger: KernelLogger): void {
  _logger = logger;
  _logger.info('state', 'State module logger initialized');
}

// ─── Main Window ───────────────────────────────────────────────────────────

/**
 * Get the current main BrowserWindow reference.
 *
 * Returns null if:
 *   - The window has not been created yet
 *   - The window was destroyed (e.g., during crash recovery)
 *   - The window reference was explicitly cleared
 *
 * This replaces the `mainWindow` closure variable in main.ts
 * that is referenced by 8+ functions.
 */
export function getMainWindow(): BrowserWindow | null {
  return state.mainWindow;
}

/**
 * Set the main BrowserWindow reference.
 *
 * Logs the state transition for observability. Setting to null
 * is valid (e.g., during window recreation in crash recovery).
 *
 * This replaces both the direct assignment `mainWindow = new BrowserWindow(...)`
 * and the nullification `mainWindow = null` in main.ts.
 */
export function setMainWindow(win: BrowserWindow | null): void {
  const prev = state.mainWindow;
  state.mainWindow = win;

  if (prev === null && win !== null) {
    _logger.info('state', 'Main window created');
  } else if (prev !== null && win === null) {
    _logger.info('state', 'Main window reference cleared');
  } else if (prev !== null && win !== null && prev !== win) {
    _logger.info('state', 'Main window reference replaced (crash recovery?)');
  }
}

/**
 * Check whether the main window exists and is not destroyed.
 *
 * This is a convenience function that combines the common pattern:
 *   if (mainWindow && !mainWindow.isDestroyed())
 *
 * Used extensively in crash recovery, tray/menu handlers, and
 * the watchdog system.
 */
export function isMainWindowValid(): boolean {
  return state.mainWindow !== null && !state.mainWindow.isDestroyed();
}

// ─── Is Quitting ───────────────────────────────────────────────────────────

/**
 * Whether the app is in the quit sequence.
 *
 * This replaces the mutable `isQuitting` export in
 * src/main/ipc/app-handlers.ts, which is currently shared
 * between main.ts and IPC handlers via import.
 *
 * The quit flag coordinates the "death bug prevention" logic:
 *   - app.on('before-quit') checks this flag
 *   - If false, it shows a confirmation dialog
 *   - If true, it proceeds with cleanup and quit
 *   - Set to true by: tray Quit, menu Quit, IPC app:quit,
 *     window-all-closed, and the confirmation dialog
 */
export function getIsQuitting(): boolean {
  return state.isQuitting;
}

/**
 * Set the isQuitting flag.
 *
 * Logs the state transition. Once set to true, this flag
 * should NEVER be reset to false within the same session
 * (the app is shutting down).
 */
export function setIsQuitting(value: boolean): void {
  const prev = state.isQuitting;
  state.isQuitting = value;

  if (!prev && value) {
    _logger.info('state', 'Quit sequence initiated');
  }
}

// ─── Is Safe Mode ──────────────────────────────────────────────────────────

/**
 * Whether the app is running in safe mode.
 *
 * Safe mode is activated when:
 *   - The --safe-mode CLI flag is passed
 *   - Crash dumps are detected from a previous session
 *
 * In safe mode:
 *   - Streaming is disabled (VIBECODE_NO_STREAMING=true)
 *   - Memory is limited (VIBECODE_MAX_MEMORY_MB=256)
 *   - Auto-save is disabled (VIBECODE_NO_AUTO_SAVE=true)
 *
 * This replaces the `isSafeMode` closure variable in main.ts.
 */
export function getIsSafeMode(): boolean {
  return state.isSafeMode;
}

/**
 * Set the safe mode flag.
 *
 * Called during app initialization after detecting safe mode
 * conditions. May also be cleared by the user via the
 * "Clear Crash Data & Restart Normally" dialog.
 */
export function setIsSafeMode(value: boolean): void {
  const prev = state.isSafeMode;
  state.isSafeMode = value;

  if (!prev && value) {
    _logger.info('state', 'Safe mode activated');
  } else if (prev && !value) {
    _logger.info('state', 'Safe mode deactivated');
  }
}

// ─── Is Dev ────────────────────────────────────────────────────────────────

/**
 * Whether the app is running in development mode.
 *
 * Computed once during initialization from:
 *   !app.isPackaged || !!process.env.VIBECODE_DEV
 *
 * This replaces the IS_DEV constant in main.ts. Unlike the
 * other state fields, this is set once and never changed.
 */
export function getIsDev(): boolean {
  return state.isDev;
}

/**
 * Set the isDev flag. Called once during kernel initialization.
 *
 * Should be called before any other state is accessed because
 * many modules check isDev to determine behavior (CSP policy,
 * DevTools access, update checks, etc.).
 */
export function setIsDev(value: boolean): void {
  state.isDev = value;
  _logger.info('state', `Development mode: ${value}`);
}

// ─── Tray Reference ────────────────────────────────────────────────────────

/**
 * Get the system tray reference.
 *
 * Returns null if:
 *   - No tray icon asset is available
 *   - The tray failed to initialize
 *   - The tray was destroyed during shutdown
 */
export function getTrayIcon(): Electron.Tray | null {
  return state.trayIcon;
}

/**
 * Set the system tray reference.
 *
 * Logs the state transition. The tray is created during
 * setupTray() and destroyed during cleanupAndQuit().
 */
export function setTrayIcon(tray: Electron.Tray | null): void {
  const prev = state.trayIcon;
  state.trayIcon = tray;

  if (prev === null && tray !== null) {
    _logger.info('state', 'System tray created');
  } else if (prev !== null && tray === null) {
    _logger.info('state', 'System tray destroyed');
  }
}

// ─── App Start Time ────────────────────────────────────────────────────────

/**
 * Get the timestamp when the app started (epoch ms).
 *
 * Used to compute uptime for health checks and diagnostics.
 * Set once during kernel initialization.
 */
export function getAppStartTime(): number {
  return state.appStartTime;
}

/**
 * Set the app start time. Called once during kernel initialization.
 */
export function setAppStartTime(time: number): void {
  state.appStartTime = time;
}

// ─── Convenience: Full State Snapshot ──────────────────────────────────────

/**
 * Get a read-only snapshot of all shared state.
 *
 * Used by the health server, status provider, and kernel
 * diagnostics. The returned object is a copy — mutations
 * to it do not affect the actual state.
 */
export interface StateSnapshot {
  hasMainWindow: boolean;
  isQuitting: boolean;
  isSafeMode: boolean;
  isDev: boolean;
  hasTrayIcon: boolean;
  appStartTime: number;
  uptimeSeconds: number;
}

/**
 * Returns a point-in-time snapshot of all shared state.
 */
export function getStateSnapshot(): StateSnapshot {
  return {
    hasMainWindow: isMainWindowValid(),
    isQuitting: state.isQuitting,
    isSafeMode: state.isSafeMode,
    isDev: state.isDev,
    hasTrayIcon: state.trayIcon !== null,
    appStartTime: state.appStartTime,
    uptimeSeconds: Math.floor((Date.now() - state.appStartTime) / 1000),
  };
}

// ─── Reset (Testing Only) ──────────────────────────────────────────────────

/**
 * Reset all state to initial values.
 *
 * INTENDED FOR TESTING ONLY. Do NOT call this in production code.
 * Used by test teardown to ensure clean state between test runs.
 */
export function resetStateForTesting(): void {
  state.mainWindow = null;
  state.isQuitting = false;
  state.isSafeMode = false;
  state.isDev = false;
  state.trayIcon = null;
  state.appStartTime = Date.now();
  _logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
