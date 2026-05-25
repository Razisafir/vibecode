// Session Recovery Test Suite (Phase 3)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionRecovery } from '../../system/supervision/session-recovery';
import { existsSync, rmSync } from 'fs';

describe('SessionRecovery', () => {
  let recovery: SessionRecovery;
  const testDir = './test-session-state';

  beforeEach(() => {
    recovery = new SessionRecovery({ stateFile: `${testDir}/recovery.json`, autoSaveIntervalMs: 1000 });
  });

  afterEach(() => {
    recovery.stopAutoSave();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('should save session state', () => {
    recovery.saveState({
      id: 'test-session',
      windows: [],
      activePlugins: ['plugin-a'],
      preferences: { theme: 'dark' },
      lastSaved: 0,
      version: '8.0.0',
    });
    expect(recovery.getCurrentState()).not.toBeNull();
  });

  it('should recover saved state', () => {
    recovery.saveState({
      id: 'test-session',
      windows: [],
      activePlugins: ['plugin-a'],
      preferences: { theme: 'dark' },
      lastSaved: 0,
      version: '8.0.0',
    });

    const recovered = recovery.recoverState();
    expect(recovered).not.toBeNull();
    expect(recovered!.id).toBe('test-session');
    expect(recovered!.activePlugins).toContain('plugin-a');
  });

  it('should return null for no saved state', () => {
    const result = recovery.recoverState();
    expect(result).toBeNull();
  });

  it('should clear state', () => {
    recovery.saveState({
      id: 'test-session',
      windows: [],
      activePlugins: [],
      preferences: {},
      lastSaved: 0,
      version: '8.0.0',
    });
    recovery.clearState();
    expect(recovery.getCurrentState()).toBeNull();
  });
});
