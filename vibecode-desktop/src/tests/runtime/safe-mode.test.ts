// Safe Mode Manager Test Suite (Phase 5)
import { describe, it, expect, beforeEach } from 'vitest';
import { SafeModeManager } from '../../system/runtime/safe-mode';

describe('SafeModeManager', () => {
  let safeMode: SafeModeManager;

  beforeEach(() => {
    safeMode = new SafeModeManager();
  });

  it('should start inactive', () => {
    expect(safeMode.isActive()).toBe(false);
  });

  it('should activate with a reason', () => {
    safeMode.activate('crash_loop');
    expect(safeMode.isActive()).toBe(true);
    expect(safeMode.getLastActivationReason()).toBe('crash_loop');
  });

  it('should disable features based on reason', () => {
    safeMode.activate('crash_loop');
    expect(safeMode.isFeatureAllowed('plugins')).toBe(false);
    expect(safeMode.isFeatureAllowed('auto-update')).toBe(false);
  });

  it('should deactivate safe mode', () => {
    safeMode.activate('user_requested');
    safeMode.deactivate();
    expect(safeMode.isActive()).toBe(false);
  });

  it('should track activation count', () => {
    safeMode.activate('crash_loop');
    safeMode.deactivate();
    safeMode.activate('plugin_failure');
    expect(safeMode.getActivationCount()).toBe(2);
  });

  it('should restrict network in crash_loop mode', () => {
    safeMode.activate('crash_loop');
    const config = safeMode.getConfig();
    expect(config.allowNetworkAccess).toBe(false);
  });

  it('should restrict plugins in plugin_failure mode', () => {
    safeMode.activate('plugin_failure');
    const config = safeMode.getConfig();
    expect(config.allowPluginSystem).toBe(false);
  });
});
