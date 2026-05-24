/**
 * VibeCode Desktop — Auto-Update Service
 *
 * Secure update architecture with GitHub Releases integration.
 * Supports stable, beta, and nightly channels.
 * Includes rollback-safe updates, signature validation,
 * and downgrade attack prevention.
 *
 * Extracted from src/main/services/auto-updater.ts during Phase 2 refactoring.
 * Class → module-level functions.
 * IPC registration REMOVED — all IPC is in updater-handlers.ts.
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo, CancellationToken } from 'electron-updater';
import { logger } from '../../main/utils/logger';
import { auditLog } from '../../main/utils/audit-log';
import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsMkdirInternalSync,
  kernelFsWriteInternalSync,
} from '../../main/kernel/kernel-fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────

export type UpdateChannel = 'stable' | 'beta' | 'nightly';

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  progress: UpdateProgress | null;
  info: UpdateInfo | null;
  channel: UpdateChannel;
}

export interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

type UpdateEventCallback = (status: UpdateStatus) => void;

// ─── Module-level State ─────────────────────────────────────────

let status: UpdateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  error: null,
  progress: null,
  info: null,
  channel: 'stable',
};

const listeners: Set<UpdateEventCallback> = new Set();
let cancellationToken: CancellationToken | null = null;
let mainWindow: BrowserWindow | null = null;
let checkInterval: NodeJS.Timeout | null = null;
let lastCheckTime: number = 0;
const minimumCheckIntervalMs = 60 * 60 * 1000; // 1 hour minimum between checks

// ─── Configuration (called once during module load) ─────────────

function configureAutoUpdater(): void {
  // Disable auto-download — we want user consent
  autoUpdater.autoDownload = false;
  autoUpdater.autoRunAppAfterInstall = true;

  // Prevent downgrade attacks
  autoUpdater.allowDowngrade = false;

  // Allow prerelease for beta/nightly channels
  autoUpdater.allowPrerelease = false;

  // Set update channel
  autoUpdater.channel = 'stable';

  // ── Event Handlers ────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    updateStatus({ checking: true, error: null });
    logger.info('updater', 'Checking for updates...');
    auditLog.auditLog('update:check', { channel: status.channel });
  });

  autoUpdater.on('update-available', (info) => {
    updateStatus({
      checking: false,
      available: true,
      info,
    });
    logger.info('updater', `Update available: v${info.version}`, {
      version: info.version,
      releaseDate: info.releaseDate,
      channel: status.channel,
    });
    auditLog.auditLog('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
    notifyRenderer('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    updateStatus({
      checking: false,
      available: false,
      info: info || null,
    });
    logger.info('updater', 'No update available', {
      currentVersion: app.getVersion(),
    });
    notifyRenderer('update-not-available', info);
  });

  autoUpdater.on('download-progress', (progressInfo) => {
    const progress: UpdateProgress = {
      bytesPerSecond: progressInfo.bytesPerSecond,
      percent: progressInfo.percent,
      transferred: progressInfo.transferred,
      total: progressInfo.total,
    };
    updateStatus({
      downloading: true,
      progress,
    });
    notifyRenderer('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateStatus({
      downloading: false,
      downloaded: true,
      info,
      progress: null,
    });
    logger.info('updater', `Update downloaded: v${info.version}`, {
      version: info.version,
    });
    auditLog.auditLog('update:downloaded', { version: info.version });
    notifyRenderer('update-downloaded', info);
  });

  autoUpdater.on('error', (error) => {
    const errorMessage = error?.message || 'Unknown update error';
    updateStatus({
      checking: false,
      downloading: false,
      error: errorMessage,
    });
    logger.error('updater', 'Update error', { error: errorMessage });
    auditLog.auditLog('update:error', { error: errorMessage });
    notifyRenderer('update:error', { message: errorMessage });
  });
}

// Configure on module load
configureAutoUpdater();

// ─── Public API ────────────────────────────────────────────────

/**
 * Initialize the auto-updater with the main window reference.
 */
export function initializeAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Set update channel from persisted settings
  const savedChannel = loadChannelPreference();
  setUpdateChannel(savedChannel);

  logger.info('updater', `Auto-updater initialized (channel: ${status.channel})`);
}

/**
 * Check for updates. Respects minimum check interval.
 */
export async function checkForUpdates(force: boolean = false): Promise<UpdateStatus> {
  const now = Date.now();
  if (!force && now - lastCheckTime < minimumCheckIntervalMs) {
    logger.info('updater', 'Skipping check — too soon since last check');
    return status;
  }

  if (status.checking || status.downloading) {
    logger.info('updater', 'Update check already in progress');
    return status;
  }

  // Only check in packaged app
  if (!app.isPackaged) {
    logger.info('updater', 'Skipping update check in development mode');
    updateStatus({ error: 'Updates not available in development mode' });
    return status;
  }

  try {
    lastCheckTime = now;
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateStatus({ error: msg, checking: false });
    logger.error('updater', 'Failed to check for updates', { error: msg });
  }

  return status;
}

/**
 * Download the available update.
 */
export async function downloadUpdate(): Promise<void> {
  if (!status.available) {
    logger.warn('updater', 'No update available to download');
    return;
  }

  try {
    cancellationToken = new CancellationToken();
    updateStatus({ downloading: true });
    await autoUpdater.downloadUpdate(cancellationToken);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    updateStatus({ downloading: false, error: msg });
    logger.error('updater', 'Failed to download update', { error: msg });
  }
}

/**
 * Cancel an in-progress download.
 */
export function cancelDownload(): void {
  if (cancellationToken) {
    cancellationToken.cancel();
    cancellationToken = null;
    updateStatus({ downloading: false, progress: null });
    logger.info('updater', 'Update download cancelled');
    auditLog.auditLog('update:cancel', {});
  }
}

/**
 * Install the downloaded update and restart the app.
 */
export function quitAndInstall(): void {
  if (!status.downloaded) {
    logger.warn('updater', 'No downloaded update to install');
    return;
  }

  logger.info('updater', 'Installing update and restarting...');
  auditLog.auditLog('update:install', {
    version: status.info?.version,
  });

  // Notify renderer before quitting
  notifyRenderer('update:installing', null);

  // Small delay to let the renderer process the event
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 500);
}

/**
 * Set the update channel.
 */
export function setUpdateChannel(channel: UpdateChannel): void {
  status.channel = channel;
  autoUpdater.allowPrerelease = channel !== 'stable';
  autoUpdater.channel = channel === 'stable' ? 'stable' : channel;

  // Persist channel preference
  saveChannelPreference(channel);

  logger.info('updater', `Update channel set to: ${channel}`);
  emitChange();
}

/**
 * Get current update status.
 */
export function getUpdateStatus(): UpdateStatus {
  return { ...status };
}

/**
 * Start periodic update checks.
 */
export function startPeriodicChecks(intervalMs: number = 4 * 60 * 60 * 1000): void {
  // Default: check every 4 hours
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // First check after 30 seconds (allow app to settle)
  setTimeout(() => checkForUpdates(), 30000);

  // Subsequent checks on interval
  checkInterval = setInterval(() => {
    checkForUpdates();
  }, intervalMs);

  logger.info('updater', `Periodic update checks started (interval: ${intervalMs}ms)`);
}

/**
 * Stop periodic update checks.
 */
export function stopPeriodicChecks(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    logger.info('updater', 'Periodic update checks stopped');
  }
}

/**
 * Subscribe to update status changes.
 */
export function onUpdateStatusChange(callback: UpdateEventCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ── Private Helpers ───────────────────────────────────────────

function updateStatus(partial: Partial<UpdateStatus>): void {
  status = { ...status, ...partial };
  emitChange();
}

function emitChange(): void {
  const statusCopy = { ...status };
  for (const listener of listeners) {
    try {
      listener(statusCopy);
    } catch (err) {
      logger.error('updater', 'Listener error', { error: String(err) });
    }
  }
}

function notifyRenderer(channel: string, data: any): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`updater:${channel}`, data);
  }
}

function loadChannelPreference(): UpdateChannel {
  try {
    const configDir = path.join(app.getPath('userData'), 'config');
    const channelFile = path.join(configDir, 'update-channel');
    if (kernelFsExistsInternal(channelFile)) {
      const channel = kernelFsReadSync(channelFile).trim();
      if (['stable', 'beta', 'nightly'].includes(channel)) {
        return channel as UpdateChannel;
      }
    }
  } catch {
    // Default to stable
  }
  return 'stable';
}

function saveChannelPreference(channel: UpdateChannel): void {
  try {
    const configDir = path.join(app.getPath('userData'), 'config');
    if (!kernelFsExistsInternal(configDir)) {
      kernelFsMkdirInternalSync(configDir);
    }
    kernelFsWriteInternalSync(path.join(configDir, 'update-channel'), channel);
  } catch (err) {
    logger.error('updater', 'Failed to save channel preference', { error: String(err) });
  }
}
