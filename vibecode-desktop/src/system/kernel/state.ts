// VibeCode System Kernel State v8.0
export type { ServiceState, FailureCategory, PluginState, PluginManifest, PluginCapability, PluginPermission, PluginTransitionResult, PluginEvent, ServiceRegistry, PluginConsentRecord, LogCategory } from './types';

import type { ServiceState } from './types';

const VALID_SERVICE_TRANSITIONS: Record<ServiceState, ServiceState[]> = {
  uninitialized: ['initializing', 'failed'],
  initializing: ['ready', 'failed', 'degraded'],
  ready: ['degraded', 'failed', 'shutting_down'],
  degraded: ['ready', 'failed', 'shutting_down'],
  failed: ['initializing', 'shutting_down'],
  shutting_down: [],
};

interface TransitionRecord {
  from: ServiceState;
  to: ServiceState;
  timestamp: number;
}

interface ServiceRecord {
  state: ServiceState;
  version: string;
  history: TransitionRecord[];
  dependencies: string[];
}

type StateListener = (service: string, newState: ServiceState, oldState: ServiceState) => void;

export class StateManager {
  private services = new Map<string, ServiceRecord>();
  private listeners: StateListener[] = [];

  getState(service: string): ServiceState {
    return this.services.get(service)?.state ?? 'uninitialized';
  }

  setState(service: string, newState: ServiceState): boolean {
    const record = this.getOrCreate(service);
    const current = record.state;

    if (!VALID_SERVICE_TRANSITIONS[current]?.includes(newState)) {
      return false;
    }

    record.history.push({ from: current, to: newState, timestamp: Date.now() });
    record.state = newState;

    for (const listener of this.listeners) {
      listener(service, newState, current);
    }

    return true;
  }

  setVersion(service: string, version: string): void {
    const record = this.getOrCreate(service);
    record.version = version;
  }

  getServiceInfo(service: string): { state: ServiceState; version: string; dependencies: string[] } {
    const record = this.getOrCreate(service);
    return {
      state: record.state,
      version: record.version,
      dependencies: record.dependencies,
    };
  }

  getTransitionHistory(service: string): TransitionRecord[] {
    return this.services.get(service)?.history ?? [];
  }

  addListener(listener: StateListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: StateListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  reset(service: string): void {
    this.services.delete(service);
  }

  private getOrCreate(service: string): ServiceRecord {
    if (!this.services.has(service)) {
      this.services.set(service, {
        state: 'uninitialized',
        version: '0.0.0',
        history: [],
        dependencies: [],
      });
    }
    return this.services.get(service)!;
  }
}

let globalStateManager: StateManager | null = null;

export function getStateManager(): StateManager {
  if (!globalStateManager) {
    globalStateManager = new StateManager();
  }
  return globalStateManager;
}

export function resetStateManager(): void {
  globalStateManager = null;
}
