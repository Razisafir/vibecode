// ─── Telemetry Service ─────────────────────────────────────────────────────
// Central telemetry service that tracks memory usage, IPC latency, execution
// timing, cache stats, and event listener counts. Samples every 10 seconds.
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TelemetryMetrics {
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  execution: {
    activePlans: number;
    completedPlans: number;
    failedPlans: number;
    avgDuration: number;
  };
  ipc: {
    avgLatency: number;
    p95Latency: number;
    totalCalls: number;
  };
  cache: {
    hitRate: number;
    size: number;
    evictions: number;
  };
  timestamps: {
    lastUpdated: number;
    uptime: number;
  };
}

interface IpcCallRecord {
  channel: string;
  durationMs: number;
  timestamp: number;
}

interface ExecutionRecord {
  type: string;
  durationMs?: number;
  timestamp: number;
}

// ─── Telemetry Service ──────────────────────────────────────────────────────

class TelemetryService extends EventEmitter {
  private samplingTimer: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  private readonly SAMPLE_INTERVAL_MS = 10_000;

  // IPC latency tracking — bounded buffer of recent calls
  private ipcCalls: IpcCallRecord[] = [];
  private readonly MAX_IPC_RECORDS = 1000;

  // Execution tracking
  private executionEvents: ExecutionRecord[] = [];
  private readonly MAX_EXECUTION_RECORDS = 500;
  private activePlanCount: number = 0;
  private completedPlanCount: number = 0;
  private failedPlanCount: number = 0;
  private totalPlanDuration: number = 0;

  // Cache tracking
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private cacheSize: number = 0;
  private cacheEvictions: number = 0;

  // Renderer FPS tracking
  private lastRendererFps: number = 0;
  private lastHeartbeat: number = Date.now();

  // Current memory snapshot
  private currentMemory: TelemetryMetrics['memory'] = {
    rss: 0,
    heapUsed: 0,
    heapTotal: 0,
    external: 0,
    arrayBuffers: 0,
  };

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Start periodic sampling of telemetry metrics */
  startMonitoring(): void {
    if (this.samplingTimer) return;

    this.startTime = Date.now();
    this.sampleMemory();

    this.samplingTimer = setInterval(() => {
      this.sampleMemory();
      this.emit('telemetry:sampled', this.getMetrics());
    }, this.SAMPLE_INTERVAL_MS);

    // Don't prevent process exit
    if (this.samplingTimer.unref) {
      this.samplingTimer.unref();
    }

    this.emit('telemetry:started');
  }

  /** Stop periodic sampling */
  stopMonitoring(): void {
    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }
    this.emit('telemetry:stopped');
  }

  /** Get current telemetry metrics snapshot */
  getMetrics(): TelemetryMetrics {
    const ipcStats = this.computeIpcStats();
    const execStats = this.computeExecutionStats();

    return {
      memory: { ...this.currentMemory },
      execution: execStats,
      ipc: ipcStats,
      cache: {
        hitRate: this.computeCacheHitRate(),
        size: this.cacheSize,
        evictions: this.cacheEvictions,
      },
      timestamps: {
        lastUpdated: Date.now(),
        uptime: Date.now() - this.startTime,
      },
    };
  }

  /** Record an IPC call's timing */
  recordIpcCall(channel: string, durationMs: number): void {
    const record: IpcCallRecord = {
      channel,
      durationMs,
      timestamp: Date.now(),
    };

    this.ipcCalls.push(record);

    // Enforce bounds
    if (this.ipcCalls.length > this.MAX_IPC_RECORDS) {
      this.ipcCalls.shift();
    }
  }

  /** Record an execution event (plan started, completed, failed) */
  recordExecutionEvent(type: string, durationMs?: number): void {
    const record: ExecutionRecord = {
      type,
      durationMs,
      timestamp: Date.now(),
    };

    this.executionEvents.push(record);

    // Enforce bounds
    if (this.executionEvents.length > this.MAX_EXECUTION_RECORDS) {
      this.executionEvents.shift();
    }

    // Update counters
    switch (type) {
      case 'plan:started':
        this.activePlanCount++;
        break;
      case 'plan:completed':
        this.activePlanCount = Math.max(0, this.activePlanCount - 1);
        this.completedPlanCount++;
        if (durationMs !== undefined) {
          this.totalPlanDuration += durationMs;
        }
        break;
      case 'plan:failed':
        this.activePlanCount = Math.max(0, this.activePlanCount - 1);
        this.failedPlanCount++;
        break;
    }
  }

  /** Record a cache hit or miss */
  recordCacheEvent(hit: boolean): void {
    if (hit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /** Update cache size (called by memory store) */
  setCacheSize(size: number): void {
    this.cacheSize = size;
  }

  /** Record a cache eviction */
  recordCacheEviction(count: number = 1): void {
    this.cacheEvictions += count;
  }

  /** Record renderer heartbeat with FPS data */
  recordRendererHeartbeat(fps: number): void {
    this.lastRendererFps = fps;
    this.lastHeartbeat = Date.now();
  }

  /** Get the last renderer heartbeat timestamp */
  getLastHeartbeatTime(): number {
    return this.lastHeartbeat;
  }

  /** Get the last renderer FPS */
  getRendererFps(): number {
    return this.lastRendererFps;
  }

  /** Get recent IPC call records for diagnostics */
  getRecentIpcCalls(count: number = 50): IpcCallRecord[] {
    return this.ipcCalls.slice(-count);
  }

  /** Get recent execution events for diagnostics */
  getRecentExecutionEvents(count: number = 50): ExecutionRecord[] {
    return this.executionEvents.slice(-count);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private sampleMemory(): void {
    try {
      const usage = process.memoryUsage();
      this.currentMemory = {
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers,
      };
    } catch {
      // process.memoryUsage() may not be available in all contexts
    }
  }

  private computeIpcStats(): TelemetryMetrics['ipc'] {
    if (this.ipcCalls.length === 0) {
      return { avgLatency: 0, p95Latency: 0, totalCalls: 0 };
    }

    const durations = this.ipcCalls.map((c) => c.durationMs).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;

    // P95: 95th percentile
    const p95Index = Math.ceil(durations.length * 0.95) - 1;
    const p95 = durations[Math.max(0, p95Index)];

    return {
      avgLatency: Math.round(avg * 100) / 100,
      p95Latency: Math.round(p95 * 100) / 100,
      totalCalls: this.ipcCalls.length,
    };
  }

  private computeExecutionStats(): TelemetryMetrics['execution'] {
    const completedWithDurations = this.executionEvents.filter(
      (e) => e.type === 'plan:completed' && e.durationMs !== undefined
    );

    let avgDuration = 0;
    if (completedWithDurations.length > 0) {
      const totalDuration = completedWithDurations.reduce(
        (sum, e) => sum + (e.durationMs ?? 0),
        0
      );
      avgDuration = Math.round(totalDuration / completedWithDurations.length);
    }

    return {
      activePlans: this.activePlanCount,
      completedPlans: this.completedPlanCount,
      failedPlans: this.failedPlanCount,
      avgDuration,
    };
  }

  private computeCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 0;
    return Math.round((this.cacheHits / total) * 100) / 100;
  }
}

// Singleton instance
export const telemetry = new TelemetryService();
