// ─── Watchdog Recovery System ──────────────────────────────────────────────
// Monitors renderer health via heartbeat IPC. If renderer is unresponsive
// for 30+ seconds, attempts recovery (ping → reload → recreate window).
// Emits events: watchdog:unresponsive, watchdog:recovered, watchdog:failed
//
// Extracted from src/main/services/watchdog.ts during Phase 2 refactoring.
// Class → module-level functions + event emitter.
// Uses state.ts getMainWindow() instead of persistent window reference.
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain } from 'electron';
import { telemetry } from '../../main/services/telemetry';
import { logger } from '../../main/utils/logger';
import { getMainWindow } from '../kernel/state';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WatchdogEvent = 'watchdog:unresponsive' | 'watchdog:recovered' | 'watchdog:failed';

export interface WatchdogState {
  isWatching: boolean;
  lastHeartbeat: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  unresponsiveThresholdMs: number;
  checkIntervalMs: number;
  currentPhase: 'healthy' | 'unresponsive' | 'recovering' | 'failed';
}

// ─── Module-level State ────────────────────────────────────────────────────

const emitter = new EventEmitter();
let checkTimer: NodeJS.Timeout | null = null;
let lastHeartbeat: number = Date.now();
let recoveryAttempts: number = 0;
let isWatching: boolean = false;
let currentPhase: WatchdogState['currentPhase'] = 'healthy';

const UNSRESPONSIVE_THRESHOLD_MS = 30_000; // 30 seconds
const CHECK_INTERVAL_MS = 10_000; // Check every 10 seconds
const MAX_RECOVERY_ATTEMPTS = 3;

// Recovery escalation levels
const RECOVERY_ACTIONS: Array<(window: BrowserWindow) => boolean> = [
  // Level 1: Send ping via IPC
  (window) => {
    try {
      window.webContents.send('watchdog:ping');
      logger.info('watchdog', 'Sent ping to renderer');
      return true;
    } catch {
      return false;
    }
  },
  // Level 2: Reload the window
  (window) => {
    try {
      logger.warn('watchdog', 'Reloading renderer window');
      window.reload();
      return true;
    } catch {
      return false;
    }
  },
  // Level 3: Recreate the window (handled externally via event)
  (_window) => {
    logger.error('watchdog', 'Window recreation required — emitting watchdog:failed');
    return false;
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/** Start watching the renderer for heartbeat signals */
export function startWatchdog(): void {
  if (isWatching) return;

  isWatching = true;
  lastHeartbeat = Date.now();
  recoveryAttempts = 0;
  currentPhase = 'healthy';

  // Register heartbeat listener
  ipcMain.on('telemetry:sendHeartbeat', (_event, data?: { fps?: number }) => {
    lastHeartbeat = Date.now();
    if (data?.fps !== undefined) {
      telemetry.recordRendererHeartbeat(data.fps);
    }

    // If we were unresponsive, we've now recovered
    if (currentPhase === 'unresponsive' || currentPhase === 'recovering') {
      currentPhase = 'healthy';
      recoveryAttempts = 0;
      emitter.emit('watchdog:recovered', { timestamp: Date.now() });
      logger.info('watchdog', 'Renderer recovered');
    }
  });

  // Start periodic health check
  checkTimer = setInterval(() => {
    performHealthCheck();
  }, CHECK_INTERVAL_MS);

  // Don't prevent process exit
  if (checkTimer.unref) {
    checkTimer.unref();
  }

  logger.info('watchdog', 'Watchdog monitoring started');
}

/** Stop watching */
export function stopWatchdog(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
  isWatching = false;
  currentPhase = 'healthy';

  logger.info('watchdog', 'Watchdog monitoring stopped');
}

/** Force a recovery attempt on the main window */
export function forceWatchdogRecovery(window: BrowserWindow): void {
  attemptRecovery(window);
}

/** Subscribe to watchdog events */
export function onWatchdogEvent(event: WatchdogEvent, handler: (...args: any[]) => void): void {
  emitter.on(event, handler);
}

/** Unsubscribe from watchdog events */
export function offWatchdogEvent(event: WatchdogEvent, handler: (...args: any[]) => void): void {
  emitter.off(event, handler);
}

/** Get current watchdog state */
export function getWatchdogState(): WatchdogState {
  return {
    isWatching,
    lastHeartbeat,
    recoveryAttempts,
    maxRecoveryAttempts: MAX_RECOVERY_ATTEMPTS,
    unresponsiveThresholdMs: UNSRESPONSIVE_THRESHOLD_MS,
    checkIntervalMs: CHECK_INTERVAL_MS,
    currentPhase,
  };
}

// ─── Private ────────────────────────────────────────────────────────────────

function performHealthCheck(): void {
  if (!isWatching) return;

  const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;

  if (timeSinceLastHeartbeat > UNSRESPONSIVE_THRESHOLD_MS) {
    // Renderer appears unresponsive
    if (currentPhase === 'healthy') {
      currentPhase = 'unresponsive';
      emitter.emit('watchdog:unresponsive', {
        timestamp: Date.now(),
        timeSinceLastHeartbeat,
      });
      logger.warn('watchdog', `Renderer unresponsive for ${Math.round(timeSinceLastHeartbeat / 1000)}s`);
    }

    // Attempt recovery
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      attemptRecovery(mainWindow);
    }
  }
}

function attemptRecovery(window: BrowserWindow): void {
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    currentPhase = 'failed';
    emitter.emit('watchdog:failed', {
      timestamp: Date.now(),
      recoveryAttempts,
    });
    logger.error('watchdog', `All ${MAX_RECOVERY_ATTEMPTS} recovery attempts failed`);
    return;
  }

  currentPhase = 'recovering';
  const actionIndex = Math.min(recoveryAttempts, RECOVERY_ACTIONS.length - 1);
  const action = RECOVERY_ACTIONS[actionIndex];

  logger.info('watchdog', `Recovery attempt ${recoveryAttempts + 1}/${MAX_RECOVERY_ATTEMPTS} (action level ${actionIndex + 1})`);

  const success = action(window);
  recoveryAttempts++;

  if (!success && actionIndex === RECOVERY_ACTIONS.length - 1) {
    // Window recreation needed — emit failed event
    currentPhase = 'failed';
    emitter.emit('watchdog:failed', {
      timestamp: Date.now(),
      recoveryAttempts,
      requiresWindowRecreation: true,
    });
  }
}
