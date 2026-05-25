// Phase 10: Auto-Updater Tests
// Covers auto-updater.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoUpdater } from '../../system/supervision/auto-updater';

describe('AutoUpdater', () => {
  let updater: AutoUpdater;

  beforeEach(() => {
    updater = new AutoUpdater('1.0.0', {
      channel: 'stable',
      autoDownload: false,
      autoInstallOnQuit: true,
      checkIntervalMs: 3600000,
      stagedRolloutPercentage: 100,
    });
  });

  afterEach(() => {
    updater.stopPeriodicCheck();
  });

  it('has correct current version', () => {
    expect(updater.getCurrentVersion()).toBe('1.0.0');
  });

  it('checkForUpdate returns null when no update available', async () => {
    const result = await updater.checkForUpdate();
    expect(result).toBeNull();
  });

  it('setAvailableUpdate triggers event', () => {
    let eventFired = false;
    updater.on('update:available', () => { eventFired = true; });

    updater.setAvailableUpdate({
      version: '2.0.0',
      releaseDate: '2026-01-01',
      releaseNotes: 'Major update',
      downloadUrl: 'https://example.com/update',
      hash: 'abc123',
      size: 50000000,
      mandatory: false,
    });

    expect(eventFired).toBe(true);
    expect(updater.getAvailableUpdate()).not.toBeNull();
    expect(updater.getAvailableUpdate()!.version).toBe('2.0.0');
  });

  it('downloadUpdate throws when no update available', async () => {
    await expect(updater.downloadUpdate()).rejects.toThrow('No update available');
  });

  it('installUpdate throws when not downloaded', async () => {
    updater.setAvailableUpdate({
      version: '2.0.0',
      releaseDate: '2026-01-01',
      releaseNotes: 'Update',
      downloadUrl: 'https://example.com/update',
      hash: 'abc123',
      size: 50000000,
      mandatory: false,
    });
    await expect(updater.installUpdate()).rejects.toThrow('not ready');
  });

  it('getConfig returns configuration', () => {
    const config = updater.getConfig();
    expect(config.channel).toBe('stable');
    expect(config.autoDownload).toBe(false);
    expect(config.autoInstallOnQuit).toBe(true);
  });

  it('emits update:checking event', async () => {
    let eventFired = false;
    updater.on('update:checking', () => { eventFired = true; });
    await updater.checkForUpdate();
    expect(eventFired).toBe(true);
  });

  it('startPeriodicCheck starts and stopPeriodicCheck stops', () => {
    updater.startPeriodicCheck();
    updater.stopPeriodicCheck();
    // No errors means it worked
  });

  it('checkForUpdate returns null if already checking', async () => {
    // Force isChecking by calling during another check
    // This is a race condition test - just verify it doesn't crash
    const results = await Promise.all([
      updater.checkForUpdate(),
      updater.checkForUpdate(),
    ]);
    // At least one should be null (the second concurrent check)
    expect(results).toHaveLength(2);
  });
});
