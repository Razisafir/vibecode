// Plugin Sandbox - Isolation and resource tracking
// Phase 8: Plugin Architecture

import type { PluginManifest, PluginCapability } from '../kernel/types';
import type { PluginAPI } from './plugin-api';

interface TrackedTimer {
  id: ReturnType<typeof setTimeout>;
  type: 'timeout' | 'interval';
  startTime: number;
  cpuTime: number;
}

export class PluginSandbox {
  private pluginId: string;
  private manifest: PluginManifest;
  private trackedTimers: Map<number, TrackedTimer> = new Map();
  private memoryUsage: number = 0;
  private disposed = false;
  private ipcCallCount = 0;
  private ipcRateLimit = 100; // calls per second
  private ipcResetTime = Date.now();
  private pluginModule: unknown = null;
  private logger: ScopedLogger;
  private nextTimerId = 1;

  constructor(pluginId: string, manifest: PluginManifest) {
    this.pluginId = pluginId;
    this.manifest = manifest;
    this.logger = new ScopedLogger(pluginId);
  }

  async initialize(entryPoint: string, api: PluginAPI): Promise<void> {
    if (this.disposed) throw new Error(`Sandbox for ${this.pluginId} is disposed`);

    const sandboxedGlobals = this.createSandboxedGlobals();

    try {
      // In a real implementation, this would use VM context or worker threads
      // The plugin receives a sandboxed environment with restricted globals
      this.pluginModule = { entryPoint, sandbox: sandboxedGlobals, api };
      this.memoryUsage = 1024; // Base overhead
      this.logger.info(`Plugin ${this.pluginId} initialized in sandbox`);
    } catch (err) {
      this.logger.error(`Failed to initialize plugin ${this.pluginId}:`, err);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    // Clear all tracked timers
    for (const [, timer] of this.trackedTimers) {
      if (timer.type === 'timeout') {
        clearTimeout(timer.id as any);
      } else {
        clearInterval(timer.id as any);
      }
    }
    this.trackedTimers.clear();
    this.memoryUsage = 0;
    this.disposed = true;
    this.pluginModule = null;
  }

  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  setMemoryUsage(bytes: number): void {
    this.memoryUsage = bytes;
  }

  getTrackedTimerCount(): number {
    return this.trackedTimers.size;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  checkIpcRateLimit(): boolean {
    const now = Date.now();
    if (now - this.ipcResetTime >= 1000) {
      this.ipcCallCount = 0;
      this.ipcResetTime = now;
    }
    this.ipcCallCount++;
    if (this.ipcCallCount > this.ipcRateLimit) {
      return false; // Rate limited
    }
    return true;
  }

  getIpcCallCount(): number {
    return this.ipcCallCount;
  }

  setIpcRateLimit(limit: number): void {
    this.ipcRateLimit = limit;
  }

  getPluginId(): string {
    return this.pluginId;
  }

  private createSandboxedGlobals(): SandboxGlobals {
    const self = this;

    return {
      // No direct require access
      require: undefined as any,

      // Redirected console - all output scoped to plugin
      console: {
        log: (...args: any[]) => self.logger.info(...args),
        error: (...args: any[]) => self.logger.error(...args),
        warn: (...args: any[]) => self.logger.warn(...args),
        info: (...args: any[]) => self.logger.info(...args),
        debug: (...args: any[]) => self.logger.debug(...args),
      },

      // Tracked timers for CPU time accounting
      setTimeout: (fn: (...args: any[]) => void, ms: number, ...args: any[]) => {
        const id = global.setTimeout(fn, ms, ...args);
        const timerId = self.nextTimerId++;
        self.trackedTimers.set(timerId, {
          id, type: 'timeout', startTime: Date.now(), cpuTime: 0
        });
        return id;
      },

      setInterval: (fn: (...args: any[]) => void, ms: number, ...args: any[]) => {
        const id = global.setInterval(fn, ms, ...args);
        const timerId = self.nextTimerId++;
        self.trackedTimers.set(timerId, {
          id, type: 'interval', startTime: Date.now(), cpuTime: 0
        });
        return id;
      },

      clearTimeout: (id: ReturnType<typeof setTimeout>) => {
        for (const [key, timer] of self.trackedTimers) {
          if (timer.id === id) {
            self.trackedTimers.delete(key);
            break;
          }
        }
        global.clearTimeout(id as any);
      },

      clearInterval: (id: ReturnType<typeof setInterval>) => {
        for (const [key, timer] of self.trackedTimers) {
          if (timer.id === id) {
            self.trackedTimers.delete(key);
            break;
          }
        }
        global.clearInterval(id as any);
      },

      // Frozen Object to prevent prototype pollution
      Object: Object.freeze({
        ...Object,
        defineProperty: Object.defineProperty,
        getPrototypeOf: Object.getPrototypeOf,
        setPrototypeOf: () => {
          throw new Error('setPrototypeOf is not allowed in plugin sandbox');
        },
        __proto__: null,
      }) as any,
    };
  }
}

interface SandboxGlobals {
  require: undefined;
  console: Record<string, (...args: any[]) => void>;
  setTimeout: (...args: any[]) => ReturnType<typeof setTimeout>;
  setInterval: (...args: any[]) => ReturnType<typeof setInterval>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  Object: object;
}

export class ScopedLogger {
  constructor(private scope: string) {}

  info(...args: any[]): void {
    console.log(`[plugin:${this.scope}]`, ...args);
  }

  error(...args: any[]): void {
    console.error(`[plugin:${this.scope}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[plugin:${this.scope}]`, ...args);
  }

  debug(...args: any[]): void {
    console.debug(`[plugin:${this.scope}]`, ...args);
  }
}
