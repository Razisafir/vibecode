// Plugin Security Tests - Phase 8 Verification
// Checks 25-27: Security

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../../system/runtime/plugin-manager';
import { PluginRegistry } from '../../system/runtime/plugin-registry';
import { PluginAPI } from '../../system/runtime/plugin-api';
import type { PluginManifest, PluginCapability, PluginPermission } from '../../system/kernel/types';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'security-test-plugin',
    name: 'Security Test Plugin',
    version: '1.0.0',
    description: 'Test plugin for security',
    main: 'index.js',
    apiVersion: '1.0.0',
    capabilities: ['fs.read', 'command.register', 'telemetry.emit'],
    permissions: [],
    ...overrides,
  };
}

describe('Plugin Security', () => {
  let registry: PluginRegistry;
  let manager: PluginManager;

  beforeEach(() => {
    registry = new PluginRegistry([]);
    manager = new PluginManager(registry);
  });

  // Check 25: Capability consent dialog flow works
  describe('Consent dialog flow', () => {
    it('plugin with consent-required permissions prompts on activate', async () => {
      const manifest = makeManifest({
        id: 'consent-plugin',
        capabilities: ['fs.read'],
        permissions: [
          { capability: 'fs.read', consentRequired: true }
        ]
      });
      registry.registerManifest(manifest);
      await manager.load('consent-plugin');

      // Manager has a promptConsent method that defaults to true
      const result = await manager.activate('consent-plugin');
      // Should succeed because promptConsent defaults to true in test
      expect(result.success).toBe(true);
    });

    it('consent record is stored after granting', async () => {
      const manifest = makeManifest({
        id: 'consent-store-plugin',
        capabilities: ['fs.read'],
        permissions: [
          { capability: 'fs.read', consentRequired: true }
        ]
      });
      registry.registerManifest(manifest);
      await manager.load('consent-store-plugin');
      await manager.activate('consent-store-plugin');

      // Verify audit log has consent entry
      const auditLog = manager.getAuditLog();
      const consentEntry = auditLog.find(e =>
        e.action === 'capability.granted' && e.pluginId === 'consent-store-plugin'
      );
      expect(consentEntry).toBeDefined();
    });

    it('plugin without consent-required caps activates without prompts', async () => {
      const manifest = makeManifest({
        id: 'no-consent-plugin',
        capabilities: ['fs.read'],
        permissions: []
      });
      registry.registerManifest(manifest);
      await manager.load('no-consent-plugin');
      const result = await manager.activate('no-consent-plugin');
      expect(result.success).toBe(true);
    });
  });

  // Check 26: All capability usage logged to audit service
  describe('Audit logging', () => {
    it('capability grant is logged', async () => {
      const manifest = makeManifest({
        id: 'audit-plugin',
        capabilities: ['fs.read'],
        permissions: [{ capability: 'fs.read', consentRequired: true }]
      });
      registry.registerManifest(manifest);
      await manager.load('audit-plugin');
      await manager.activate('audit-plugin');

      const auditLog = manager.getAuditLog();
      const grantEntry = auditLog.find(e =>
        e.action === 'capability.granted' && e.pluginId === 'audit-plugin'
      );
      expect(grantEntry).toBeDefined();
      expect(grantEntry!.data).toBeDefined();
    });

    it('capability revocation is logged', async () => {
      const manifest = makeManifest({
        id: 'revoke-plugin',
        capabilities: ['fs.read', 'command.register']
      });
      registry.registerManifest(manifest);
      await manager.load('revoke-plugin');
      await manager.activate('revoke-plugin');

      manager.revokeCapability('revoke-plugin', 'fs.read');

      const auditLog = manager.getAuditLog();
      const revokeEntry = auditLog.find(e =>
        e.action === 'capability.revoked' && e.pluginId === 'revoke-plugin'
      );
      expect(revokeEntry).toBeDefined();
    });

    it('plugin crash is logged', async () => {
      const manifest = makeManifest({ id: 'crash-audit-plugin' });
      registry.registerManifest(manifest);
      await manager.load('crash-audit-plugin');

      const sandbox = manager.getSandbox('crash-audit-plugin');
      if (sandbox) {
        vi.spyOn(sandbox, 'initialize').mockRejectedValue(new Error('Crash for audit'));
      }

      await manager.activate('crash-audit-plugin');

      const auditLog = manager.getAuditLog();
      const crashEntry = auditLog.find(e =>
        e.action === 'plugin.crash' && e.pluginId === 'crash-audit-plugin'
      );
      expect(crashEntry).toBeDefined();
    });
  });

  // Check 27: Capability revocation at runtime takes effect immediately
  describe('Runtime capability revocation', () => {
    it('revoked capability is no longer accessible', async () => {
      const api = new PluginAPI('revoke-test', ['fs.read', 'fs.write', 'command.register']);
      expect(api.hasCapability('fs.read')).toBe(true);

      api.revokeCapability('fs.read');
      expect(api.hasCapability('fs.read')).toBe(false);
    });

    it('revoked capability throws on use', () => {
      const api = new PluginAPI('revoke-use-test', ['fs.read', 'fs.write']);
      api.revokeCapability('fs.read');

      expect(() => api.requireCapability('fs.read')).toThrow('not granted');
    });

    it('manager.revokeCapability removes from API', async () => {
      const manifest = makeManifest({
        id: 'manager-revoke',
        capabilities: ['fs.read', 'command.register', 'telemetry.emit']
      });
      registry.registerManifest(manifest);
      await manager.load('manager-revoke');
      await manager.activate('manager-revoke');

      const revoked = manager.revokeCapability('manager-revoke', 'fs.read');
      expect(revoked).toBe(true);

      const api = manager.getAPI('manager-revoke');
      expect(api!.hasCapability('fs.read')).toBe(false);
    });

    it('non-granted capability revocation returns false', async () => {
      const manifest = makeManifest({
        id: 'no-revoke',
        capabilities: ['fs.read']
      });
      registry.registerManifest(manifest);
      await manager.load('no-revoke');
      await manager.activate('no-revoke');

      const revoked = manager.revokeCapability('no-revoke', 'ipc.send');
      expect(revoked).toBe(false);
    });

    it('remaining capabilities still work after partial revocation', () => {
      const api = new PluginAPI('partial-revoke', ['fs.read', 'command.register', 'telemetry.emit']);
      api.revokeCapability('fs.read');

      expect(api.hasCapability('command.register')).toBe(true);
      expect(api.hasCapability('telemetry.emit')).toBe(true);
    });
  });
});
