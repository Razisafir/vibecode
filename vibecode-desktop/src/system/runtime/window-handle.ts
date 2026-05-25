// Window Handle - Indirect reference to a window (no direct BrowserWindow ref)
// Phase 9: Multi-Window Architecture

import type { WindowRole, WindowBounds, WindowState } from '../kernel/types';
import { EventEmitter } from 'events';

interface WindowHandleCallbacks {
  onStateChange: (from: WindowState, to: WindowState) => void;
  onSend: (channel: string, data: unknown) => void;
}

export class WindowHandle extends EventEmitter {
  private windowId: string;
  private role: WindowRole;
  private destroyed = false;
  private focused = false;
  private minimized = false;
  private maximized = false;
  private bounds: WindowBounds = { x: 0, y: 0, width: 800, height: 600 };
  private globalState: Record<string, unknown> = {};
  private callbacks: WindowHandleCallbacks;
  private disposables: Array<() => void> = [];

  constructor(windowId: string, role: WindowRole, callbacks: WindowHandleCallbacks) {
    super();
    this.windowId = windowId;
    this.role = role;
    this.callbacks = callbacks;
  }

  getId(): string {
    return this.windowId;
  }

  getRole(): WindowRole {
    return this.role;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isFocused(): boolean {
    return this.focused && !this.destroyed;
  }

  isMinimized(): boolean {
    return this.minimized && !this.destroyed;
  }

  isMaximized(): boolean {
    return this.maximized && !this.destroyed;
  }

  send(channel: string, data?: unknown): void {
    if (this.destroyed) {
      throw new Error(`Cannot send to destroyed window: ${this.windowId}`);
    }
    this.callbacks.onSend(channel, data);
  }

  setFocused(focused: boolean): void {
    if (this.destroyed) return;
    this.focused = focused;
  }

  setMinimized(minimized: boolean): void {
    if (this.destroyed) return;
    const fromState = minimized ? 'ready' : 'minimized';
    const toState = minimized ? 'minimized' : 'ready';
    this.minimized = minimized;
    this.callbacks.onStateChange(fromState, toState);
  }

  setMaximized(maximized: boolean): void {
    if (this.destroyed) return;
    const fromState = maximized ? 'ready' : 'maximized';
    const toState = maximized ? 'maximized' : 'ready';
    this.maximized = maximized;
    this.callbacks.onStateChange(fromState, toState);
  }

  getBounds(): WindowBounds {
    return { ...this.bounds };
  }

  setBounds(bounds: Partial<WindowBounds>): void {
    if (this.destroyed) return;
    this.bounds = { ...this.bounds, ...bounds };
  }

  getGlobalState(): Record<string, unknown> {
    return { ...this.globalState };
  }

  setGlobalState(key: string, value: unknown): void {
    if (this.destroyed) return;
    this.globalState[key] = value;
  }

  addDisposable(dispose: () => void): void {
    this.disposables.push(dispose);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    // Clean up all disposable event listeners
    for (const dispose of this.disposables) {
      dispose();
    }
    this.disposables = [];
    this.removeAllListeners();
  }
}
