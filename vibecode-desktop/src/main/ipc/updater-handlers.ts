/**
 * VibeCode Desktop — Updater IPC Handlers
 *
 * Registers IPC channels for the auto-update system.
 * All update operations are proxied through the AutoUpdateService.
 */

import { ipcMain } from 'electron';
import { autoUpdateService, UpdateChannel } from '../services/auto-updater';
import { logger } from '../utils/logger';

export function registerUpdaterHandlers(): void {
  // Check for updates
  ipcMain.handle('updater:check', async (_event, force?: boolean) => {
    try {
      const status = await autoUpdateService.checkForUpdates(force);
      return { success: true, data: { status } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('ipc', 'updater:check failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  // Download available update
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdateService.downloadUpdate();
      return { success: true, data: { status: autoUpdateService.getStatus() } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('ipc', 'updater:download failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  // Cancel in-progress download
  ipcMain.handle('updater:cancel', async () => {
    try {
      autoUpdateService.cancelDownload();
      return { success: true, data: { cancelled: true } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  // Install downloaded update and restart
  ipcMain.handle('updater:install', async () => {
    try {
      autoUpdateService.quitAndInstall();
      return { success: true, data: { installing: true } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  // Get current update status
  ipcMain.handle('updater:status', async () => {
    try {
      return { success: true, data: { status: autoUpdateService.getStatus() } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  // Set update channel
  ipcMain.handle('updater:setChannel', async (_event, channel: UpdateChannel) => {
    try {
      autoUpdateService.setChannel(channel);
      return { success: true, data: { channel } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  logger.info('ipc', 'Updater IPC handlers registered');
}
