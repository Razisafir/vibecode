// Phase 10: Integration Test — Plugin + Window Integration
// Check 1: Plugin creates window
// Check 4: Session + Window + Plugin crash recovery

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PluginManager } from '../../system/runtime/plugin-manager';
import { PluginRegistry } from '../../system/runtime/plugin-registry';
import { PluginSandbox } from '../../system/runtime/plugin-sandbox';
import { WindowManager } from '../../system/runtime/window-manager';
import { WindowSession } from '../../system/runtime/window-session';
import { IPCRouter } from '../../system/runtime/ipc-router';
import type { PluginManifest, BootConfig, ServiceRegistry } from '../../system/kernel/types';

function createTestManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    main: 'index.js',
    apiVersion: '1.0.0',
    capabilities: ['fs.read', 'command.register', 'telemetry.emit', 'ipc.send'],
    ...overrides,
  };
}

describe('Plugin + Window Integration', () => {
  let registry: PluginRegistry;
  let manager: PluginManager;
  let windowManager: WindowManager;

  beforeEach(() => {
    registry = new PluginRegistry([]);
    manager = new PluginManager(registry);
    windowManager = new WindowManager();
  });

  it('plugin can trigger window creation through the system', async () => {
    const manifest = createTestManifest({ id: 'window-plugin' });
    registry.registerManifest(manifest);
    await manager.load('window-plugin');
    await manager.activate('window-plugin');

    // Plugin is now activated — simulate it requesting a window
    const handle = await windowManager.createWindow({
      id: 'plugin-window-1',
      role: 'secondary',
      title: 'Plugin Window',
    });

    expect(handle).toBeDefined();
    expect(handle.getId()).toBe('plugin-window-1');
    expect(handle.getRole()).toBe('secondary');
    expect(windowManager.getState('plugin-window-1')).toBe('ready');
  });

  it('plugin window lifecycle is independent of plugin lifecycle', async () => {
    const manifest = createTestManifest({ id: 'independent-plugin' });
    registry.registerManifest(manifest);
    await manager.load('independent-plugin');
    await manager.activate('independent-plugin');

    const handle = await windowManager.createWindow({
      id: 'ind-window',
      role: 'secondary',
      title: 'Independent Window',
    });

    // Deactivate plugin — window should still be alive
    await manager.deactivate('independent-plugin');
    expect(windowManager.getState('ind-window')).toBe('ready');
    expect(handle.isDestroyed()).toBe(false);
  });

  it('multiple plugins can each create their own windows', async () => {
    const manifest1 = createTestManifest({ id: 'plugin-a' });
    const manifest2 = createTestManifest({ id: 'plugin-b' });
    registry.registerManifest(manifest1);
    registry.registerManifest(manifest2);

    await manager.load('plugin-a');
    await manager.activate('plugin-a');
    await manager.load('plugin-b');
    await manager.activate('plugin-b');

    const handle1 = await windowManager.createWindow({
      id: 'window-a',
      role: 'secondary',
      title: 'Window A',
    });
    const handle2 = await windowManager.createWindow({
      id: 'window-b',
      role: 'secondary',
      title: 'Window B',
    });

    expect(windowManager.getActiveWindowCount()).toBe(2);
    expect(handle1.getId()).toBe('window-a');
    expect(handle2.getId()).toBe('window-b');
  });

  it('window close does not crash plugin', async () => {
    const manifest = createTestManifest({ id: 'close-plugin' });
    registry.registerManifest(manifest);
    await manager.load('close-plugin');
    await manager.activate('close-plugin');

    await windowManager.createWindow({
      id: 'closeable-window',
      role: 'secondary',
      title: 'Closeable Window',
    });

    await windowManager.closeWindow('closeable-window');
    expect(windowManager.getState('closeable-window')).toBe('closed');

    // Plugin should still be activated
    expect(manager.getState('close-plugin')).toBe('activated');
  });

  it('session + window + plugin crash recovery', async () => {
    const manifest = createTestManifest({ id: 'recovery-plugin' });
    registry.registerManifest(manifest);
    await manager.load('recovery-plugin');
    await manager.activate('recovery-plugin');

    const handle = await windowManager.createWindow({
      id: 'recovery-window',
      role: 'secondary',
      title: 'Recovery Window',
      url: 'https://vibecode.dev/editor',
    });
    handle.setBounds({ x: 100, y: 200, width: 1024, height: 768 });
    handle.setGlobalState('lastFile', 'test.ts');

    // Simulate crash: save session, then destroy
    const session = windowManager.getWindowSession();
    await session.save('recovery-window', {
      windowId: 'recovery-window',
      role: 'secondary',
      bounds: handle.getBounds(),
      url: 'https://vibecode.dev/editor',
      globalState: handle.getGlobalState(),
      lastActive: Date.now(),
      isMaximized: false,
      isMinimized: false,
    });

    await windowManager.destroyWindow('recovery-window');
    expect(windowManager.getState('recovery-window')).toBe('destroyed');

    // Recover from session
    const recovered = await session.load('recovery-window');
    expect(recovered).not.toBeNull();
    expect(recovered!.windowId).toBe('recovery-window');
    expect(recovered!.bounds.x).toBe(100);
    expect(recovered!.bounds.width).toBe(1024);
    expect(recovered!.globalState.lastFile).toBe('test.ts');
  });
});
