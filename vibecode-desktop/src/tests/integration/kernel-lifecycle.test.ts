// Kernel Lifecycle Integration Test Suite (Phase 6)
import { describe, it, expect, beforeEach } from 'vitest';
import { registerLifecycleHook, executeStartup, executeShutdown, clearLifecycleHooks } from '../../system/runtime/lifecycle';
import type { LifecycleHook } from '../../system/runtime/lifecycle';
import { getStateManager, resetStateManager } from '../../system/kernel/state';

describe('Kernel Lifecycle Integration', () => {
  beforeEach(() => {
    clearLifecycleHooks();
    resetStateManager();
  });

  it('should execute startup hooks in order', async () => {
    const order: string[] = [];
    registerLifecycleHook({
      onStartup: async () => { order.push('first'); },
      onShutdown: async () => {},
    });
    registerLifecycleHook({
      onStartup: async () => { order.push('second'); },
      onShutdown: async () => {},
    });
    await executeStartup();
    expect(order).toEqual(['first', 'second']);
  });

  it('should execute shutdown hooks in reverse order', async () => {
    const order: string[] = [];
    registerLifecycleHook({
      onStartup: async () => { order.push('startup-first'); },
      onShutdown: async () => { order.push('shutdown-first'); },
    });
    registerLifecycleHook({
      onStartup: async () => { order.push('startup-second'); },
      onShutdown: async () => { order.push('shutdown-second'); },
    });
    await executeStartup();
    await executeShutdown();
    expect(order).toEqual(['startup-first', 'startup-second', 'shutdown-second', 'shutdown-first']);
  });

  it('should integrate with state manager during lifecycle', async () => {
    const stateManager = getStateManager();
    registerLifecycleHook({
      onStartup: async () => {
        stateManager.setState('lifecycle-test', 'initializing');
        stateManager.setState('lifecycle-test', 'ready');
      },
      onShutdown: async () => {
        stateManager.setState('lifecycle-test', 'shutting_down');
      },
    });
    await executeStartup();
    expect(stateManager.getState('lifecycle-test')).toBe('ready');
    await executeShutdown();
    expect(stateManager.getState('lifecycle-test')).toBe('shutting_down');
  });

  it('should handle multiple hooks', async () => {
    for (let i = 0; i < 5; i++) {
      registerLifecycleHook({
        onStartup: async () => {},
        onShutdown: async () => {},
      });
    }
    await executeStartup();
    await executeShutdown();
    // If we get here, all hooks executed without error
    expect(true).toBe(true);
  });
});
