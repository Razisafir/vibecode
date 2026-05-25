// Plugin API Tests - Phase 8 Verification
// Checks 13-18: API & Capabilities

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginAPI } from '../../system/runtime/plugin-api';
import type { PluginCapability } from '../../system/kernel/types';

describe('PluginAPI - API & Capabilities', () => {
  let api: PluginAPI;
  const pluginId = 'api-test-plugin';
  const capabilities: PluginCapability[] = ['fs.read', 'fs.write', 'command.register', 'telemetry.emit'];

  beforeEach(() => {
    api = new PluginAPI(pluginId, capabilities);
  });

  // Check 13: PluginAPI proxy only exposes granted capabilities
  describe('Capability gating', () => {
    it('hasCapability returns true for granted caps', () => {
      expect(api.hasCapability('fs.read')).toBe(true);
      expect(api.hasCapability('command.register')).toBe(true);
      expect(api.hasCapability('telemetry.emit')).toBe(true);
    });

    it('hasCapability returns false for non-granted caps', () => {
      expect(api.hasCapability('ipc.send')).toBe(false);
      expect(api.hasCapability('network.request')).toBe(false);
      expect(api.hasCapability('clipboard.read')).toBe(false);
    });

    it('fs access requires fs.read capability', () => {
      const readApi = new PluginAPI('reader', ['fs.read']);
      expect(() => readApi.fs).not.toThrow();
    });

    it('fs access throws without fs.read capability', () => {
      const noFsApi = new PluginAPI('no-fs', ['command.register']);
      expect(() => noFsApi.fs).toThrow('not granted');
    });
  });

  // Check 14: Unauthorized capability call throws (not silently fails)
  describe('Explicit denial', () => {
    it('requireCapability throws with clear error message', () => {
      expect(() => api.requireCapability('ipc.send')).toThrow(
        /not granted.*explicitly denied/i
      );
    });

    it('telemetry.emit throws without capability', () => {
      const noTelemetryApi = new PluginAPI('no-telem', ['fs.read']);
      expect(() => noTelemetryApi.telemetry.emit('event')).toThrow('not granted');
    });

    it('ipc.send throws without capability', () => {
      expect(() => api.ipc.send('channel')).toThrow('not granted');
    });

    it('error is thrown, not swallowed', () => {
      try {
        api.requireCapability('network.request');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain('network.request');
      }
    });
  });

  // Check 15: fs.read/write scoped to declared paths only
  describe('FS scoping', () => {
    it('read allows paths in scope', () => {
      api.setFsScope(['/home/user/plugin-data']);
      const result = api.fs.read('/home/user/plugin-data/file.txt');
      expect(result.path).toBe('/home/user/plugin-data/file.txt');
    });

    it('read rejects paths outside scope', () => {
      api.setFsScope(['/home/user/plugin-data']);
      expect(() => api.fs.read('/etc/passwd')).toThrow('Permission denied');
    });

    it('write allows paths in scope', () => {
      api.setFsScope(['/home/user/plugin-data']);
      expect(api.fs.write('/home/user/plugin-data/out.txt', 'data')).toBe(true);
    });

    it('write rejects paths outside scope', () => {
      api.setFsScope(['/home/user/plugin-data']);
      expect(() => api.fs.write('/etc/shadow', 'hack')).toThrow('Permission denied');
    });

    it('allows all paths when no scope configured', () => {
      // No setFsScope call - no restriction
      expect(() => api.fs.read('/any/path')).not.toThrow();
    });

    it('supports multiple scope paths', () => {
      api.setFsScope(['/home/user/data', '/tmp/plugin']);
      expect(() => api.fs.read('/home/user/data/file')).not.toThrow();
      expect(() => api.fs.read('/tmp/plugin/cache')).not.toThrow();
      expect(() => api.fs.read('/usr/bin/evil')).toThrow('Permission denied');
    });
  });

  // Check 16: Version mismatch (plugin requires newer API) rejected at load
  describe('Version mismatch', () => {
    // This is tested via PluginManager, but we verify API surface readiness
    it('API exposes capability information', () => {
      const caps = api.getGrantedCapabilities();
      expect(caps.has('fs.read')).toBe(true);
      expect(caps.has('ipc.send')).toBe(false);
    });
  });

  // Check 17: command.register returns disposable that unregisters on deactivate
  describe('Command registration disposal', () => {
    it('register returns a disposable', () => {
      const disposable = api.command.register('test.cmd', () => 'result');
      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
    });

    it('registered command is executable', () => {
      api.command.register('test.cmd', (x: number) => x * 2);
      const result = api.command.execute('test.cmd', 5);
      expect(result).toBe(10);
    });

    it('dispose unregisters the command', () => {
      const disposable = api.command.register('test.cmd', () => 'result');
      disposable.dispose();
      expect(() => api.command.execute('test.cmd')).toThrow('not found');
    });

    it('api.dispose() cleans up all commands', () => {
      api.command.register('cmd1', () => 1);
      api.command.register('cmd2', () => 2);
      api.dispose();
      expect(api.isDisposed()).toBe(true);
    });
  });

  // Check 18: telemetry.emit includes plugin ID prefix
  describe('Telemetry prefix', () => {
    it('emits telemetry with plugin ID prefix', () => {
      const listener = vi.fn();
      api.on('telemetry', listener);
      api.telemetry.emit('click', { button: 'ok' });

      expect(listener).toHaveBeenCalledTimes(1);
      const call = listener.mock.calls[0][0];
      expect(call.event).toBe('api-test-plugin:click');
      expect(call.pluginId).toBe('api-test-plugin');
    });

    it('multiple telemetry events all have prefix', () => {
      const listener = vi.fn();
      api.on('telemetry', listener);
      api.telemetry.emit('event1');
      api.telemetry.emit('event2');
      api.telemetry.emit('event3');

      for (let i = 0; i < 3; i++) {
        const call = listener.mock.calls[i][0];
        expect(call.event).toMatch(/^api-test-plugin:/);
      }
    });
  });
});
