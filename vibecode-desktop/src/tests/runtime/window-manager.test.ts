// Window Manager & Handle Tests - Phase 9 Verification
// Checks 1-7: Window Lifecycle, Checks 8-12: Window Handle

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WindowManager } from '../../system/runtime/window-manager';
import { WindowHandle } from '../../system/runtime/window-handle';
import type { WindowConfig, WindowState } from '../../system/kernel/types';

function makeConfig(overrides: Partial<WindowConfig> = {}): WindowConfig {
  return {
    id: 'test-window',
    role: 'secondary',
    title: 'Test Window',
    url: 'test://window',
    ...overrides,
  };
}

const mainConfig = () => makeConfig({ id: 'main', role: 'main', title: 'Main Window' });

describe('WindowManager - Window Lifecycle', () => {
  let manager: WindowManager;

  beforeEach(() => {
    manager = new WindowManager();
  });

  // Check 1: All valid WindowState transitions succeed
  describe('State machine valid transitions', () => {
    it('creating → ready (on create)', async () => {
      const handle = await manager.createWindow(makeConfig());
      expect(manager.getState('test-window')).toBe('ready');
    });

    it('ready → minimized', async () => {
      const handle = await manager.createWindow(makeConfig());
      handle.setMinimized(true);
      expect(manager.getState('test-window')).toBe('minimized');
    });

    it('ready → maximized', async () => {
      const handle = await manager.createWindow(makeConfig());
      handle.setMaximized(true);
      expect(manager.getState('test-window')).toBe('maximized');
    });

    it('maximized → ready', async () => {
      const handle = await manager.createWindow(makeConfig());
      handle.setMaximized(true);
      handle.setMaximized(false);
      expect(manager.getState('test-window')).toBe('ready');
    });

    it('minimized → ready', async () => {
      const handle = await manager.createWindow(makeConfig());
      handle.setMinimized(true);
      handle.setMinimized(false);
      expect(manager.getState('test-window')).toBe('ready');
    });

    it('ready → closed', async () => {
      await manager.createWindow(makeConfig());
      const result = await manager.closeWindow('test-window');
      expect(result).toBe(true);
      expect(manager.getState('test-window')).toBe('closed');
    });

    it('closed → destroyed', async () => {
      await manager.createWindow(makeConfig());
      await manager.closeWindow('test-window');
      const result = await manager.destroyWindow('test-window');
      expect(result).toBe(true);
      expect(manager.getState('test-window')).toBe('destroyed');
    });
  });

  // Check 2: Invalid state transitions are rejected
  describe('Invalid state transitions rejected', () => {
    it('close already closed window', async () => {
      await manager.createWindow(makeConfig());
      await manager.closeWindow('test-window');
      const result = await manager.closeWindow('test-window');
      expect(result).toBe(false);
    });

    it('destroy already destroyed window', async () => {
      await manager.createWindow(makeConfig());
      await manager.closeWindow('test-window');
      await manager.destroyWindow('test-window');
      const result = await manager.destroyWindow('test-window');
      expect(result).toBe(false);
    });

    it('cannot create window with duplicate main role', async () => {
      await manager.createWindow(mainConfig());
      await expect(manager.createWindow(mainConfig())).rejects.toThrow('Main window already exists');
    });
  });

  // Check 3: Main window is always tracked and cannot be duplicated
  describe('Main window tracking', () => {
    it('main window ID is tracked', async () => {
      await manager.createWindow(mainConfig());
      expect(manager.getMainWindowId()).toBe('main');
    });

    it('secondary window is not main', async () => {
      await manager.createWindow(makeConfig());
      expect(manager.getMainWindowId()).toBeNull();
    });

    it('cannot create two main windows', async () => {
      await manager.createWindow(mainConfig());
      await expect(manager.createWindow(makeConfig({ id: 'main2', role: 'main' }))).rejects.toThrow('duplicate');
    });

    it('main window ID cleared after destroy', async () => {
      await manager.createWindow(mainConfig());
      await manager.closeWindow('main');
      await manager.destroyWindow('main');
      expect(manager.getMainWindowId()).toBeNull();
    });
  });

  // Check 4: Shutdown ordering: secondary windows close before main window
  describe('Shutdown ordering', () => {
    it('secondary windows close before main window', async () => {
      const closeOrder: string[] = [];

      await manager.createWindow(mainConfig());
      await manager.createWindow(makeConfig({ id: 'sec1' }));
      await manager.createWindow(makeConfig({ id: 'sec2' }));

      manager.on('window-state-change', (e: any) => {
        if (e.toState === 'closed') closeOrder.push(e.windowId);
      });

      await manager.shutdown();

      // Main should be last to close
      const mainIdx = closeOrder.indexOf('main');
      const sec1Idx = closeOrder.indexOf('sec1');
      const sec2Idx = closeOrder.indexOf('sec2');
      expect(mainIdx).toBeGreaterThan(sec1Idx);
      expect(mainIdx).toBeGreaterThan(sec2Idx);
    });
  });

  // Check 5: Maximum window count enforced
  describe('Maximum window count', () => {
    it('default max is 10', () => {
      expect(manager.getMaxWindows()).toBe(10);
    });

    it('exceeding max throws error', async () => {
      const small = new WindowManager({ multiWindow: { maxWindows: 2 } } as any);
      await small.createWindow(makeConfig({ id: 'w1' }));
      await small.createWindow(makeConfig({ id: 'w2' }));
      await expect(small.createWindow(makeConfig({ id: 'w3' }))).rejects.toThrow('Maximum window count');
    });

    it('max windows configurable', () => {
      manager.setMaxWindows(5);
      expect(manager.getMaxWindows()).toBe(5);
    });

    it('closed windows do not count toward max', async () => {
      const small = new WindowManager({ multiWindow: { maxWindows: 2 } } as any);
      await small.createWindow(makeConfig({ id: 'w1' }));
      await small.createWindow(makeConfig({ id: 'w2' }));
      await small.closeWindow('w1');
      // Should be able to create a new one
      await expect(small.createWindow(makeConfig({ id: 'w3' }))).resolves.toBeDefined();
    });
  });

  // Check 6: Window state change events emitted correctly
  describe('State change events', () => {
    it('emits window-state-change on close', async () => {
      await manager.createWindow(makeConfig());
      const listener = vi.fn();
      manager.on('window-state-change', listener);
      await manager.closeWindow('test-window');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].toState).toBe('closed');
    });

    it('emits window:closed event', async () => {
      await manager.createWindow(makeConfig());
      const listener = vi.fn();
      manager.on('window:closed', listener);
      await manager.closeWindow('test-window');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits window:destroyed event', async () => {
      await manager.createWindow(makeConfig());
      await manager.closeWindow('test-window');
      const listener = vi.fn();
      manager.on('window:destroyed', listener);
      await manager.destroyWindow('test-window');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('event includes windowId and fromState/toState', async () => {
      await manager.createWindow(makeConfig());
      const listener = vi.fn();
      manager.on('window-state-change', listener);
      await manager.closeWindow('test-window');
      const event = listener.mock.calls[0][0];
      expect(event.windowId).toBe('test-window');
      expect(event.fromState).toBe('ready');
      expect(event.toState).toBe('closed');
      expect(event.timestamp).toBeDefined();
    });
  });

  // Check 7: Destroyed window is cleaned up from registry
  describe('Destroyed window cleanup', () => {
    it('destroyed window removed from handles', async () => {
      await manager.createWindow(makeConfig());
      expect(manager.getHandle('test-window')).toBeDefined();
      await manager.closeWindow('test-window');
      await manager.destroyWindow('test-window');
      expect(manager.getHandle('test-window')).toBeUndefined();
    });

    it('destroyed window not in active windows', async () => {
      await manager.createWindow(makeConfig());
      await manager.closeWindow('test-window');
      await manager.destroyWindow('test-window');
      expect(manager.getActiveWindows().find(w => w.id === 'test-window')).toBeUndefined();
    });

    it('destroyed window not in getAllWindowIds', async () => {
      await manager.createWindow(makeConfig());
      await manager.closeWindow('test-window');
      await manager.destroyWindow('test-window');
      expect(manager.getAllWindowIds()).not.toContain('test-window');
    });
  });
});

describe('WindowHandle', () => {
  let handle: WindowHandle;
  const stateCallback = vi.fn();
  const sendCallback = vi.fn();

  beforeEach(() => {
    stateCallback.mockReset();
    sendCallback.mockReset();
    handle = new WindowHandle('test', 'secondary', {
      onStateChange: stateCallback,
      onSend: sendCallback,
    });
  });

  // Check 8: WindowHandle does NOT hold direct BrowserWindow references
  describe('No direct BrowserWindow references', () => {
    it('handle has no browserWindow property', () => {
      expect((handle as any).browserWindow).toBeUndefined();
      expect((handle as any)._browserWindow).toBeUndefined();
      expect((handle as any).window).toBeUndefined();
    });

    it('handle uses callbacks instead of direct refs', () => {
      expect(typeof handle.send).toBe('function');
      handle.send('test-channel', { data: 1 });
      expect(sendCallback).toHaveBeenCalledWith('test-channel', { data: 1 });
    });
  });

  // Check 9: isDestroyed() returns true after window close
  describe('isDestroyed', () => {
    it('returns false initially', () => {
      expect(handle.isDestroyed()).toBe(false);
    });

    it('returns true after destroy()', () => {
      handle.destroy();
      expect(handle.isDestroyed()).toBe(true);
    });
  });

  // Check 10: send() throws or no-ops after window destroyed
  describe('send after destroy', () => {
    it('send throws after destroy', () => {
      handle.destroy();
      expect(() => handle.send('test', {})).toThrow('destroyed');
    });
  });

  // Check 11: State queries work correctly
  describe('State queries', () => {
    it('isFocused works', () => {
      expect(handle.isFocused()).toBe(false);
      handle.setFocused(true);
      expect(handle.isFocused()).toBe(true);
    });

    it('isMinimized works', () => {
      expect(handle.isMinimized()).toBe(false);
      handle.setMinimized(true);
      expect(handle.isMinimized()).toBe(true);
    });

    it('isMaximized works', () => {
      expect(handle.isMaximized()).toBe(false);
      handle.setMaximized(true);
      expect(handle.isMaximized()).toBe(true);
    });

    it('state queries return false after destroy', () => {
      handle.setFocused(true);
      handle.destroy();
      expect(handle.isFocused()).toBe(false);
      expect(handle.isMinimized()).toBe(false);
      expect(handle.isMaximized()).toBe(false);
    });
  });

  // Check 12: Disposable event listeners are cleaned up on destroy
  describe('Disposable cleanup', () => {
    it('addDisposable tracks cleanup functions', () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      handle.addDisposable(dispose1);
      handle.addDisposable(dispose2);
      handle.destroy();
      expect(dispose1).toHaveBeenCalledTimes(1);
      expect(dispose2).toHaveBeenCalledTimes(1);
    });

    it('all listeners removed on destroy', () => {
      const listener = vi.fn();
      handle.on('test-event', listener);
      handle.destroy();
      handle.emit('test-event');
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
