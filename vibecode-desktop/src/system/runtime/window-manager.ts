// Window Manager - State machine and lifecycle for multi-window management
// Phase 9: Multi-Window Architecture

import type { WindowState, WindowConfig, WindowStateEvent, WindowRole, BootConfig, ServiceRegistry } from '../kernel/types';
import { WindowHandle } from './window-handle';
import { WindowSession } from './window-session';
import { EventEmitter } from 'events';

const VALID_WINDOW_TRANSITIONS: Record<WindowState, WindowState[]> = {
  creating: ['ready', 'closed', 'destroyed'],
  ready: ['minimized', 'maximized', 'closed', 'destroyed'],
  minimized: ['ready', 'closed', 'destroyed'],
  maximized: ['ready', 'minimized', 'closed', 'destroyed'],
  closed: ['destroyed'],
  destroyed: [],
};

const DEFAULT_MAX_WINDOWS = 10;
const DEFAULT_BOOT_CONFIG: BootConfig = {
  multiWindow: {
    maxWindows: DEFAULT_MAX_WINDOWS,
    saveSessionsOnClose: true,
    autoRestoreOnBoot: true,
    sessionDirectory: './window-sessions',
    debounceMs: 300,
  },
};

export class WindowManager extends EventEmitter {
  private windowStates = new Map<string, WindowState>();
  private windowHandles = new Map<string, WindowHandle>();
  private windowConfigs = new Map<string, WindowConfig>();
  private mainWindowId: string | null = null;
  private maxWindows: number;
  private session: WindowSession;
  private bootConfig: BootConfig;
  private serviceRegistry?: ServiceRegistry;

  constructor(bootConfig?: Partial<BootConfig>, serviceRegistry?: ServiceRegistry) {
    super();
    this.bootConfig = this.mergeBootConfig(bootConfig);
    this.maxWindows = this.bootConfig.multiWindow.maxWindows;
    this.session = new WindowSession(this.bootConfig.multiWindow.sessionDirectory);
    this.serviceRegistry = serviceRegistry;
  }

  async createWindow(config: WindowConfig): Promise<WindowHandle> {
    // Check max windows
    const activeCount = this.getActiveWindowCount();
    if (activeCount >= this.maxWindows) {
      throw new Error(`Maximum window count (${this.maxWindows}) reached`);
    }

    // Main window cannot be duplicated
    if (config.role === 'main') {
      if (this.mainWindowId !== null) {
        throw new Error('Main window already exists — cannot create duplicate');
      }
      this.mainWindowId = config.id;
    }

    // Set state to creating
    this.windowStates.set(config.id, 'creating');
    this.windowConfigs.set(config.id, config);

    // Create handle (does NOT hold BrowserWindow reference directly)
    const handle = new WindowHandle(config.id, config.role, {
      onStateChange: (from, to) => this.handleStateChange(config.id, from, to),
      onSend: (channel, data) => this.handleWindowSend(config.id, channel, data),
    });
    this.windowHandles.set(config.id, handle);

    // Transition to ready
    this.setState(config.id, 'ready');

    this.emitStateEvent(config.id, 'creating', 'ready');
    return handle;
  }

  async closeWindow(windowId: string): Promise<boolean> {
    const state = this.getState(windowId);
    if (state === 'closed' || state === 'destroyed') {
      return false; // Invalid transition
    }
    if (!this.canTransition(windowId, 'closed')) {
      return false;
    }

    const prevState = state;
    this.setState(windowId, 'closed');
    this.emitStateEvent(windowId, prevState, 'closed');

    // Save session on close
    if (this.bootConfig.multiWindow.saveSessionsOnClose) {
      await this.saveWindowSession(windowId);
    }

    return true;
  }

  async destroyWindow(windowId: string): Promise<boolean> {
    const state = this.getState(windowId);
    if (state === 'destroyed') {
      return false;
    }

    // Can only destroy from closed state
    if (state !== 'closed' && state !== 'creating') {
      // Force close first
      await this.closeWindow(windowId);
    }

    const prevState = this.getState(windowId);
    this.setState(windowId, 'destroyed');
    this.emitStateEvent(windowId, prevState, 'destroyed');

    // Cleanup
    const handle = this.windowHandles.get(windowId);
    if (handle) {
      handle.destroy();
    }
    this.windowHandles.delete(windowId);
    this.windowConfigs.delete(windowId);

    // If main window was destroyed, clear reference
    if (this.mainWindowId === windowId) {
      this.mainWindowId = null;
    }

    return true;
  }

  async shutdown(): Promise<void> {
    // Close secondary windows first, then main
    const windowIds = Array.from(this.windowStates.keys());
    const secondaryWindows = windowIds.filter(id => id !== this.mainWindowId);
    const mainWindow = this.mainWindowId ? [this.mainWindowId] : [];

    for (const id of secondaryWindows) {
      await this.closeWindow(id);
      await this.destroyWindow(id);
    }

    for (const id of mainWindow) {
      // Save main window session before closing (crash recovery)
      await this.saveWindowSession(id);
      await this.closeWindow(id);
      await this.destroyWindow(id);
    }
  }

  getHandle(windowId: string): WindowHandle | undefined {
    return this.windowHandles.get(windowId);
  }

  getState(windowId: string): WindowState {
    return this.windowStates.get(windowId) || 'destroyed';
  }

  getConfig(windowId: string): WindowConfig | undefined {
    return this.windowConfigs.get(windowId);
  }

  getMainWindowId(): string | null {
    return this.mainWindowId;
  }

  getActiveWindowCount(): number {
    let count = 0;
    for (const [, state] of this.windowStates) {
      if (state !== 'closed' && state !== 'destroyed') {
        count++;
      }
    }
    return count;
  }

  getAllWindowIds(): string[] {
    return Array.from(this.windowStates.keys())
      .filter(id => this.getState(id) !== 'destroyed');
  }

  getActiveWindows(): Array<{ id: string; state: WindowState; role: WindowRole; title: string }> {
    const result: Array<{ id: string; state: WindowState; role: WindowRole; title: string }> = [];
    for (const [id, state] of this.windowStates) {
      if (state !== 'destroyed' && state !== 'closed') {
        const config = this.windowConfigs.get(id);
        result.push({
          id,
          state,
          role: config?.role ?? 'secondary',
          title: config?.title ?? '',
        });
      }
    }
    return result;
  }

  getWindowSession(): WindowSession {
    return this.session;
  }

  getBootConfig(): BootConfig {
    return { ...this.bootConfig };
  }

  getMaxWindows(): number {
    return this.maxWindows;
  }

  setMaxWindows(max: number): void {
    this.maxWindows = max;
  }

  private canTransition(windowId: string, target: WindowState): boolean {
    const current = this.getState(windowId);
    return VALID_WINDOW_TRANSITIONS[current]?.includes(target) ?? false;
  }

  private setState(windowId: string, state: WindowState): void {
    this.windowStates.set(windowId, state);
  }

  private emitStateEvent(windowId: string, fromState: WindowState, toState: WindowState): void {
    const event: WindowStateEvent = {
      windowId,
      fromState,
      toState,
      timestamp: Date.now(),
    };
    this.emit('window-state-change', event);
    this.emit(`window:${toState}`, event);
  }

  private handleStateChange(windowId: string, fromState: WindowState, toState: WindowState): void {
    this.setState(windowId, toState);
    this.emitStateEvent(windowId, fromState, toState);
  }

  private handleWindowSend(windowId: string, channel: string, data: unknown): void {
    this.emit('window-message', { windowId, channel, data, timestamp: Date.now() });
  }

  private async saveWindowSession(windowId: string): Promise<void> {
    const config = this.windowConfigs.get(windowId);
    const handle = this.windowHandles.get(windowId);
    if (!config || !handle) return;

    await this.session.save(windowId, {
      windowId,
      role: config.role,
      bounds: handle.getBounds(),
      url: config.url ?? '',
      globalState: handle.getGlobalState(),
      lastActive: Date.now(),
      isMaximized: this.getState(windowId) === 'maximized',
      isMinimized: this.getState(windowId) === 'minimized',
    });
  }

  private mergeBootConfig(partial?: Partial<BootConfig>): BootConfig {
    if (!partial) return { ...DEFAULT_BOOT_CONFIG };
    return {
      ...DEFAULT_BOOT_CONFIG,
      ...partial,
      multiWindow: {
        ...DEFAULT_BOOT_CONFIG.multiWindow,
        ...(partial.multiWindow || {}),
      },
    };
  }
}
