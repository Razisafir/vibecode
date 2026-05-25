// Phase 10: Tray Manager Tests
// Covers tray.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { TrayManager } from '../../system/runtime/tray';
import type { TrayConfig, TrayMenuItem } from '../../system/runtime/tray';

describe('TrayManager', () => {
  let tray: TrayManager;

  beforeEach(() => {
    tray = new TrayManager();
  });

  it('is not visible by default', () => {
    expect(tray.isTrayVisible()).toBe(false);
  });

  it('configure sets up tray', () => {
    tray.configure({
      iconPath: '/path/to/icon.png',
      tooltip: 'VibeCode',
      menuItems: [{ label: 'Show Window' }],
    });
    expect(tray.getConfig()).not.toBeNull();
    expect(tray.getConfig()!.tooltip).toBe('VibeCode');
  });

  it('show makes tray visible', () => {
    tray.configure({
      iconPath: '/path/to/icon.png',
      tooltip: 'VibeCode',
      menuItems: [],
    });
    tray.show();
    expect(tray.isTrayVisible()).toBe(true);
  });

  it('show throws when not configured', () => {
    expect(() => tray.show()).toThrow('not configured');
  });

  it('hide makes tray invisible', () => {
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [] });
    tray.show();
    tray.hide();
    expect(tray.isTrayVisible()).toBe(false);
  });

  it('setTooltip updates tooltip text', () => {
    tray.setTooltip('New Tooltip');
    expect(tray.getTooltip()).toBe('New Tooltip');
  });

  it('updateMenu updates menu items', () => {
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [{ label: 'Old' }] });
    const newItems: TrayMenuItem[] = [{ label: 'New Item' }];
    tray.updateMenu(newItems);
    expect(tray.getConfig()!.menuItems).toEqual(newItems);
  });

  it('destroy clears all state', () => {
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [] });
    tray.show();
    tray.destroy();
    expect(tray.isTrayVisible()).toBe(false);
    expect(tray.getConfig()).toBeNull();
    expect(tray.getTooltip()).toBe('');
  });

  it('emits tray:configured event', () => {
    let eventFired = false;
    tray.on('tray:configured', () => { eventFired = true; });
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [] });
    expect(eventFired).toBe(true);
  });

  it('emits tray:shown event', () => {
    let eventFired = false;
    tray.on('tray:shown', () => { eventFired = true; });
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [] });
    tray.show();
    expect(eventFired).toBe(true);
  });

  it('emits tray:hidden event', () => {
    let eventFired = false;
    tray.on('tray:hidden', () => { eventFired = true; });
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [] });
    tray.show();
    tray.hide();
    expect(eventFired).toBe(true);
  });

  it('emits tray:destroyed event', () => {
    let eventFired = false;
    tray.on('tray:destroyed', () => { eventFired = true; });
    tray.configure({ iconPath: '/icon.png', tooltip: 'Test', menuItems: [] });
    tray.destroy();
    expect(eventFired).toBe(true);
  });
});
