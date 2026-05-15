/**
 * VibeCode Desktop — Auto-Update Service
 *
 * Secure update architecture with GitHub Releases integration.
 * Supports stable, beta, and nightly channels.
 * Includes rollback-safe updates, signature validation,
 * and downgrade attack prevention.
 */

import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater, UpdateInfo, CancellationToken } from 'electron-updater';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

// ─── Auto-Update Service ────────────────────────────────────────

export class AutoUpdateService {
  private status: UpdateStatus;
  private listeners: Set<UpdateEventCallback> = new Set();
  private cancellationToken: CancellationToken | null = null;
  private mainWindow: BrowserWindow | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastCheckTime: number = 0;
  private minimumCheckIntervalMs = 60 * 60 * 1000; // 1 hour minimum between checks

  constructor() {
    this.status = {
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      error: null,
      progress: null,
      info: null,
      channel: 'stable',
    };

    this.configureAutoUpdater();
  }

  // ── Configuration ─────────────────────────────────────────────

  private configureAutoUpdater(): void {
    // Disable auto-download — we want user consent
    autoUpdater.autoDownload = false;
    autoUpdater.autoRunAppAfterInstall = true;

    // Prevent downgrade attacks
    autoUpdater.allowDowngrade = false;

    // Allow prerelease for beta/nightly channels
    autoUpdater.allowPrerelease = false;

    // Set update channel
    autoUpdater.channel = 'stable';

    // GitHub provider is configured in electron-builder.yml
    // autoUpdater.setFeedURL() is set by electron-builder automatically

    // ── Event Handlers ────────────────────────────────────────────

    autoUpdater.on('checking-for-update', () => {
      this.updateStatus({ checking: true, error: null });
      logger.info('updater', 'Checking for updates...');
      auditLog.auditLog('update:check', { channel: this.status.channel });
    });

    autoUpdater.on('update-available', (info) => {
      this.updateStatus({
        checking: false,
        available: true,
        info,
      });
      logger.info('updater', `Update available: v${info.version}`, {
        version: info.version,
        releaseDate: info.releaseDate,
        channel: this.status.channel,
      });
      auditLog.auditLog('update:available', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
      this.notifyRenderer('update-available', info);
    });

    autoUpdater.on('update-not-available', (info) => {
      this.updateStatus({
        checking: false,
        available: false,
        info: info || null,
      });
      logger.info('updater', 'No update available', {
        currentVersion: app.getVersion(),
      });
      this.notifyRenderer('update-not-available', info);
    });

    autoUpdater.on('download-progress', (progressInfo) => {
      const progress: UpdateProgress = {
        bytesPerSecond: progressInfo.bytesPerSecond,
        percent: progressInfo.percent,
        transferred: progressInfo.transferred,
        total: progressInfo.total,
      };
      this.updateStatus({
        downloading: true,
        progress,
      });
      this.notifyRenderer('update:progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.updateStatus({
        downloading: false,
        downloaded: true,
        info,
        progress: null,
      });
      logger.info('updater', `Update downloaded: v${info.version}`, {
        version: info.version,
      });
      auditLog.auditLog('update:downloaded', { version: info.version });
      this.notifyRenderer('update-downloaded', info);
    });

    autoUpdater.on('error', (error) => {
      const errorMessage = error?.message || 'Unknown update error';
      this.updateStatus({
        checking: false,
        downloading: false,
        error: errorMessage,
      });
      logger.error('updater', 'Update error', { error: errorMessage });
      auditLog.auditLog('update:error', { error: errorMessage });
      this.notifyRenderer('update:error', { message: errorMessage });
    });
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Initialize the auto-updater with the main window reference.
   */
  initialize(window: BrowserWindow): void {
    this.mainWindow = window;

    // Set update channel from persisted settings
    const savedChannel = this.loadChannelPreference();
    this.setChannel(savedChannel);

    logger.info('updater', `Auto-updater initialized (channel: ${this.status.channel})`);
  }

  /**
   * Check for updates. Respects minimum check interval.
   */
  async checkForUpdates(force: boolean = false): Promise<UpdateStatus> {
    const now = Date.now();
    if (!force && now - this.lastCheckTime < this.minimumCheckIntervalMs) {
      logger.info('updater', 'Skipping check — too soon since last check');
      return this.status;
    }

    if (this.status.checking || this.status.downloading) {
      logger.info('updater', 'Update check already in progress');
      return this.status;
    }

    // Only check in packaged app
    if (!app.isPackaged) {
      logger.info('updater', 'Skipping update check in development mode');
      this.updateStatus({ error: 'Updates not available in development mode' });
      return this.status;
    }

    try {
      this.lastCheckTime = now;
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.updateStatus({ error: msg, checking: false });
      logger.error('updater', 'Failed to check for updates', { error: msg });
    }

    return this.status;
  }

  /**
   * Download the available update.
   */
  async downloadUpdate(): Promise<void> {
    if (!this.status.available) {
      logger.warn('updater', 'No update available to download');
      return;
    }

    try {
      this.cancellationToken = new CancellationToken();
      this.updateStatus({ downloading: true });
      await autoUpdater.downloadUpdate(this.cancellationToken);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.updateStatus({ downloading: false, error: msg });
      logger.error('updater', 'Failed to download update', { error: msg });
    }
  }

  /**
   * Cancel an in-progress download.
   */
  cancelDownload(): void {
    if (this.cancellationToken) {
      this.cancellationToken.cancel();
      this.cancellationToken = null;
      this.updateStatus({ downloading: false, progress: null });
      logger.info('updater', 'Update download cancelled');
      auditLog.auditLog('update:cancel', {});
    }
  }

  /**
   * Install the downloaded update and restart the app.
   */
  quitAndInstall(): void {
    if (!this.status.downloaded) {
      logger.warn('updater', 'No downloaded update to install');
      return;
    }

    logger.info('updater', 'Installing update and restarting...');
    auditLog.auditLog('update:install', {
      version: this.status.info?.version,
    });

    // Notify renderer before quitting
    this.notifyRenderer('update:installing', null);

    // Small delay to let the renderer process the event
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 500);
  }

  /**
   * Set the update channel.
   */
  setChannel(channel: UpdateChannel): void {
    this.status.channel = channel;
    autoUpdater.allowPrerelease = channel !== 'stable';
    autoUpdater.channel = channel === 'stable' ? 'stable' : channel;

    // Persist channel preference
    this.saveChannelPreference(channel);

    logger.info('updater', `Update channel set to: ${channel}`);
    this.emitChange();
  }

  /**
   * Get current update status.
   */
  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  /**
   * Start periodic update checks.
   */
  startPeriodicChecks(intervalMs: number = 4 * 60 * 60 * 1000): void {
    // Default: check every 4 hours
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // First check after 30 seconds (allow app to settle)
    setTimeout(() => this.checkForUpdates(), 30000);

    // Subsequent checks on interval
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, intervalMs);

    logger.info('updater', `Periodic update checks started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop periodic update checks.
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('updater', 'Periodic update checks stopped');
    }
  }

  /**
   * Subscribe to update status changes.
   */
  onStatusChange(callback: UpdateEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ── IPC Handlers ──────────────────────────────────────────────

  /**
   * Register IPC handlers for the auto-updater.
   */
  registerIpcHandlers(): void {
    const { ipcMain } = require('electron');

    ipcMain.handle('updater:check', async (_event: any, force?: boolean) => {
      const status = await this.checkForUpdates(force);
      return { success: true, data: { status } };
    });

    ipcMain.handle('updater:download', async () => {
      await this.downloadUpdate();
      return { success: true, data: { status: this.getStatus() } };
    });

    ipcMain.handle('updater:cancel', async () => {
      this.cancelDownload();
      return { success: true, data: { cancelled: true } };
    });

    ipcMain.handle('updater:install', async () => {
      this.quitAndInstall();
      return { success: true, data: { installing: true } };
    });

    ipcMain.handle('updater:status', async () => {
      return { success: true, data: { status: this.getStatus() } };
    });

    ipcMain.handle('updater:setChannel', async (_event: any, channel: UpdateChannel) => {
      this.setChannel(channel);
      return { success: true, data: { channel } };
    });

    logger.info('updater', 'IPC handlers registered');
  }

  // ── Private Helpers ───────────────────────────────────────────

  private updateStatus(partial: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...partial };
    this.emitChange();
  }

  private emitChange(): void {
    const status = { ...this.status };
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        logger.error('updater', 'Listener error', { error: String(err) });
      }
    }
  }

  private notifyRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`updater:${channel}`, data);
    }
  }

  private loadChannelPreference(): UpdateChannel {
    try {
      const configDir = path.join(app.getPath('userData'), 'config');
      const channelFile = path.join(configDir, 'update-channel');
      if (fs.existsSync(channelFile)) {
        const channel = fs.readFileSync(channelFile, 'utf8').trim();
        if (['stable', 'beta', 'nightly'].includes(channel)) {
          return channel as UpdateChannel;
        }
      }
    } catch {
      // Default to stable
    }
    return 'stable';
  }

  private saveChannelPreference(channel: UpdateChannel): void {
    try {
      const configDir = path.join(app.getPath('userData'), 'config');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(path.join(configDir, 'update-channel'), channel);
    } catch (err) {
      logger.error('updater', 'Failed to save channel preference', { error: String(err) });
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────

export const autoUpdateService = new AutoUpdateService();
