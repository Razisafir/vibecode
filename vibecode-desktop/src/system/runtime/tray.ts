// VibeCode System Runtime - Tray Manager v8.0
// Manages system tray icon with context menu

import { EventEmitter } from 'events';

export interface TrayConfig {
  iconPath: string;
  tooltip: string;
  menuItems: TrayMenuItem[];
}

export interface TrayMenuItem {
  label: string;
  type?: 'normal' | 'separator' | 'checkbox' | 'radio';
  checked?: boolean;
  enabled?: boolean;
  click?: () => void;
}

export class TrayManager extends EventEmitter {
  private config: TrayConfig | null = null;
  private isVisible = false;
  private currentTooltip = '';

  configure(config: TrayConfig): void {
    this.config = config;
    this.currentTooltip = config.tooltip;
    this.emit('tray:configured', config);
  }

  show(): void {
    if (!this.config) throw new Error('Tray not configured');
    this.isVisible = true;
    this.emit('tray:shown');
  }

  hide(): void {
    this.isVisible = false;
    this.emit('tray:hidden');
  }

  setTooltip(tooltip: string): void {
    this.currentTooltip = tooltip;
    this.emit('tray:tooltip-changed', tooltip);
  }

  updateMenu(items: TrayMenuItem[]): void {
    if (this.config) {
      this.config.menuItems = items;
      this.emit('tray:menu-updated', items);
    }
  }

  isTrayVisible(): boolean {
    return this.isVisible;
  }

  getTooltip(): string {
    return this.currentTooltip;
  }

  getConfig(): TrayConfig | null {
    return this.config ? { ...this.config } : null;
  }

  destroy(): void {
    this.isVisible = false;
    this.config = null;
    this.currentTooltip = '';
    this.emit('tray:destroyed');
  }
}
