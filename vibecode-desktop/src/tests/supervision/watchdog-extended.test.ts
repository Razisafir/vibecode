// Phase 10: Watchdog Additional Tests
// Boosts watchdog coverage for Check 38

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Watchdog } from '../../system/supervision/watchdog';
import type { HealthCheckResult } from '../../system/kernel/types';

describe('Watchdog Extended Coverage', () => {
  let watchdog: Watchdog;

  beforeEach(() => {
    watchdog = new Watchdog({
      checkIntervalMs: 100,
      failureThreshold: 2,
      startupDelayMs: 50,
      autoRestart: true,
    });
  });

  afterEach(() => {
    watchdog.stop();
  });

  it('emits watchdog:started after startup delay', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;
    expect(watchdog.isInitialized()).toBe(true);
  });

  it('emits watchdog:threshold-exceeded after N failures', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;

    const thresholdEvents: Array<{ name: string; count: number }> = [];
    watchdog.on('watchdog:threshold-exceeded', (data) => {
      thresholdEvents.push(data);
    });

    watchdog.registerCheck('flaky-service', async () => ({
      healthy: false,
      details: { error: 'service down' },
    }));

    // Run checks manually until threshold is hit
    await watchdog.runCheck('flaky-service');
    await watchdog.runCheck('flaky-service');
    await watchdog.runCheck('flaky-service');

    expect(watchdog.getFailureCount('flaky-service')).toBe(3);
    expect(thresholdEvents.length).toBeGreaterThan(0);
  });

  it('unregisterCheck removes a check', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;

    watchdog.registerCheck('temp-check', async () => ({ healthy: true }));
    watchdog.unregisterCheck('temp-check');

    const result = await watchdog.runCheck('temp-check');
    expect(result).toBeNull();
  });

  it('runAllChecks runs all registered checks', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;

    watchdog.registerCheck('svc-a', async () => ({ healthy: true }));
    watchdog.registerCheck('svc-b', async () => ({ healthy: true }));

    const results = await watchdog.runAllChecks();
    expect(results.size).toBe(2);
    expect(results.get('svc-a')?.healthy).toBe(true);
    expect(results.get('svc-b')?.healthy).toBe(true);
  });

  it('check error emits watchdog:check-error', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;

    const errorEvents: unknown[] = [];
    watchdog.on('watchdog:check-error', (data) => {
      errorEvents.push(data);
    });

    watchdog.registerCheck('crashing', async () => {
      throw new Error('check crashed');
    });

    await watchdog.runCheck('crashing');
    expect(errorEvents.length).toBe(1);
    expect(watchdog.getFailureCount('crashing')).toBe(1);
  });

  it('healthy check resets failure count', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;

    let checkCount = 0;
    watchdog.registerCheck('recovering', async () => {
      checkCount++;
      return { healthy: checkCount > 2 };
    });

    // First 2 checks fail
    await watchdog.runCheck('recovering');
    await watchdog.runCheck('recovering');
    expect(watchdog.getFailureCount('recovering')).toBe(2);

    // Third check succeeds — resets count
    await watchdog.runCheck('recovering');
    expect(watchdog.getFailureCount('recovering')).toBe(0);
  });

  it('stop clears initialization state', async () => {
    const started = new Promise<void>((resolve) => {
      watchdog.on('watchdog:started', () => resolve());
    });
    watchdog.start();
    await started;
    expect(watchdog.isInitialized()).toBe(true);

    watchdog.stop();
    expect(watchdog.isInitialized()).toBe(false);
  });

  it('getConfig returns configuration', () => {
    const config = watchdog.getConfig();
    expect(config.checkIntervalMs).toBe(100);
    expect(config.failureThreshold).toBe(2);
    expect(config.startupDelayMs).toBe(50);
  });
});
