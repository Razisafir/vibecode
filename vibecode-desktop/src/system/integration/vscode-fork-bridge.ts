// VibeCode System Integration - VS Code Fork Bridge v11.0
// Adapter interfaces for connecting system modules to the VS Code fork runtime.
// This module defines ONLY interfaces — it has ZERO imports from VS Code fork source.
// Implementation is provided at the product assembly level, not in the system layer.

import type { ServiceState, BootConfig } from '../kernel/types';

/**
 * Adapter interface for the VS Code fork's service lifecycle.
 * The system layer defines what it needs; the fork provides the implementation.
 */
export interface IServiceAdapter {
  readonly serviceName: string;
  getState(): ServiceState;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Adapter interface for the VS Code fork's IPC system.
 * Bridges VibeCode's IPCRouter with the fork's native IPC.
 */
export interface IIPCBridgeAdapter {
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, handler: (...args: unknown[]) => void): () => void;
  once(channel: string, handler: (...args: unknown[]) => void): () => void;
  removeListener(channel: string, handler: (...args: unknown[]) => void): void;
}

/**
 * Adapter interface for the VS Code fork's window management.
 * Bridges VibeCode's WindowManager with the fork's native window system.
 */
export interface IWindowBridgeAdapter {
  createWindow(config: unknown): Promise<string>;
  destroyWindow(windowId: string): Promise<void>;
  getActiveWindowIds(): string[];
  focusWindow(windowId: string): void;
}

/**
 * Adapter interface for the VS Code fork's storage system.
 * Bridges VibeCode's session persistence with the fork's storage API.
 */
export interface IStorageBridgeAdapter {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  keys(): string[];
}

/**
 * Adapter interface for the VS Code fork's command system.
 * Bridges VibeCode's PluginAPI commands with the fork's command registry.
 */
export interface ICommandBridgeAdapter {
  registerCommand(id: string, handler: (...args: unknown[]) => unknown): { dispose(): void };
  executeCommand(id: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Collection of all bridge adapters.
 * Passed to system modules during VS Code fork production boot.
 */
export interface IVSCodeForkBridge {
  readonly ipc: IIPCBridgeAdapter;
  readonly window: IWindowBridgeAdapter;
  readonly storage: IStorageBridgeAdapter;
  readonly command: ICommandBridgeAdapter;
  readonly services: ReadonlyMap<string, IServiceAdapter>;

  /** Returns the fork's product configuration */
  getProductConfig(): IProductConfig;

  /** Returns the fork's version string */
  getForkVersion(): string;

  /** Returns the Chromium version used by the fork's runtime */
  getChromiumVersion(): string;
}

/**
 * Product configuration from the VS Code fork.
 * Maps to product.json at the root level.
 */
export interface IProductConfig {
  nameShort: string;
  nameLong: string;
  applicationName: string;
  version: string;
  quality: 'stable' | 'insider' | 'exploration';
  commit?: string;
  date?: string;
  checksums?: Record<string, string>;
  extensionsGallery?: {
    serviceUrl: string;
    itemUrl: string;
    controlUrl: string;
    recommendationsUrl: string;
  };
}

/**
 * Factory function type for creating bridge adapters.
 * Called during VS Code fork production boot sequence.
 */
export type BridgeAdapterFactory = (config: BootConfig) => IVSCodeForkBridge;

/**
 * Sentinel value indicating the bridge is not available (development mode).
 * System modules check for this to gracefully degrade.
 */
export const BRIDGE_NOT_AVAILABLE: unique symbol = Symbol('VSCODE_FORK_BRIDGE_NOT_AVAILABLE');

/**
 * Type guard for checking if a bridge is available.
 */
export function isBridgeAvailable(bridge: IVSCodeForkBridge | typeof BRIDGE_NOT_AVAILABLE): bridge is IVSCodeForkBridge {
  return bridge !== BRIDGE_NOT_AVAILABLE;
}
