/**
 * VibeCode Desktop — Auto-Update Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron BEFORE anything else
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn().mockReturnValue('0.2.0'),
    getPath: vi.fn().mockReturnValue('/tmp/test'),
    getName: vi.fn().mockReturnValue('VibeCode'),
    getAppPath: vi.fn().mockReturnValue('/tmp/test'),
  },
  BrowserWindow: vi.fn(),
  dialog: vi.fn(),
  ipcMain: { handle: vi.fn() },
}));

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: true,
    autoRunAppAfterInstall: true,
    allowDowngrade: false,
    allowPrerelease: false,
    channel: 'stable',
    on: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue([]),
    quitAndInstall: vi.fn(),
  },
  CancellationToken: vi.fn().mockImplementation(() => ({ cancel: vi.fn() })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('stable'),
  rmSync: vi.fn(),
}));

vi.mock('../main/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../main/utils/audit-log', () => ({
  auditLog: { log: vi.fn() },
}));

vi.mock('../main/services/telemetry', () => ({
  telemetry: { startMonitoring: vi.fn(), stopMonitoring: vi.fn(), recordIpcCall: vi.fn() },
}));

import { AutoUpdateService } from '../main/services/auto-updater';

describe('Auto-Update Service', () => {
  let service: AutoUpdateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AutoUpdateService();
  });

  it('should return initial status with stable channel', () => {
    const status = service.getStatus();
    expect(status.channel).toBe('stable');
    expect(status.checking).toBe(false);
    expect(status.available).toBe(false);
    expect(status.downloading).toBe(false);
    expect(status.downloaded).toBe(false);
    expect(status.error).toBeNull();
  });

  it('should support setting update channels', () => {
    service.setChannel('beta');
    expect(service.getStatus().channel).toBe('beta');

    service.setChannel('nightly');
    expect(service.getStatus().channel).toBe('nightly');

    service.setChannel('stable');
    expect(service.getStatus().channel).toBe('stable');
  });

  it('should handle check for updates in development mode', async () => {
    const status = await service.checkForUpdates(true);
    expect(status).toBeDefined();
    expect(status.error).toContain('development');
  });

  it('should support status change listeners', () => {
    const callback = vi.fn();
    const unsubscribe = service.onStatusChange(callback);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('should start and stop periodic checks', () => {
    service.startPeriodicChecks(60000);
    service.stopPeriodicChecks();
  });

  it('should cancel download gracefully', () => {
    service.cancelDownload();
  });

  it('should not download when no update is available', async () => {
    await service.downloadUpdate();
  });

  it('should not install when no update is downloaded', () => {
    service.quitAndInstall();
  });
});
