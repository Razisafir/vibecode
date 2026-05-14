/**
 * VibeCode Desktop — Analytics IPC Handlers
 *
 * Registers IPC channels for the analytics service.
 * All analytics operations require user consent.
 */

import { ipcMain } from 'electron';
import { analyticsService } from '../services/analytics';
import { logger } from '../utils/logger';

export function registerAnalyticsHandlers(): void {
  // Get current analytics config
  ipcMain.handle('analytics:getConfig', async () => {
    return { success: true, data: { config: analyticsService.getConfig() } };
  });

  // Grant consent for analytics
  ipcMain.handle('analytics:grantConsent', async (_event, options?: any) => {
    try {
      analyticsService.grantConsent(options);
      return { success: true, data: { config: analyticsService.getConfig() } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  // Revoke consent
  ipcMain.handle('analytics:revokeConsent', async () => {
    try {
      analyticsService.revokeConsent();
      return { success: true, data: { config: analyticsService.getConfig() } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  // Update analytics config
  ipcMain.handle('analytics:updateConfig', async (_event, updates: any) => {
    try {
      analyticsService.updateConfig(updates);
      return { success: true, data: { config: analyticsService.getConfig() } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  // Get usage metrics
  ipcMain.handle('analytics:getMetrics', async () => {
    return { success: true, data: { metrics: analyticsService.getUsageMetrics() } };
  });

  // Get pending events (for transparency)
  ipcMain.handle('analytics:getPendingEvents', async () => {
    return { success: true, data: { events: analyticsService.getPendingEvents() } };
  });

  // Track feature usage
  ipcMain.handle('analytics:trackFeature', async (_event, feature: string) => {
    analyticsService.trackFeature(feature);
    return { success: true };
  });

  logger.info('ipc', 'Analytics IPC handlers registered');
}
