// VibeCode System Supervision - Watchdog v8.0
// Monitors service health with lazy initialization (starts after 10s delay)

import { EventEmitter } from 'events';
import type { HealthCheckResult } from '../kernel/types';

export interface WatchdogConfig {
  checkIntervalMs: number;
  failureThreshold: number;
  startupDelayMs: number;
  autoRestart: boolean;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  checkIntervalMs: 5000,
  failureThreshold: 3,
  startupDelayMs: 10000, // 10s lazy init
  autoRestart: true,
};

export class Watchdog extends EventEmitter {
  private config: WatchdogConfig;
  private checks = new Map<string, () => Promise<HealthCheckResult>>();
  private failureCounts = new Map<string, number>();
  private intervalId: NodeJS.Timeout | null = null;
  private initialized = false;
  private startupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<WatchdogConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.initialized) return;

    // Lazy initialization: delay start by configured amount
    this.startupTimer = setTimeout(() => {
      this.initialized = true;
      this.startChecking();
      this.emit('watchdog:started');
    }, this.config.startupDelayMs);
  }

  stop(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.initialized = false;
    this.emit('watchdog:stopped');
  }

  registerCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, check);
    this.failureCounts.set(name, 0);
  }

  unregisterCheck(name: string): void {
    this.checks.delete(name);
    this.failureCounts.delete(name);
  }

  async runCheck(name: string): Promise<HealthCheckResult | null> {
    const check = this.checks.get(name);
    if (!check) return null;

    try {
      const result = await check();
      if (result.healthy) {
        this.failureCounts.set(name, 0);
      } else {
        const count = (this.failureCounts.get(name) || 0) + 1;
        this.failureCounts.set(name, count);
        
        if (count >= this.config.failureThreshold) {
          this.emit('watchdog:threshold-exceeded', { name, count, threshold: this.config.failureThreshold });
        }
      }
      return result;
    } catch (err) {
      const count = (this.failureCounts.get(name) || 0) + 1;
      this.failureCounts.set(name, count);
      this.emit('watchdog:check-error', { name, error: err });
      return { healthy: false, details: { error: String(err) } };
    }
  }

  async runAllChecks(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    for (const [name] of this.checks) {
      const result = await this.runCheck(name);
      if (result) results.set(name, result);
    }
    return results;
  }

  getFailureCount(name: string): number {
    return this.failureCounts.get(name) || 0;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConfig(): WatchdogConfig {
    return { ...this.config };
  }

  private startChecking(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(async () => {
      await this.runAllChecks();
    }, this.config.checkIntervalMs);
  }
}
