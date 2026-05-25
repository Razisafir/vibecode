// Plugin Manager Tests - Phase 8 Verification
// Checks 1-6: Startup & Lifecycle

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../../system/runtime/plugin-manager';
import { PluginRegistry } from '../../system/runtime/plugin-registry';
import type { PluginManifest } from '../../system/kernel/types';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    main: 'index.js',
    apiVersion: '1.0.0',
    capabilities: ['fs.read', 'command.register', 'telemetry.emit'],
    dependencies: [],
    permissions: [],
    ...overrides,
  };
}

describe('PluginManager - Startup & Lifecycle', () => {
  let registry: PluginRegistry;
  let manager: PluginManager;

  beforeEach(() => {
    registry = new PluginRegistry([]);
    manager = new PluginManager(registry);
  });

  // Check 1: PluginManager state machine - all valid transitions succeed
  describe('State machine valid transitions', () => {
    it('unloaded → loaded', async () => {
      registry.registerManifest(makeManifest());
      const result = await manager.load('test-plugin');
      expect(result.success).toBe(true);
      expect(result.fromState).toBe('unloaded');
      expect(result.toState).toBe('loaded');
      expect(manager.getState('test-plugin')).toBe('loaded');
    });

    it('loaded → activated', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const result = await manager.activate('test-plugin');
      expect(result.success).toBe(true);
      expect(result.fromState).toBe('loaded');
      expect(result.toState).toBe('activated');
      expect(manager.getState('test-plugin')).toBe('activated');
    });

    it('activated → deactivated', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      const result = await manager.deactivate('test-plugin');
      expect(result.success).toBe(true);
      expect(result.fromState).toBe('activated');
      expect(result.toState).toBe('deactivated');
    });

    it('deactivated → activated (reactivation)', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      await manager.deactivate('test-plugin');
      const result = await manager.activate('test-plugin');
      expect(result.success).toBe(true);
      expect(result.toState).toBe('activated');
    });

    it('deactivated → unloaded', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      await manager.deactivate('test-plugin');
      const result = await manager.unload('test-plugin');
      expect(result.success).toBe(true);
      expect(result.toState).toBe('unloaded');
    });

    it('loaded → unloaded', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const result = await manager.unload('test-plugin');
      expect(result.success).toBe(true);
      expect(result.toState).toBe('unloaded');
    });

    it('error → loaded (recovery)', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      // Force error state
      (manager as any).states.set('test-plugin', 'error');
      const result = await manager.load('test-plugin');
      expect(result.success).toBe(true);
      expect(result.toState).toBe('loaded');
    });

    it('error → unloaded (recovery)', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      (manager as any).states.set('test-plugin', 'error');
      const result = await manager.unload('test-plugin');
      expect(result.success).toBe(true);
      expect(result.toState).toBe('unloaded');
    });
  });

  // Check 2: Invalid state transitions are rejected
  describe('Invalid state transitions rejected', () => {
    it('activate without load fails', async () => {
      registry.registerManifest(makeManifest());
      const result = await manager.activate('test-plugin');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(manager.getState('test-plugin')).toBe('unloaded');
    });

    it('deactivate when unloaded fails', async () => {
      registry.registerManifest(makeManifest());
      const result = await manager.deactivate('test-plugin');
      expect(result.success).toBe(false);
    });

    it('load when already loaded fails', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const result = await manager.load('test-plugin');
      expect(result.success).toBe(false);
    });

    it('unload when unloaded fails', async () => {
      registry.registerManifest(makeManifest());
      const result = await manager.unload('test-plugin');
      expect(result.success).toBe(false);
    });

    it('deactivate when loaded (not activated) fails', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const result = await manager.deactivate('test-plugin');
      expect(result.success).toBe(false);
    });
  });

  // Check 3: Plugin crash does not propagate to host
  describe('Plugin crash isolation', () => {
    it('crash during activate sets error state without propagating', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');

      // Make sandbox.initialize throw
      const sandbox = manager.getSandbox('test-plugin');
      if (sandbox) {
        vi.spyOn(sandbox, 'initialize').mockRejectedValue(new Error('Plugin crashed!'));
      }

      const result = await manager.activate('test-plugin');
      expect(result.success).toBe(false);
      expect(result.toState).toBe('error');
      // Manager itself is still functional
      expect(manager.getState('test-plugin')).toBe('error');
    });

    it('manager remains functional after plugin crash', async () => {
      registry.registerManifest(makeManifest({ id: 'crashy' }));
      registry.registerManifest(makeManifest({ id: 'stable' }));
      await manager.load('crashy');
      await manager.load('stable');

      const sandbox = manager.getSandbox('crashy');
      if (sandbox) {
        vi.spyOn(sandbox, 'initialize').mockRejectedValue(new Error('Boom'));
      }

      await manager.activate('crashy');
      const result = await manager.activate('stable');
      expect(result.success).toBe(true);
    });
  });

  // Check 4: Hot reload completes full cycle
  describe('Hot reload', () => {
    it('completes deactivate→unload→load→activate cycle', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      expect(manager.getState('test-plugin')).toBe('activated');

      const results = await manager.hotReload('test-plugin');
      expect(results.length).toBeGreaterThanOrEqual(3);
      // Final state should be activated
      expect(manager.getState('test-plugin')).toBe('activated');
    });

    it('hot reload from deactivated state', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      await manager.deactivate('test-plugin');

      const results = await manager.hotReload('test-plugin');
      expect(manager.getState('test-plugin')).toBe('activated');
    });

    it('hot reload from error state', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      (manager as any).states.set('test-plugin', 'error');

      const results = await manager.hotReload('test-plugin');
      expect(manager.getState('test-plugin')).toBe('activated');
    });
  });

  // Check 5: PluginManager integrates with ServiceRegistry (deferred init)
  describe('ServiceRegistry integration', () => {
    it('accepts ServiceRegistry in constructor', () => {
      const serviceRegistry = {
        register: vi.fn(),
        get: vi.fn(),
        has: vi.fn().mockReturnValue(false),
      };
      const mgr = new PluginManager(registry, serviceRegistry);
      expect(mgr).toBeDefined();
    });

    it('works without ServiceRegistry', () => {
      const mgr = new PluginManager(registry);
      expect(mgr).toBeDefined();
    });
  });

  // Check 6: Plugin events emitted on every state transition
  describe('Event emission', () => {
    it('emits plugin:loaded on load', async () => {
      registry.registerManifest(makeManifest());
      const listener = vi.fn();
      manager.on('plugin:loaded', listener);
      await manager.load('test-plugin');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].pluginId).toBe('test-plugin');
    });

    it('emits plugin:activated on activate', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const listener = vi.fn();
      manager.on('plugin:activated', listener);
      await manager.activate('test-plugin');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits plugin:deactivated on deactivate', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      const listener = vi.fn();
      manager.on('plugin:deactivated', listener);
      await manager.deactivate('test-plugin');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits plugin:unloaded on unload', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const listener = vi.fn();
      manager.on('plugin:unloaded', listener);
      await manager.unload('test-plugin');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits plugin:error on activation crash', async () => {
      registry.registerManifest(makeManifest());
      await manager.load('test-plugin');
      const sandbox = manager.getSandbox('test-plugin');
      if (sandbox) {
        vi.spyOn(sandbox, 'initialize').mockRejectedValue(new Error('Crash'));
      }
      const listener = vi.fn();
      manager.on('plugin:error', listener);
      await manager.activate('test-plugin');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits plugin-event for all transitions', async () => {
      registry.registerManifest(makeManifest());
      const listener = vi.fn();
      manager.on('plugin-event', listener);
      await manager.load('test-plugin');
      await manager.activate('test-plugin');
      await manager.deactivate('test-plugin');
      await manager.unload('test-plugin');
      expect(listener).toHaveBeenCalledTimes(4);
    });
  });
});
