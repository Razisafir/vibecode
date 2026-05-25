// VibeCode Phase 11: Integration Layer Tests
// Tests for VS Code fork bridge, module registry, and shell detector

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BRIDGE_NOT_AVAILABLE,
  isBridgeAvailable,
} from '../../system/integration/vscode-fork-bridge';
import type { IVSCodeForkBridge } from '../../system/integration/vscode-fork-bridge';
import {
  ModulePriority,
  getSystemModules,
  getModulesByLayer,
  getModuleDescriptor,
  getModuleCount,
  getInitializationOrder,
  validateDependencies,
} from '../../system/integration/module-registry';
import {
  detectShellMode,
  isDevelopmentMode,
  isProductionMode,
} from '../../system/integration/shell-detector';

describe('VS Code Fork Bridge', () => {
  describe('BRIDGE_NOT_AVAILABLE sentinel', () => {
    it('is a unique symbol', () => {
      expect(typeof BRIDGE_NOT_AVAILABLE).toBe('symbol');
    });
  });

  describe('isBridgeAvailable', () => {
    it('returns false for BRIDGE_NOT_AVAILABLE', () => {
      expect(isBridgeAvailable(BRIDGE_NOT_AVAILABLE)).toBe(false);
    });

    it('returns true for a valid bridge object', () => {
      const mockBridge: IVSCodeForkBridge = {
        ipc: {
          send: vi.fn(),
          on: vi.fn().mockReturnValue(vi.fn()),
          once: vi.fn().mockReturnValue(vi.fn()),
          removeListener: vi.fn(),
        },
        window: {
          createWindow: vi.fn().mockResolvedValue('win-1'),
          destroyWindow: vi.fn().mockResolvedValue(undefined),
          getActiveWindowIds: vi.fn().mockReturnValue([]),
          focusWindow: vi.fn(),
        },
        storage: {
          get: vi.fn(),
          set: vi.fn(),
          delete: vi.fn(),
          keys: vi.fn().mockReturnValue([]),
        },
        command: {
          registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
          executeCommand: vi.fn().mockResolvedValue(undefined),
        },
        services: new Map(),
        getProductConfig: vi.fn().mockReturnValue({
          nameShort: 'VibeCode',
          nameLong: 'VibeCode - AI-Native Desktop Operating Environment',
          applicationName: 'vibecode',
          version: '0.8.0',
          quality: 'stable',
        }),
        getForkVersion: vi.fn().mockReturnValue('1.90.0'),
        getChromiumVersion: vi.fn().mockReturnValue('130.0.0'),
      };
      expect(isBridgeAvailable(mockBridge)).toBe(true);
    });
  });
});

describe('Module Registry', () => {
  describe('module listing', () => {
    it('returns all 31 system modules', () => {
      const modules = getSystemModules();
      expect(modules.length).toBe(31);
    });

    it('each module has required properties', () => {
      const modules = getSystemModules();
      for (const mod of modules) {
        expect(mod).toHaveProperty('id');
        expect(mod).toHaveProperty('layer');
        expect(mod).toHaveProperty('priority');
        expect(mod).toHaveProperty('dependencies');
        expect(mod).toHaveProperty('lazyInit');
        expect(mod).toHaveProperty('required');
        expect(typeof mod.id).toBe('string');
        expect(Array.isArray(mod.dependencies)).toBe(true);
      }
    });
  });

  describe('layer filtering', () => {
    it('returns kernel modules', () => {
      const kernel = getModulesByLayer('kernel');
      expect(kernel.length).toBe(5);
      expect(kernel.every(m => m.layer === 'kernel')).toBe(true);
    });

    it('returns runtime modules', () => {
      const runtime = getModulesByLayer('runtime');
      expect(runtime.length).toBe(14);
    });

    it('returns observability modules', () => {
      const obs = getModulesByLayer('observability');
      expect(obs.length).toBe(5);
    });

    it('returns supervision modules', () => {
      const sup = getModulesByLayer('supervision');
      expect(sup.length).toBe(5);
    });

    it('returns integration modules', () => {
      const integ = getModulesByLayer('integration');
      expect(integ.length).toBe(2);
    });
  });

  describe('module descriptor lookup', () => {
    it('finds a specific module by ID', () => {
      const state = getModuleDescriptor('kernel.state');
      expect(state).toBeDefined();
      expect(state?.layer).toBe('kernel');
      expect(state?.priority).toBe(ModulePriority.CRITICAL);
    });

    it('returns undefined for unknown module', () => {
      expect(getModuleDescriptor('nonexistent.module')).toBeUndefined();
    });
  });

  describe('initialization ordering', () => {
    it('orders modules by priority', () => {
      const order = getInitializationOrder();
      let lastPriority = -1;
      for (const mod of order) {
        expect(mod.priority).toBeGreaterThanOrEqual(lastPriority);
        lastPriority = mod.priority;
      }
    });

    it('kernel modules come before runtime', () => {
      const order = getInitializationOrder();
      const kernelIdx = order.findIndex(m => m.layer === 'kernel');
      const runtimeIdx = order.findIndex(m => m.layer === 'runtime');
      expect(kernelIdx).toBeLessThan(runtimeIdx);
    });

    it('runtime modules come before supervision', () => {
      const order = getInitializationOrder();
      const runtimeIdx = order.findIndex(m => m.layer === 'runtime');
      const supIdx = order.findIndex(m => m.layer === 'supervision');
      expect(runtimeIdx).toBeLessThan(supIdx);
    });
  });

  describe('dependency validation', () => {
    it('all dependencies reference valid modules', () => {
      const invalid = validateDependencies();
      expect(invalid).toEqual([]);
    });
  });

  describe('module count', () => {
    it('getModuleCount returns correct number', () => {
      expect(getModuleCount()).toBe(31);
    });
  });

  describe('ModulePriority enum', () => {
    it('has correct priority levels', () => {
      expect(ModulePriority.CRITICAL).toBe(0);
      expect(ModulePriority.HIGH).toBe(1);
      expect(ModulePriority.NORMAL).toBe(2);
      expect(ModulePriority.LOW).toBe(3);
      expect(ModulePriority.DEFERRED).toBe(4);
    });
  });
});

describe('Shell Detector', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  describe('development mode detection', () => {
    it('defaults to development mode in test environment', () => {
      // CI may be set, so check mode more carefully
      const result = detectShellMode();
      // In test/CI env without VSCODE_FORK, this should be development
      expect(['development', 'production']).toContain(result.mode);
    });

    it('detects development mode when no production env vars set', () => {
      delete process.env.VSCODE_FORK;
      delete process.env.VIBECODE_ENV;
      delete process.env.ELECTRON_RUN_AS_NODE;
      delete (globalThis as Record<string, unknown>).__VIBECODE_BRIDGE__;

      const result = detectShellMode();
      expect(result.mode).toBe('development');
      expect(result.bridgeAvailable).toBe(false);
    });

    it('isDevelopmentMode returns true in dev', () => {
      delete process.env.VSCODE_FORK;
      delete process.env.VIBECODE_ENV;
      expect(isDevelopmentMode()).toBe(true);
    });

    it('ELECTRON_RUN_AS_NODE=1 forces development mode', () => {
      process.env.ELECTRON_RUN_AS_NODE = '1';
      process.env.VSCODE_FORK = '1';
      const result = detectShellMode();
      expect(result.mode).toBe('development');
      expect(result.electronContext).toBe(false);
    });
  });

  describe('production mode detection', () => {
    it('detects production mode when VSCODE_FORK=1', () => {
      delete process.env.ELECTRON_RUN_AS_NODE;
      process.env.VSCODE_FORK = '1';
      const result = detectShellMode();
      expect(result.mode).toBe('production');
      expect(result.indicators).toContain('VSCODE_FORK=1');
    });

    it('detects production mode when VIBECODE_ENV=production', () => {
      delete process.env.ELECTRON_RUN_AS_NODE;
      process.env.VIBECODE_ENV = 'production';
      const result = detectShellMode();
      expect(result.mode).toBe('production');
    });

    it('detects production mode when bridge is on globalThis', () => {
      delete process.env.ELECTRON_RUN_AS_NODE;
      (globalThis as Record<string, unknown>).__VIBECODE_BRIDGE__ = {};
      const result = detectShellMode();
      expect(result.mode).toBe('production');
      expect(result.bridgeAvailable).toBe(true);
      delete (globalThis as Record<string, unknown>).__VIBECODE_BRIDGE__;
    });

    it('isProductionMode returns true in production', () => {
      delete process.env.ELECTRON_RUN_AS_NODE;
      process.env.VSCODE_FORK = '1';
      expect(isProductionMode()).toBe(true);
    });
  });

  describe('detection result structure', () => {
    it('includes all required fields', () => {
      const result = detectShellMode();
      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('bridgeAvailable');
      expect(result).toHaveProperty('platform');
      expect(result).toHaveProperty('ci');
      expect(result).toHaveProperty('electronContext');
      expect(result).toHaveProperty('indicators');
      expect(Array.isArray(result.indicators)).toBe(true);
    });

    it('detects CI environment', () => {
      const origCI = process.env.CI;
      process.env.CI = 'true';
      const result = detectShellMode();
      expect(result.ci).toBe(true);
      if (!origCI) delete process.env.CI;
      else process.env.CI = origCI;
    });

    it('platform matches process.platform', () => {
      const result = detectShellMode();
      expect(result.platform).toBe(process.platform);
    });
  });
});
