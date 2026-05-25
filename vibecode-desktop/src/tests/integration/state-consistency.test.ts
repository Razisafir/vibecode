// Phase 10: Integration Test — State Consistency
// Check 6: State propagation + independence

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager, getStateManager, resetStateManager } from '../../system/kernel/state';
import { PluginManager } from '../../system/runtime/plugin-manager';
import { PluginRegistry } from '../../system/runtime/plugin-registry';
import { WindowManager } from '../../system/runtime/window-manager';
import type { ServiceState, PluginManifest } from '../../system/kernel/types';

function createTestManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'state-test-plugin',
    name: 'State Test',
    version: '1.0.0',
    description: 'Test',
    main: 'index.js',
    apiVersion: '1.0.0',
    capabilities: ['fs.read'],
    ...overrides,
  };
}

describe('State Consistency Integration', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    resetStateManager();
    stateManager = getStateManager();
  });

  afterEach(() => {
    resetStateManager();
  });

  it('state manager propagates state changes to listeners', () => {
    const changes: Array<{ service: string; newState: ServiceState; oldState: ServiceState }> = [];

    stateManager.addListener((service, newState, oldState) => {
      changes.push({ service, newState, oldState });
    });

    stateManager.setState('kernel', 'initializing');
    stateManager.setState('kernel', 'ready');

    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({ service: 'kernel', newState: 'initializing', oldState: 'uninitialized' });
    expect(changes[1]).toEqual({ service: 'kernel', newState: 'ready', oldState: 'initializing' });
  });

  it('plugin state is independent of service state', async () => {
    const registry = new PluginRegistry([]);
    const manager = new PluginManager(registry);

    // Service state changes should not affect plugin state
    stateManager.setState('telemetry', 'initializing');
    stateManager.setState('telemetry', 'ready');

    const manifest = createTestManifest({ id: 'indep-plugin' });
    registry.registerManifest(manifest);
    await manager.load('indep-plugin');

    // Plugin state is managed separately
    expect(manager.getState('indep-plugin')).toBe('loaded');
    expect(stateManager.getState('telemetry')).toBe('ready');
  });

  it('window state is independent of plugin state', async () => {
    const registry = new PluginRegistry([]);
    const manager = new PluginManager(registry);
    const windowManager = new WindowManager();

    const manifest = createTestManifest({ id: 'win-state-plugin' });
    registry.registerManifest(manifest);
    await manager.load('win-state-plugin');
    await manager.activate('win-state-plugin');

    await windowManager.createWindow({
      id: 'test-window',
      role: 'secondary',
      title: 'Test',
    });

    // Window and plugin have independent state machines
    expect(manager.getState('win-state-plugin')).toBe('activated');
    expect(windowManager.getState('test-window')).toBe('ready');

    // Deactivating plugin doesn't affect window
    await manager.deactivate('win-state-plugin');
    expect(windowManager.getState('test-window')).toBe('ready');
  });

  it('state transitions are atomic — no partial states', () => {
    const states: ServiceState[] = [];
    stateManager.addListener((_service, newState) => {
      states.push(newState);
    });

    stateManager.setState('svc-a', 'initializing');
    stateManager.setState('svc-a', 'ready');
    stateManager.setState('svc-a', 'degraded');

    // Each transition produces exactly one state
    expect(states).toEqual(['initializing', 'ready', 'degraded']);
  });

  it('invalid state transitions are rejected without side effects', () => {
    // Must transition properly first: uninitialized → initializing → ready
    stateManager.setState('svc-b', 'initializing');
    stateManager.setState('svc-b', 'ready');

    const result = stateManager.setState('svc-b', 'initializing'); // Invalid: ready → initializing
    expect(result).toBe(false);
    expect(stateManager.getState('svc-b')).toBe('ready'); // State unchanged
  });

  it('state history is tracked for diagnostics', () => {
    stateManager.setState('svc-c', 'initializing');
    stateManager.setState('svc-c', 'ready');

    const history = stateManager.getTransitionHistory('svc-c');
    expect(history).toHaveLength(2);
    expect(history[0].from).toBe('uninitialized');
    expect(history[0].to).toBe('initializing');
    expect(history[1].from).toBe('initializing');
    expect(history[1].to).toBe('ready');
  });
});
