// VibeCode System Runtime - Safe Mode Manager v8.0
// Manages degraded startup mode when critical services fail

import { EventEmitter } from 'events';

export type SafeModeReason = 
  | 'crash_loop' 
  | 'configuration_corruption' 
  | 'dependency_missing' 
  | 'user_requested'
  | 'plugin_failure';

export interface SafeModeConfig {
  enabled: boolean;
  reason?: SafeModeReason;
  disabledFeatures: string[];
  allowDataAccess: boolean;
  allowPluginSystem: boolean;
  allowNetworkAccess: boolean;
}

const DEFAULT_SAFE_MODE_CONFIG: SafeModeConfig = {
  enabled: false,
  disabledFeatures: [],
  allowDataAccess: true,
  allowPluginSystem: false,
  allowNetworkAccess: false,
};

export class SafeModeManager extends EventEmitter {
  private config: SafeModeConfig;
  private activationCount = 0;
  private lastActivationReason: SafeModeReason | null = null;

  constructor(config: Partial<SafeModeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SAFE_MODE_CONFIG, ...config };
  }

  activate(reason: SafeModeReason): void {
    this.config.enabled = true;
    this.config.reason = reason;
    this.lastActivationReason = reason;
    this.activationCount++;

    // Restrict features based on reason
    switch (reason) {
      case 'crash_loop':
        this.config.disabledFeatures = ['plugins', 'auto-update', 'telemetry'];
        this.config.allowPluginSystem = false;
        this.config.allowNetworkAccess = false;
        break;
      case 'configuration_corruption':
        this.config.disabledFeatures = ['plugins', 'auto-update'];
        this.config.allowPluginSystem = false;
        break;
      case 'plugin_failure':
        this.config.disabledFeatures = ['plugins'];
        this.config.allowPluginSystem = false;
        break;
      case 'user_requested':
        this.config.disabledFeatures = ['plugins'];
        this.config.allowPluginSystem = false;
        break;
      case 'dependency_missing':
        this.config.disabledFeatures = ['plugins', 'network', 'auto-update'];
        this.config.allowPluginSystem = false;
        this.config.allowNetworkAccess = false;
        break;
    }

    this.emit('safe-mode:activated', { reason, config: this.config });
  }

  deactivate(): void {
    this.config.enabled = false;
    this.config.reason = undefined;
    this.config.disabledFeatures = [];
    this.config.allowPluginSystem = true;
    this.config.allowNetworkAccess = true;
    this.emit('safe-mode:deactivated');
  }

  isActive(): boolean {
    return this.config.enabled;
  }

  isFeatureAllowed(feature: string): boolean {
    return !this.config.disabledFeatures.includes(feature);
  }

  getConfig(): SafeModeConfig {
    return { ...this.config };
  }

  getActivationCount(): number {
    return this.activationCount;
  }

  getLastActivationReason(): SafeModeReason | null {
    return this.lastActivationReason;
  }
}
