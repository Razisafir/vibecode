// VibeCode System Observability - Telemetry v8.0
// Structured telemetry with sampling support for performance-sensitive paths

import { EventEmitter } from 'events';
import type { TelemetryEvent } from '../kernel/types';

export interface TelemetryConfig {
  enabled: boolean;
  samplingRate: number; // 0.0 to 1.0
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  privacyMode: boolean;
}

const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  samplingRate: 1.0,
  batchSize: 50,
  flushIntervalMs: 5000,
  maxQueueSize: 1000,
  privacyMode: false,
};

export class Telemetry extends EventEmitter {
  private config: TelemetryConfig;
  private queue: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private eventCount = 0;
  private droppedCount = 0;
  private initialized = false;

  constructor(config: Partial<TelemetryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.startFlushTimer();
  }

  trackEvent(name: string, properties?: Record<string, unknown>, measurements?: Record<string, number>): void {
    if (!this.config.enabled) return;

    // Sampling: skip events based on sampling rate
    if (Math.random() > this.config.samplingRate) {
      this.eventCount++;
      return;
    }

    // Privacy mode: strip PII
    const sanitizedProperties = this.config.privacyMode
      ? this.sanitizeProperties(properties)
      : properties;

    const event: TelemetryEvent = {
      name,
      timestamp: Date.now(),
      properties: sanitizedProperties,
      measurements,
    };

    if (this.queue.length >= this.config.maxQueueSize) {
      this.droppedCount++;
      this.emit('telemetry:dropped', { name, reason: 'queue_full' });
      return;
    }

    this.queue.push(event);
    this.eventCount++;

    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  flush(): TelemetryEvent[] {
    const events = [...this.queue];
    this.queue = [];
    if (events.length > 0) {
      this.emit('telemetry:flushed', { count: events.length, events });
    }
    return events;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getEventCount(): number {
    return this.eventCount;
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  setSamplingRate(rate: number): void {
    this.config.samplingRate = Math.max(0, Math.min(1, rate));
  }

  getSamplingRate(): number {
    return this.config.samplingRate;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  shutdown(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.initialized = false;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushIntervalMs);
  }

  private sanitizeProperties(properties?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!properties) return undefined;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      // Remove potentially sensitive keys
      if (/email|password|token|secret|key|ip/i.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}

// Singleton
let instance: Telemetry | null = null;

export function getTelemetry(config?: Partial<TelemetryConfig>): Telemetry {
  if (!instance) {
    instance = new Telemetry(config);
  }
  return instance;
}

export function resetTelemetry(): void {
  if (instance) {
    instance.shutdown();
  }
  instance = null;
}
