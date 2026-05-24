// ─── Watchdog Recovery System ──────────────────────────────────────────────
// Monitors renderer health via heartbeat IPC. If renderer is unresponsive
// for 30+ seconds, attempts recovery (ping → reload → recreate window).
// Emits events: watchdog:unresponsive, watchdog:recovered, watchdog:failed
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain } from 'electron';
import { telemetry } from './telemetry';
import { logger } from '../utils/logger';

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

// ─── Watchdog Service ───────────────────────────────────────────────────────

class WatchdogService extends EventEmitter {
  private checkTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat: number = Date.now();
  private recoveryAttempts: number = 0;
  private isWatching: boolean = false;
  private currentPhase: WatchdogState['currentPhase'] = 'healthy';

  private readonly UNSRESPONSIVE_THRESHOLD_MS = 30_000; // 30 seconds
  private readonly CHECK_INTERVAL_MS = 10_000; // Check every 10 seconds
  private readonly MAX_RECOVERY_ATTEMPTS = 3;

  // Recovery escalation levels
  private readonly RECOVERY_ACTIONS: Array<(window: BrowserWindow) => boolean> = [
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

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Start watching the renderer for heartbeat signals */
  startWatching(): void {
    if (this.isWatching) return;

    this.isWatching = true;
    this.lastHeartbeat = Date.now();
    this.recoveryAttempts = 0;
    this.currentPhase = 'healthy';

    // Register heartbeat listener
    ipcMain.on('telemetry:sendHeartbeat', (_event, data?: { fps?: number }) => {
      this.lastHeartbeat = Date.now();
      if (data?.fps !== undefined) {
        telemetry.recordRendererHeartbeat(data.fps);
      }

      // If we were unresponsive, we've now recovered
      if (this.currentPhase === 'unresponsive' || this.currentPhase === 'recovering') {
        this.currentPhase = 'healthy';
        this.recoveryAttempts = 0;
        this.emit('watchdog:recovered', { timestamp: Date.now() });
        logger.info('watchdog', 'Renderer recovered');
      }
    });

    // Start periodic health check
    this.checkTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL_MS);

    // Don't prevent process exit
    if (this.checkTimer.unref) {
      this.checkTimer.unref();
    }

    logger.info('watchdog', 'Watchdog monitoring started');
  }

  /** Stop watching */
  stopWatching(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.isWatching = false;
    this.currentPhase = 'healthy';

    logger.info('watchdog', 'Watchdog monitoring stopped');
  }

  /** Force a recovery attempt on the main window */
  forceRecovery(window: BrowserWindow): void {
    this.attemptRecovery(window);
  }

  /** Get current watchdog state */
  getState(): WatchdogState {
    return {
      isWatching: this.isWatching,
      lastHeartbeat: this.lastHeartbeat,
      recoveryAttempts: this.recoveryAttempts,
      maxRecoveryAttempts: this.MAX_RECOVERY_ATTEMPTS,
      unresponsiveThresholdMs: this.UNSRESPONSIVE_THRESHOLD_MS,
      checkIntervalMs: this.CHECK_INTERVAL_MS,
      currentPhase: this.currentPhase,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private performHealthCheck(): void {
    if (!this.isWatching) return;

    const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;

    if (timeSinceLastHeartbeat > this.UNSRESPONSIVE_THRESHOLD_MS) {
      // Renderer appears unresponsive
      if (this.currentPhase === 'healthy') {
        this.currentPhase = 'unresponsive';
        this.emit('watchdog:unresponsive', {
          timestamp: Date.now(),
          timeSinceLastHeartbeat,
        });
        logger.warn('watchdog', `Renderer unresponsive for ${Math.round(timeSinceLastHeartbeat / 1000)}s`);
      }

      // Attempt recovery
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      if (mainWindow && !mainWindow.isDestroyed()) {
        this.attemptRecovery(mainWindow);
      }
    }
  }

  private attemptRecovery(window: BrowserWindow): void {
    if (this.recoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
      this.currentPhase = 'failed';
      this.emit('watchdog:failed', {
        timestamp: Date.now(),
        recoveryAttempts: this.recoveryAttempts,
      });
      logger.error('watchdog', `All ${this.MAX_RECOVERY_ATTEMPTS} recovery attempts failed`);
      return;
    }

    this.currentPhase = 'recovering';
    const actionIndex = Math.min(this.recoveryAttempts, this.RECOVERY_ACTIONS.length - 1);
    const action = this.RECOVERY_ACTIONS[actionIndex];

    logger.info('watchdog', `Recovery attempt ${this.recoveryAttempts + 1}/${this.MAX_RECOVERY_ATTEMPTS} (action level ${actionIndex + 1})`);

    const success = action(window);
    this.recoveryAttempts++;

    if (!success && actionIndex === this.RECOVERY_ACTIONS.length - 1) {
      // Window recreation needed — emit failed event
      this.currentPhase = 'failed';
      this.emit('watchdog:failed', {
        timestamp: Date.now(),
        recoveryAttempts: this.recoveryAttempts,
        requiresWindowRecreation: true,
      });
    }
  }
}

// Singleton instance
export const watchdog = new WatchdogService();
