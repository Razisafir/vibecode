// ─── Telemetry IPC Handlers ────────────────────────────────────────────────
// IPC handlers for telemetry data, crash dumps, heartbeats, and logs.
// ─────────────────────────────────────────────────────────────────────────────

import { ipcMain } from 'electron';
import { telemetry } from '../services/telemetry';
import { crashDumpService } from '../services/crash-dump';
import { logger } from '../utils/logger';

function ok<T>(data: T) {
  return { success: true, data };
}

function err(message: string) {
  return { success: false, error: message };
}

export function registerTelemetryHandlers(): void {
  // ── telemetry:getMetrics ────────────────────────────────────────────────
  ipcMain.handle('telemetry:getMetrics', async () => {
    try {
      const metrics = telemetry.getMetrics();
      return ok(metrics);
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── telemetry:getRecentLogs ─────────────────────────────────────────────
  ipcMain.handle('telemetry:getRecentLogs', async (_event, count?: number, level?: string) => {
    try {
      const logs = logger.getRecentLogs(count ?? 100, level as any);
      return ok({ logs });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── telemetry:getCrashDumps ─────────────────────────────────────────────
  ipcMain.handle('telemetry:getCrashDumps', async () => {
    try {
      const dumps = crashDumpService.listCrashDumps();
      return ok({ dumps });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── telemetry:sendHeartbeat ─────────────────────────────────────────────
  ipcMain.handle('telemetry:sendHeartbeat', async (_event, data?: { fps?: number }) => {
    try {
      telemetry.recordRendererHeartbeat(data?.fps ?? 0);
      return ok({ received: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  // ── telemetry:clearCrashDumps ───────────────────────────────────────────
  ipcMain.handle('telemetry:clearCrashDumps', async () => {
    try {
      await crashDumpService.clearCrashDumps();
      return ok({ cleared: true });
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error));
    }
  });

  logger.info('telemetry', 'Telemetry IPC handlers registered');
}
