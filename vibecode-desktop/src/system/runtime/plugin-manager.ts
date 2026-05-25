// Plugin Manager - State machine and lifecycle management
// Phase 8: Plugin Architecture

import type { PluginState, PluginManifest, PluginTransitionResult, PluginEvent, ServiceRegistry } from '../kernel/types';
import { PluginSandbox } from './plugin-sandbox';
import { PluginAPI } from './plugin-api';
import { PluginRegistry } from './plugin-registry';
import { EventEmitter } from 'events';

const VALID_TRANSITIONS: Record<PluginState, PluginState[]> = {
  unloaded: ['loaded'],
  loaded: ['activated', 'unloaded'],
  activated: ['deactivated', 'error'],
  deactivated: ['activated', 'unloaded', 'error'],
  error: ['unloaded', 'loaded']
};

const CURRENT_API_VERSION = '1.0.0';

export class PluginManager extends EventEmitter {
  private states = new Map<string, PluginState>();
  private sandboxes = new Map<string, PluginSandbox>();
  private apis = new Map<string, PluginAPI>();
  private registry: PluginRegistry;
  private serviceRegistry?: ServiceRegistry;
  private consentStore = new Map<string, Set<string>>(); // pluginId -> granted capabilities
  private auditLog: AuditLogger;

  constructor(registry: PluginRegistry, serviceRegistry?: ServiceRegistry) {
    super();
    this.registry = registry;
    this.serviceRegistry = serviceRegistry;
    this.auditLog = new AuditLogger();
  }

  async load(pluginId: string): Promise<PluginTransitionResult> {
    const manifest = this.registry.getManifest(pluginId);
    if (!manifest) {
      return this.failTransition(pluginId, this.getState(pluginId),
        `Plugin ${pluginId} not found in registry`);
    }

    // Version check
    if (this.compareVersions(manifest.apiVersion, CURRENT_API_VERSION) > 0) {
      return this.failTransition(pluginId, this.getState(pluginId),
        `Plugin requires API v${manifest.apiVersion}, current is v${CURRENT_API_VERSION}`);
    }

    // Dependency check - all deps must be activated
    const missingDeps = (manifest.dependencies || []).filter(
      dep => this.getState(dep) !== 'activated'
    );
    if (missingDeps.length > 0) {
      return this.failTransition(pluginId, this.getState(pluginId),
        `Missing activated dependencies: ${missingDeps.join(', ')}`);
    }

    const prevState = this.getState(pluginId);
    if (!this.canTransition(pluginId, 'loaded')) {
      return this.failTransition(pluginId, prevState,
        `Invalid transition from ${prevState} to loaded`);
    }

    const sandbox = new PluginSandbox(pluginId, manifest);
    const api = new PluginAPI(pluginId, manifest.capabilities);

    // Set FS scope from permissions
    const fsPaths = (manifest.permissions || [])
      .filter(p => p.capability === 'fs.read' || p.capability === 'fs.write')
      .flatMap(p => p.scope || []);
    if (fsPaths.length > 0) {
      api.setFsScope(fsPaths);
    }

    this.sandboxes.set(pluginId, sandbox);
    this.apis.set(pluginId, api);
    this.setState(pluginId, 'loaded');

    this.emitEvent('plugin:loaded', pluginId);
    return { success: true, fromState: prevState, toState: 'loaded', timestamp: Date.now() };
  }

  async activate(pluginId: string): Promise<PluginTransitionResult> {
    const prevState = this.getState(pluginId);
    if (!this.canTransition(pluginId, 'activated')) {
      return this.failTransition(pluginId, prevState,
        `Invalid transition from ${prevState} to activated`);
    }

    try {
      const sandbox = this.sandboxes.get(pluginId);
      const api = this.apis.get(pluginId);
      if (!sandbox || !api) {
        return this.failTransition(pluginId, prevState,
          `Sandbox or API not found for ${pluginId}`);
      }

      // Check consent for capabilities
      const manifest = this.registry.getManifest(pluginId);
      if (manifest) {
        const capsRequiringConsent = (manifest.permissions || [])
          .filter(p => p.consentRequired);
        for (const perm of capsRequiringConsent) {
          const granted = this.checkConsent(pluginId, perm.capability);
          if (!granted) {
            const consentGranted = await this.promptConsent(pluginId, perm.capability);
            if (!consentGranted) {
              return this.failTransition(pluginId, prevState,
                `Consent denied for capability: ${perm.capability}`);
            }
            this.recordConsent(pluginId, perm.capability);
          }
          this.auditLog.log(pluginId, 'capability.granted', { capability: perm.capability });
        }
      }

      // Initialize sandbox with plugin code
      // If sandbox was soft-reset (deactivated), re-initialize it
      const manifestDef = this.registry.getManifest(pluginId);
      if (sandbox.isDisposed()) {
        // Sandbox was fully disposed, need to recreate
        const newSandbox = new PluginSandbox(pluginId, manifestDef!);
        this.sandboxes.set(pluginId, newSandbox);
        await newSandbox.initialize(manifestDef!.main, api);
      } else {
        await sandbox.initialize(manifestDef!.main, api);
      }

      this.setState(pluginId, 'activated');
      this.emitEvent('plugin:activated', pluginId);
      return { success: true, fromState: prevState, toState: 'activated', timestamp: Date.now() };
    } catch (err) {
      // Plugin crash does NOT propagate - isolate it
      this.setState(pluginId, 'error');
      this.emitEvent('plugin:error', pluginId, err);
      this.auditLog.log(pluginId, 'plugin.crash', { error: String(err) });
      return {
        success: false,
        fromState: prevState,
        toState: 'error',
        error: String(err),
        timestamp: Date.now()
      };
    }
  }

  async deactivate(pluginId: string): Promise<PluginTransitionResult> {
    const prevState = this.getState(pluginId);
    if (!this.canTransition(pluginId, 'deactivated')) {
      return this.failTransition(pluginId, prevState,
        `Invalid transition from ${prevState} to deactivated`);
    }

    try {
      // Deactivate stops plugin execution but preserves sandbox/API
      // so the plugin can be reactivated without reloading
      const sandbox = this.sandboxes.get(pluginId);
      if (sandbox) {
        // Clear timers but don't fully dispose sandbox
        await sandbox.softReset();
      }

      this.setState(pluginId, 'deactivated');
      this.emitEvent('plugin:deactivated', pluginId);
      return { success: true, fromState: prevState, toState: 'deactivated', timestamp: Date.now() };
    } catch (err) {
      this.setState(pluginId, 'error');
      this.emitEvent('plugin:error', pluginId, err);
      return {
        success: false,
        fromState: prevState,
        toState: 'error',
        error: String(err),
        timestamp: Date.now()
      };
    }
  }

  async unload(pluginId: string): Promise<PluginTransitionResult> {
    const prevState = this.getState(pluginId);
    if (!this.canTransition(pluginId, 'unloaded')) {
      return this.failTransition(pluginId, prevState,
        `Invalid transition from ${prevState} to unloaded`);
    }

    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      await sandbox.dispose();
      this.sandboxes.delete(pluginId);
    }
    const api = this.apis.get(pluginId);
    if (api) {
      api.dispose();
      this.apis.delete(pluginId);
    }

    this.setState(pluginId, 'unloaded');
    this.emitEvent('plugin:unloaded', pluginId);
    return { success: true, fromState: prevState, toState: 'unloaded', timestamp: Date.now() };
  }

  async hotReload(pluginId: string): Promise<PluginTransitionResult[]> {
    const results: PluginTransitionResult[] = [];
    const currentState = this.getState(pluginId);

    if (currentState === 'activated') {
      results.push(await this.deactivate(pluginId));
    }
    const stateAfterDeactivate = this.getState(pluginId);
    if (['loaded', 'deactivated', 'error'].includes(stateAfterDeactivate)) {
      results.push(await this.unload(pluginId));
    }
    results.push(await this.load(pluginId));
    results.push(await this.activate(pluginId));
    return results;
  }

  revokeCapability(pluginId: string, capability: string): boolean {
    const api = this.apis.get(pluginId);
    if (!api) return false;
    const removed = api.revokeCapability(capability as any);
    if (removed) {
      this.auditLog.log(pluginId, 'capability.revoked', { capability });
    }
    return removed;
  }

  getState(pluginId: string): PluginState {
    return this.states.get(pluginId) || 'unloaded';
  }

  getAllStates(): Map<string, PluginState> {
    return new Map(this.states);
  }

  getSandbox(pluginId: string): PluginSandbox | undefined {
    return this.sandboxes.get(pluginId);
  }

  getAPI(pluginId: string): PluginAPI | undefined {
    return this.apis.get(pluginId);
  }

  getAuditLog(): Array<{ pluginId: string; action: string; data?: unknown }> {
    return this.auditLog.getEntries();
  }

  private canTransition(pluginId: string, target: PluginState): boolean {
    const current = this.getState(pluginId);
    return VALID_TRANSITIONS[current]?.includes(target) ?? false;
  }

  private setState(pluginId: string, state: PluginState): void {
    this.states.set(pluginId, state);
  }

  private failTransition(pluginId: string, fromState: PluginState, error: string): PluginTransitionResult {
    return { success: false, fromState, toState: fromState, error, timestamp: Date.now() };
  }

  private emitEvent(type: string, pluginId: string, data?: unknown): void {
    const event: PluginEvent = { type, pluginId, timestamp: Date.now(), data };
    this.emit('plugin-event', event);
    this.emit(type, event);
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0;
      const nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  private checkConsent(pluginId: string, capability: string): boolean {
    return this.consentStore.get(pluginId)?.has(capability) ?? false;
  }

  private recordConsent(pluginId: string, capability: string): void {
    if (!this.consentStore.has(pluginId)) {
      this.consentStore.set(pluginId, new Set());
    }
    this.consentStore.get(pluginId)!.add(capability);
  }

  private async promptConsent(pluginId: string, capability: string): Promise<boolean> {
    // In production, this shows a consent dialog
    // For now, default to true for testing
    return true;
  }
}

class AuditLogger {
  private entries: Array<{ pluginId: string; action: string; data?: unknown; timestamp: number }> = [];

  log(pluginId: string, action: string, data?: unknown): void {
    this.entries.push({ pluginId, action, data, timestamp: Date.now() });
  }

  getEntries(): Array<{ pluginId: string; action: string; data?: unknown }> {
    return [...this.entries];
  }
}
