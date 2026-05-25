// Plugin API - Capability-based proxy with explicit denial
// Phase 8: Plugin Architecture

import type { PluginCapability, PluginManifest } from '../kernel/types';
import { EventEmitter } from 'events';

interface CommandRegistration {
  id: string;
  handler: (...args: any[]) => any;
  pluginId: string;
}

export class PluginAPI extends EventEmitter {
  private pluginId: string;
  private grantedCapabilities: Set<PluginCapability>;
  private disposables: (() => void)[] = [];
  private commandRegistrations: Map<string, CommandRegistration> = new Map();
  private fsScope: string[] = [];
  private disposed = false;

  constructor(pluginId: string, capabilities: PluginCapability[]) {
    super();
    this.pluginId = pluginId;
    this.grantedCapabilities = new Set(capabilities);
  }

  get fs(): PluginFsAPI {
    this.requireCapability('fs.read');
    return {
      read: (path: string) => {
        this.requireCapability('fs.read');
        if (!this.isPathInScope(path)) {
          throw new Error(
            `Permission denied: path '${path}' is outside declared scope for plugin ${this.pluginId}`
          );
        }
        return { path, content: '' };
      },
      write: (path: string, content: string) => {
        this.requireCapability('fs.write');
        if (!this.isPathInScope(path)) {
          throw new Error(
            `Permission denied: path '${path}' is outside declared scope for plugin ${this.pluginId}`
          );
        }
        return true;
      }
    };
  }

  get command(): PluginCommandAPI {
    return {
      register: (id: string, handler: (...args: any[]) => any) => {
        this.requireCapability('command.register');
        const registration: CommandRegistration = { id, handler, pluginId: this.pluginId };
        this.commandRegistrations.set(id, registration);

        const disposable = {
          dispose: () => {
            this.commandRegistrations.delete(id);
          }
        };
        this.disposables.push(() => disposable.dispose());
        return disposable;
      },
      execute: (id: string, ...args: any[]) => {
        const reg = this.commandRegistrations.get(id);
        if (!reg) throw new Error(`Command '${id}' not found`);
        return reg.handler(...args);
      }
    };
  }

  get telemetry(): PluginTelemetryAPI {
    return {
      emit: (event: string, data?: unknown) => {
        this.requireCapability('telemetry.emit');
        const prefixedEvent = `${this.pluginId}:${event}`;
        this.emit('telemetry', { event: prefixedEvent, data, pluginId: this.pluginId });
      }
    };
  }

  get ipc(): PluginIpcAPI {
    return {
      send: (channel: string, ...args: any[]) => {
        this.requireCapability('ipc.send');
        this.emit('ipc-send', { channel, args, pluginId: this.pluginId });
      }
    };
  }

  hasCapability(cap: PluginCapability): boolean {
    return this.grantedCapabilities.has(cap);
  }

  requireCapability(cap: PluginCapability): void {
    if (!this.grantedCapabilities.has(cap)) {
      throw new Error(
        `Capability '${cap}' not granted to plugin ${this.pluginId}. Request was explicitly denied.`
      );
    }
  }

  revokeCapability(cap: PluginCapability): boolean {
    return this.grantedCapabilities.delete(cap);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable();
    }
    this.disposables = [];
    this.commandRegistrations.clear();
    this.disposed = true;
    this.removeAllListeners();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  setFsScope(paths: string[]): void {
    this.fsScope = paths;
  }

  getGrantedCapabilities(): Set<PluginCapability> {
    return new Set(this.grantedCapabilities);
  }

  private isPathInScope(path: string): boolean {
    if (this.fsScope.length === 0) return true; // No scope restriction if not configured
    return this.fsScope.some(scope => path.startsWith(scope));
  }
}

interface PluginFsAPI {
  read(path: string): { path: string; content: string };
  write(path: string, content: string): boolean;
}

interface PluginCommandAPI {
  register(id: string, handler: (...args: any[]) => any): { dispose: () => void };
  execute(id: string, ...args: any[]): any;
}

interface PluginTelemetryAPI {
  emit(event: string, data?: unknown): void;
}

interface PluginIpcAPI {
  send(channel: string, ...args: any[]): void;
}
