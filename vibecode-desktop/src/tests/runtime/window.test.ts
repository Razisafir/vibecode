// Phase 10: Window (Legacy) Tests
// Covers window.ts - the basic window manager (distinct from window-manager.ts)

import { describe, it, expect, beforeEach } from 'vitest';
import { WindowManager } from '../../system/runtime/window';
import type { WindowConfig } from '../../system/runtime/window';

describe('Window Manager (Legacy)', () => {
  let wm: WindowManager;

  beforeEach(() => {
    wm = new WindowManager();
  });

  it('creates a window with default config', () => {
    const state = wm.createWindow('win-1');
    expect(state.id).toBe('win-1');
    expect(state.bounds.width).toBe(1200);
    expect(state.bounds.height).toBe(800);
    expect(state.isMaximized).toBe(false);
    expect(state.isMinimized).toBe(false);
  });

  it('creates a window with custom config', () => {
    const state = wm.createWindow('win-2', { width: 900, height: 600, title: 'Custom' });
    expect(state.bounds.width).toBe(900);
    expect(state.bounds.height).toBe(600);
  });

  it('first window becomes main window', () => {
    wm.createWindow('main');
    wm.createWindow('secondary');
    expect(wm.getMainWindow()?.id).toBe('main');
  });

  it('getWindow returns window state', () => {
    wm.createWindow('test-win');
    const state = wm.getWindow('test-win');
    expect(state).toBeDefined();
    expect(state!.id).toBe('test-win');
  });

  it('getWindow returns undefined for unknown window', () => {
    expect(wm.getWindow('nonexistent')).toBeUndefined();
  });

  it('getAllWindows returns all windows', () => {
    wm.createWindow('a');
    wm.createWindow('b');
    expect(wm.getAllWindows()).toHaveLength(2);
  });

  it('updateBounds changes window bounds', () => {
    wm.createWindow('win');
    wm.updateBounds('win', { width: 1920, height: 1080 });
    const state = wm.getWindow('win');
    expect(state!.bounds.width).toBe(1920);
    expect(state!.bounds.height).toBe(1080);
  });

  it('updateBounds throws for unknown window', () => {
    expect(() => wm.updateBounds('nonexistent', { width: 100 })).toThrow('not found');
  });

  it('setMaximized changes maximized state', () => {
    wm.createWindow('win');
    wm.setMaximized('win', true);
    expect(wm.getWindow('win')!.isMaximized).toBe(true);
  });

  it('closeWindow removes window', () => {
    wm.createWindow('win');
    const result = wm.closeWindow('win');
    expect(result).toBe(true);
    expect(wm.getWindow('win')).toBeUndefined();
  });

  it('closeWindow returns false for unknown window', () => {
    expect(wm.closeWindow('nonexistent')).toBe(false);
  });

  it('closing main window promotes next window', () => {
    wm.createWindow('main');
    wm.createWindow('secondary');
    wm.closeWindow('main');
    expect(wm.getMainWindow()?.id).toBe('secondary');
  });

  it('closeAllWindows clears all windows', () => {
    wm.createWindow('a');
    wm.createWindow('b');
    wm.createWindow('c');
    const count = wm.closeAllWindows();
    expect(count).toBe(3);
    expect(wm.getWindowCount()).toBe(0);
    expect(wm.getMainWindow()).toBeUndefined();
  });

  it('getWindowCount returns correct count', () => {
    wm.createWindow('a');
    wm.createWindow('b');
    expect(wm.getWindowCount()).toBe(2);
  });

  it('getConfig returns window configuration', () => {
    const customWm = new WindowManager({ width: 1024, height: 768 });
    expect(customWm.getConfig().width).toBe(1024);
    expect(customWm.getConfig().height).toBe(768);
  });

  it('persistState returns all window states', () => {
    wm.createWindow('a');
    wm.createWindow('b');
    const state = wm.persistState();
    expect(Object.keys(state)).toHaveLength(2);
    expect(state['a']).toBeDefined();
    expect(state['b']).toBeDefined();
  });

  it('restoreState restores window states', () => {
    wm.createWindow('a');
    const saved = wm.persistState();
    wm.closeAllWindows();
    wm.restoreState(saved);
    expect(wm.getWindowCount()).toBe(1);
  });

  it('emits window:created event', () => {
    let eventFired = false;
    wm.on('window:created', () => { eventFired = true; });
    wm.createWindow('emit-test');
    expect(eventFired).toBe(true);
  });

  it('emits window:closed event', () => {
    let eventFired = false;
    wm.on('window:closed', () => { eventFired = true; });
    wm.createWindow('close-test');
    wm.closeWindow('close-test');
    expect(eventFired).toBe(true);
  });
});
