// VibeCode System Observability - Status Provider v8.0
// Aggregates system health status from all services

import { EventEmitter } from 'events';
import type { ServiceInfo, ServiceState } from '../kernel/types';

export interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy' | 'starting';
  services: ServiceInfo[];
  activePlugins: string[];
  uptime: number;
  timestamp: number;
  version: string;
}

export class StatusProvider extends EventEmitter {
  private services = new Map<string, ServiceInfo>();
  private activePlugins: string[] = [];
  private startTime = Date.now();

  registerService(info: ServiceInfo): void {
    this.services.set(info.name, info);
    this.emit('status:service-registered', info);
  }

  updateServiceState(name: string, state: ServiceState): void {
    const info = this.services.get(name);
    if (info) {
      info.state = state;
      this.services.set(name, info);
      this.emit('status:service-updated', { name, state });
    }
  }

  setActivePlugins(plugins: string[]): void {
    this.activePlugins = [...plugins];
  }

  getSystemStatus(): SystemStatus {
    const services = Array.from(this.services.values());
    const states = services.map(s => s.state);

    let overall: SystemStatus['overall'];
    if (states.includes('failed')) {
      overall = 'unhealthy';
    } else if (states.includes('degraded') || states.includes('initializing')) {
      overall = 'degraded';
    } else if (states.every(s => s === 'ready')) {
      overall = 'healthy';
    } else {
      overall = 'starting';
    }

    return {
      overall,
      services,
      activePlugins: [...this.activePlugins],
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      version: '8.0.0',
    };
  }

  getServiceInfo(name: string): ServiceInfo | undefined {
    return this.services.get(name);
  }

  getAllServices(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  reset(): void {
    this.services.clear();
    this.activePlugins = [];
    this.startTime = Date.now();
  }
}
