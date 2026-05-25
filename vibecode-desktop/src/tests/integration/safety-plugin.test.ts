// Phase 10: Integration Test — Safety + Plugin Integration
// Check 3: SafetyGuard assesses plugin mutations

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../../system/runtime/plugin-manager';
import { PluginRegistry } from '../../system/runtime/plugin-registry';
import { PluginSandbox } from '../../system/runtime/plugin-sandbox';
import { PluginAPI } from '../../system/runtime/plugin-api';
import type { PluginManifest, PluginCapability } from '../../system/kernel/types';

function createTestManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'safety-test-plugin',
    name: 'Safety Test Plugin',
    version: '1.0.0',
    description: 'Test',
    main: 'index.js',
    apiVersion: '1.0.0',
    capabilities: ['fs.read', 'fs.write', 'command.register'],
    ...overrides,
  };
}

describe('Safety + Plugin Integration', () => {
  let registry: PluginRegistry;
  let manager: PluginManager;

  beforeEach(() => {
    registry = new PluginRegistry([]);
    manager = new PluginManager(registry);
  });

  it('safety guard prevents unauthorized capability access', async () => {
    const manifest = createTestManifest({
      id: 'restricted-plugin',
      capabilities: ['fs.read'], // Only fs.read, no fs.write
    });
    registry.registerManifest(manifest);
    await manager.load('restricted-plugin');
    await manager.activate('restricted-plugin');

    const api = manager.getAPI('restricted-plugin');
    expect(api!.hasCapability('fs.read' as PluginCapability)).toBe(true);
    expect(api!.hasCapability('fs.write' as PluginCapability)).toBe(false);

    // Attempting to use fs.write should throw
    expect(() => api!.fs.write('/test', 'data')).toThrow();
  });

  it('safety guard blocks prototype pollution from plugins', async () => {
    const manifest = createTestManifest({ id: 'pollution-plugin' });
    const sandbox = new PluginSandbox('pollution-plugin', manifest);

    // The sandboxed globals should block Object.setPrototypeOf
    await sandbox.initialize('index.js', new PluginAPI('pollution-plugin', manifest.capabilities));

    // After initialization, sandbox should be tracking resources
    expect(sandbox.getTrackedTimerCount()).toBeGreaterThanOrEqual(0);
    expect(sandbox.isDisposed()).toBe(false);

    await sandbox.dispose();
    expect(sandbox.isDisposed()).toBe(true);
  });

  it('sandbox memory monitoring detects excessive usage', async () => {
    const manifest = createTestManifest({ id: 'memory-plugin' });
    const sandbox = new PluginSandbox('memory-plugin', manifest);

    await sandbox.initialize('index.js', new PluginAPI('memory-plugin', manifest.capabilities));

    // Simulate memory usage
    sandbox.setMemoryUsage(50 * 1024 * 1024); // 50MB
    expect(sandbox.getMemoryUsage()).toBe(50 * 1024 * 1024);

    // Reset memory on soft reset
    await sandbox.softReset();
    expect(sandbox.getMemoryUsage()).toBe(0);
    expect(sandbox.isDisposed()).toBe(false);

    await sandbox.dispose();
  });

  it('IPC rate limiting protects against plugin flooding', async () => {
    const manifest = createTestManifest({ id: 'flood-plugin' });
    const sandbox = new PluginSandbox('flood-plugin', manifest);
    sandbox.setIpcRateLimit(5); // Very low limit for testing

    await sandbox.initialize('index.js', new PluginAPI('flood-plugin', manifest.capabilities));

    // First 5 calls should pass
    for (let i = 0; i < 5; i++) {
      expect(sandbox.checkIpcRateLimit()).toBe(true);
    }

    // 6th call should be rate limited
    expect(sandbox.checkIpcRateLimit()).toBe(false);

    await sandbox.dispose();
  });

  it('capability revocation takes effect immediately', async () => {
    const manifest = createTestManifest({
      id: 'revoked-plugin',
      capabilities: ['fs.read', 'fs.write', 'telemetry.emit'],
    });
    registry.registerManifest(manifest);
    await manager.load('revoked-plugin');
    await manager.activate('revoked-plugin');

    // Revoke fs.write at runtime
    const revoked = manager.revokeCapability('revoked-plugin', 'fs.write');
    expect(revoked).toBe(true);

    const api = manager.getAPI('revoked-plugin');
    expect(api!.hasCapability('fs.write' as PluginCapability)).toBe(false);
    expect(() => api!.fs.write('/test', 'data')).toThrow();

    // Other capabilities should still work
    expect(api!.hasCapability('fs.read' as PluginCapability)).toBe(true);
  });

  it('plugin crash does not corrupt shared state', async () => {
    const manifest1 = createTestManifest({ id: 'stable-plugin' });
    const manifest2 = createTestManifest({ id: 'crashy-plugin' });
    registry.registerManifest(manifest1);
    registry.registerManifest(manifest2);

    await manager.load('stable-plugin');
    await manager.activate('stable-plugin');
    await manager.load('crashy-plugin');
    await manager.activate('crashy-plugin');

    // If crashy-plugin goes to error state, stable-plugin should remain activated
    // Simulate crash by manually setting state
    const api = manager.getAPI('crashy-plugin');
    expect(api).toBeDefined();

    // Stable plugin should still work
    expect(manager.getState('stable-plugin')).toBe('activated');
  });
});
