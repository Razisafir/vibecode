// VibeCode System Runtime - Window Manager v8.0
// Manages Electron BrowserWindow lifecycle with state persistence

import { EventEmitter } from 'events';

export interface WindowConfig {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  x?: number;
  y?: number;
  title?: string;
  resizable?: boolean;
  frame?: boolean;
  transparent?: boolean;
  alwaysOnTop?: boolean;
  show?: boolean;
}

export interface WindowState {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
  isMinimized: boolean;
  isFullScreen: boolean;
}

const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  width: 1200,
  height: 800,
  minWidth: 600,
  minHeight: 400,
  title: 'VibeCode Desktop',
  resizable: true,
  show: false,
};

export class WindowManager extends EventEmitter {
  private windows = new Map<string, WindowState>();
  private config: WindowConfig;
  private mainWindowId: string | null = null;

  constructor(config: Partial<WindowConfig> = {}) {
    super();
    this.config = { ...DEFAULT_WINDOW_CONFIG, ...config };
  }

  createWindow(id: string, config?: Partial<WindowConfig>): WindowState {
    const mergedConfig = { ...this.config, ...config };
    const state: WindowState = {
      id,
      bounds: {
        x: mergedConfig.x ?? 100,
        y: mergedConfig.y ?? 100,
        width: mergedConfig.width,
        height: mergedConfig.height,
      },
      isMaximized: false,
      isMinimized: false,
      isFullScreen: false,
    };

    this.windows.set(id, state);
    
    if (!this.mainWindowId) {
      this.mainWindowId = id;
    }

    this.emit('window:created', state);
    return state;
  }

  getWindow(id: string): WindowState | undefined {
    return this.windows.get(id);
  }

  getMainWindow(): WindowState | undefined {
    if (!this.mainWindowId) return undefined;
    return this.windows.get(this.mainWindowId);
  }

  getAllWindows(): WindowState[] {
    return Array.from(this.windows.values());
  }

  updateBounds(id: string, bounds: Partial<WindowState['bounds']>): void {
    const window = this.windows.get(id);
    if (!window) throw new Error(`Window '${id}' not found`);

    window.bounds = { ...window.bounds, ...bounds };
    this.emit('window:bounds-changed', window);
  }

  setMaximized(id: string, maximized: boolean): void {
    const window = this.windows.get(id);
    if (!window) throw new Error(`Window '${id}' not found`);

    window.isMaximized = maximized;
    this.emit('window:maximized-changed', { id, maximized });
  }

  closeWindow(id: string): boolean {
    const window = this.windows.get(id);
    if (!window) return false;

    this.windows.delete(id);
    if (this.mainWindowId === id) {
      this.mainWindowId = this.windows.keys().next().value ?? null;
    }
    this.emit('window:closed', id);
    return true;
  }

  closeAllWindows(): number {
    const count = this.windows.size;
    this.windows.clear();
    this.mainWindowId = null;
    this.emit('windows:all-closed');
    return count;
  }

  getWindowCount(): number {
    return this.windows.size;
  }

  getConfig(): WindowConfig {
    return { ...this.config };
  }

  persistState(): Record<string, WindowState> {
    const state: Record<string, WindowState> = {};
    for (const [id, window] of this.windows) {
      state[id] = { ...window, bounds: { ...window.bounds } };
    }
    return state;
  }

  restoreState(state: Record<string, WindowState>): void {
    for (const [id, windowState] of Object.entries(state)) {
      this.windows.set(id, { ...windowState, bounds: { ...windowState.bounds } });
    }
  }
}
