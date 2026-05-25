// Crash Recovery Test Suite (Phase 3)
import { describe, it, expect, beforeEach } from 'vitest';
import { CrashRecovery } from '../../system/supervision/crash-recovery';

describe('CrashRecovery', () => {
  let recovery: CrashRecovery;

  beforeEach(() => {
    recovery = new CrashRecovery({ maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 });
  });

  it('should recover from restartable categories', async () => {
    const result = await recovery.attemptRecovery('test-service', 'NETWORK_ERROR', async () => {});
    expect(result).toBe(true);
  });

  it('should not recover from non-restartable categories', async () => {
    const result = await recovery.attemptRecovery('test-service', 'AUTH_FAILURE', async () => {});
    expect(result).toBe(false);
  });

  it('should exhaust attempts after max retries', async () => {
    let attemptCount = 0;
    const failingRestart = async () => {
      attemptCount++;
      throw new Error('Still failing');
    };

    for (let i = 0; i < 3; i++) {
      await recovery.attemptRecovery('test-service', 'NETWORK_ERROR', failingRestart);
    }
    
    const result = await recovery.attemptRecovery('test-service', 'NETWORK_ERROR', failingRestart);
    expect(result).toBe(false);
  });

  it('should track attempt count', async () => {
    await recovery.attemptRecovery('test-service', 'TIMEOUT', async () => { throw new Error('fail'); });
    expect(recovery.getAttemptCount('test-service')).toBe(1);
  });

  it('should reset attempts', async () => {
    await recovery.attemptRecovery('test-service', 'TIMEOUT', async () => { throw new Error('fail'); });
    recovery.resetAttempts('test-service');
    expect(recovery.getAttemptCount('test-service')).toBe(0);
  });

  it('should emit recovery events', async () => {
    const listener = vi.fn();
    recovery.on('recovery:attempting', listener);
    await recovery.attemptRecovery('test-service', 'NETWORK_ERROR', async () => {});
    expect(listener).toHaveBeenCalled();
  });
});
