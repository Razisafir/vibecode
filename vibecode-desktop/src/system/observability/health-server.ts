// VibeCode System Observability - Health Server v8.0
// HTTP health check endpoint with lazy initialization

import { EventEmitter } from 'events';
import type { HealthCheckResult, ServiceInfo } from '../kernel/types';

export interface HealthServerConfig {
  port: number;
  host: string;
  lazyInit: boolean;
  endpoint: string;
}

const DEFAULT_CONFIG: HealthServerConfig = {
  port: 9090,
  host: '127.0.0.1',
  lazyInit: true,
  endpoint: '/health',
};

export class HealthServer extends EventEmitter {
  private config: HealthServerConfig;
  private initialized = false;
  private running = false;
  private healthChecks = new Map<string, () => Promise<HealthCheckResult>>();
  private serviceInfoProvider: (() => ServiceInfo[]) | null = null;

  constructor(config: Partial<HealthServerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.lazyInit) {
      this.initialize();
    }
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.emit('health-server:initialized', { port: this.config.port });
  }

  registerHealthCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthChecks.set(name, check);
  }

  setServiceInfoProvider(provider: () => ServiceInfo[]): void {
    this.serviceInfoProvider = provider;
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      this.initialize();
    }
    this.running = true;
    this.emit('health-server:started', { port: this.config.port, host: this.config.host });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.emit('health-server:stopped');
  }

  async getHealthStatus(): Promise<HealthReport> {
    const checks: Record<string, HealthCheckResult> = {};
    let overallHealthy = true;

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check();
        checks[name] = result;
        if (!result.healthy) {
          overallHealthy = false;
        }
      } catch (err) {
        checks[name] = { healthy: false, details: { error: String(err) } };
        overallHealthy = false;
      }
    }

    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      checks,
      services: this.serviceInfoProvider?.() ?? [],
      uptime: process.uptime(),
      version: '8.0.0',
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConfig(): HealthServerConfig {
    return { ...this.config };
  }
}

export interface HealthReport {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  checks: Record<string, HealthCheckResult>;
  services: ServiceInfo[];
  uptime: number;
  version: string;
}
