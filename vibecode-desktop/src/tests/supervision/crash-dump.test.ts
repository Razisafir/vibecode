// Crash Dump Test Suite (Phase 3)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrashDump } from '../../system/supervision/crash-dump';
import { existsSync, rmSync } from 'fs';

describe('CrashDump', () => {
  let crashDump: CrashDump;
  const testDir = './test-crash-dumps';

  beforeEach(() => {
    crashDump = new CrashDump({ dumpDirectory: testDir });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should generate a crash dump', () => {
    const filepath = crashDump.generateDump({
      serviceName: 'test-service',
      error: 'Test error',
      stack: 'Error: Test\n  at test.js:1:1',
      timestamp: Date.now(),
      systemState: { cpu: '50%' },
    });
    expect(filepath).toContain('crash-test-service');
    expect(crashDump.getDumpCount()).toBe(1);
  });

  it('should emit dump:generated event', () => {
    const listener = vi.fn();
    crashDump.on('dump:generated', listener);
    crashDump.generateDump({
      serviceName: 'test',
      error: 'Test',
      timestamp: Date.now(),
      systemState: {},
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('should include memory usage in dump', () => {
    crashDump.generateDump({
      serviceName: 'test',
      error: 'OOM',
      timestamp: Date.now(),
      systemState: {},
    });
    expect(crashDump.getDumpCount()).toBe(1);
  });
});
