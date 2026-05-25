// VibeCode System Kernel Types v8.0
// Phase 8: Plugin Architecture types added

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
