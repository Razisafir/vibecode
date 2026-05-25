// Phase 10: Menu Builder Tests
// Covers menu.ts

import { describe, it, expect } from 'vitest';
import { MenuBuilder } from '../../system/runtime/menu';
import type { MenuTemplate } from '../../system/runtime/menu';

describe('MenuBuilder', () => {
  it('builds an empty menu by default', () => {
    const menu = new MenuBuilder();
    expect(menu.build()).toEqual([]);
  });

  it('addFileMenu creates File menu with default items', () => {
    const menu = new MenuBuilder().addFileMenu();
    const result = menu.build();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('File');
    expect(result[0].submenu).toBeDefined();
    expect(result[0].submenu!.length).toBeGreaterThan(0);
  });

  it('addFileMenu includes extra items when provided', () => {
    const extra: MenuTemplate[] = [{ label: 'Export', click: () => {} }];
    const menu = new MenuBuilder().addFileMenu(extra);
    const result = menu.build();
    const fileMenu = result[0];
    expect(fileMenu.submenu!.some(item => item.label === 'Export')).toBe(true);
  });

  it('addEditMenu creates Edit menu', () => {
    const menu = new MenuBuilder().addEditMenu();
    const result = menu.build();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Edit');
    expect(result[0].submenu!.length).toBeGreaterThan(0);
  });

  it('addViewMenu creates View menu', () => {
    const menu = new MenuBuilder().addViewMenu();
    const result = menu.build();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('View');
  });

  it('addPluginMenu skips when no plugins', () => {
    const menu = new MenuBuilder().addPluginMenu([]);
    expect(menu.build()).toEqual([]);
  });

  it('addPluginMenu creates Plugins menu with items', () => {
    const plugins = [
      { id: 'plugin-a', name: 'Plugin A' },
      { id: 'plugin-b', name: 'Plugin B' },
    ];
    const menu = new MenuBuilder().addPluginMenu(plugins);
    const result = menu.build();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Plugins');
    expect(result[0].submenu!).toHaveLength(2);
  });

  it('addHelpMenu creates Help menu', () => {
    const menu = new MenuBuilder().addHelpMenu();
    const result = menu.build();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Help');
  });

  it('addItem adds custom item', () => {
    const menu = new MenuBuilder().addItem({ label: 'Custom', type: 'normal' });
    const result = menu.build();
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Custom');
  });

  it('full menu chain works', () => {
    const menu = new MenuBuilder()
      .addFileMenu()
      .addEditMenu()
      .addViewMenu()
      .addPluginMenu([{ id: 'test', name: 'Test Plugin' }])
      .addHelpMenu();
    const result = menu.build();
    expect(result.length).toBe(5);
  });

  it('reset clears all menu items', () => {
    const menu = new MenuBuilder().addFileMenu().addEditMenu().reset();
    expect(menu.build()).toEqual([]);
  });

  it('build returns a copy of the template', () => {
    const menu = new MenuBuilder().addFileMenu();
    const result1 = menu.build();
    const result2 = menu.build();
    expect(result1).not.toBe(result2);
  });
});
