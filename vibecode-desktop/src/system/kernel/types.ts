// VibeCode System Kernel Types v11.0
// Phase 8: Plugin Architecture types
// Phase 9: Multi-Window Architecture types
// Phase 11: VS Code Fork Integration types

export type ServiceState = 'uninitialized' | 'initializing' | 'ready' | 'degraded' | 'failed' | 'shutting_down';

export type FailureCategory =
  | 'NETWORK_ERROR' | 'AUTH_FAILURE' | 'RESOURCE_EXHAUSTED' | 'TIMEOUT'
  | 'CORRUPTION' | 'PERMISSION_DENIED' | 'PM2_MISCONFIGURATION' | 'PLUGIN_FAILURE'
  | 'UNKNOWN';

export interface ServiceInfo {
  name: string;
  state: ServiceState;
  version: string;
  dependencies: string[];
}

// Phase 8: Plugin Architecture Types
export type PluginState = 'unloaded' | 'loaded' | 'activated' | 'deactivated' | 'error';

export type PluginCapability =
  | 'fs.read' | 'fs.write' | 'command.register' | 'telemetry.emit'
  | 'ipc.send' | 'network.request' | 'clipboard.read' | 'clipboard.write';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  apiVersion: string;
  capabilities: PluginCapability[];
  dependencies?: string[];
  permissions?: PluginPermission[];
}

export interface PluginPermission {
  capability: PluginCapability;
  scope?: string[];
  consentRequired: boolean;
}

export interface PluginTransitionResult {
  success: boolean;
  fromState: PluginState;
  toState: PluginState;
  error?: string;
  timestamp: number;
}

export interface PluginEvent {
  type: string;
  pluginId: string;
  timestamp: number;
  data?: unknown;
}

export interface ServiceRegistry {
  register(name: string, factory: () => Promise<unknown>): void;
  get(name: string): Promise<unknown>;
  has(name: string): boolean;
}

export interface PluginConsentRecord {
  pluginId: string;
  capability: PluginCapability;
  granted: boolean;
  timestamp: number;
}

// Re-exports for backward compatibility (Phase 6-7 types)
export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  timestamp?: number;
  details?: Record<string, unknown>;
}

export interface TelemetryEvent {
  name: string;
  timestamp: number;
  properties?: Record<string, unknown>;
  measurements?: Record<string, number>;
  sampling?: boolean;
}

// Phase 9: Multi-Window Architecture Types
export type WindowState = 'creating' | 'ready' | 'minimized' | 'maximized' | 'closed' | 'destroyed';

export type WindowRole = 'main' | 'secondary' | 'panel' | 'dialog' | 'popup';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowConfig {
  id: string;
  role: WindowRole;
  title: string;
  bounds?: Partial<WindowBounds>;
  url?: string;
  parentId?: string;
  sessionAware?: boolean;
  devTools?: boolean;
}

export interface WindowStateEvent {
  windowId: string;
  fromState: WindowState;
  toState: WindowState;
  timestamp: number;
}

export interface WindowSessionData {
  windowId: string;
  role: WindowRole;
  bounds: WindowBounds;
  url: string;
  globalState: Record<string, unknown>;
  lastActive: number;
  isMaximized: boolean;
  isMinimized: boolean;
}

export interface IPCMessage {
  channel: string;
  data?: unknown;
  windowId?: string;
  windowRole?: WindowRole;
  timestamp: number;
  sourceWindowId: string;
}

export interface IPCRouteConfig {
  channel: string;
  handler: (msg: IPCMessage) => unknown;
  windowId?: string; // If set, only handles for that window
}

export interface BootConfig {
  multiWindow: {
    maxWindows: number;
    saveSessionsOnClose: boolean;
    autoRestoreOnBoot: boolean;
    sessionDirectory: string;
    debounceMs: number;
  };
  [key: string]: unknown;
}

// Phase 11: Log Category for structured logging
export type LogCategory =
  | 'general' | 'kernel' | 'runtime' | 'observability' | 'supervision'
  | 'plugin' | 'window' | 'ipc' | 'network' | 'security' | 'integration';
