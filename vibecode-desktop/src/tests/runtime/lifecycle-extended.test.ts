// VibeCode Phase 11: Extended Lifecycle Tests
// Tests for boot() and cleanupAndQuit() exports

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerLifecycleHook,
  executeStartup,
  executeShutdown,
  clearLifecycleHooks,
  boot,
  cleanupAndQuit,
} from '../../system/runtime/lifecycle';
import type { LifecycleHook } from '../../system/runtime/lifecycle';

describe('Lifecycle - Phase 11 Extended', () => {
  beforeEach(() => {
    clearLifecycleHooks();
  });

  afterEach(() => {
    clearLifecycleHooks();
  });

  describe('boot()', () => {
    it('executes all startup hooks', async () => {
      const hook: LifecycleHook = {
        onStartup: vi.fn().mockResolvedValue(undefined),
        onShutdown: vi.fn().mockResolvedValue(undefined),
      };
      registerLifecycleHook(hook);
      await boot();
      expect(hook.onStartup).toHaveBeenCalledTimes(1);
    });

    it('executes multiple startup hooks in order', async () => {
      const order: string[] = [];
      registerLifecycleHook({
        onStartup: vi.fn().mockImplementation(async () => { order.push('first'); }),
        onShutdown: vi.fn().mockResolvedValue(undefined),
      });
      registerLifecycleHook({
        onStartup: vi.fn().mockImplementation(async () => { order.push('second'); }),
        onShutdown: vi.fn().mockResolvedValue(undefined),
      });
      await boot();
      expect(order).toEqual(['first', 'second']);
    });
  });

  describe('cleanupAndQuit()', () => {
    it('executes shutdown hooks in reverse order and clears them', async () => {
      const order: string[] = [];
      registerLifecycleHook({
        onStartup: vi.fn().mockResolvedValue(undefined),
        onShutdown: vi.fn().mockImplementation(async () => { order.push('first-shutdown'); }),
      });
      registerLifecycleHook({
        onStartup: vi.fn().mockResolvedValue(undefined),
        onShutdown: vi.fn().mockImplementation(async () => { order.push('second-shutdown'); }),
      });

      await cleanupAndQuit();
      expect(order).toEqual(['second-shutdown', 'first-shutdown']);
    });

    it('clears hooks after cleanup', async () => {
      const hook: LifecycleHook = {
        onStartup: vi.fn().mockResolvedValue(undefined),
        onShutdown: vi.fn().mockResolvedValue(undefined),
      };
      registerLifecycleHook(hook);
      await cleanupAndQuit();

      // Re-register and verify previous hooks are gone
      const hook2: LifecycleHook = {
        onStartup: vi.fn().mockResolvedValue(undefined),
        onShutdown: vi.fn().mockResolvedValue(undefined),
      };
      registerLifecycleHook(hook2);
      await boot();
      expect(hook.onStartup).toHaveBeenCalledTimes(0); // Was cleared
      expect(hook2.onStartup).toHaveBeenCalledTimes(1); // New hook works
    });
  });
});
