// IPC Router - Per-window IPC routing with broadcast and message enrichment
// Phase 9: Multi-Window Architecture

import type { IPCMessage, IPCRouteConfig, WindowRole } from '../kernel/types';
import { EventEmitter } from 'events';

interface RouteEntry {
  channel: string;
  handler: (msg: IPCMessage) => unknown;
  windowId?: string;
}

export class IPCRouter extends EventEmitter {
  private routes = new Map<string, RouteEntry[]>();
  private globalHandlers = new Map<string, RouteEntry>();
  private windowRoutes = new Map<string, Set<string>>(); // windowId -> route keys
  private rateLimitCounters = new Map<string, { count: number; resetTime: number }>();
  private rateLimitPerWindow = 1000; // messages per second per window
  private destroyedWindows = new Set<string>();

  registerRoute(config: IPCRouteConfig): () => void {
    const key = config.windowId
      ? `${config.channel}:${config.windowId}`
      : `global:${config.channel}`;

    const entry: RouteEntry = {
      channel: config.channel,
      handler: config.handler,
      windowId: config.windowId,
    };

    if (!config.windowId) {
      // Global handler (first-responder pattern)
      this.globalHandlers.set(config.channel, entry);
    } else {
      // Per-window handler
      if (!this.routes.has(key)) {
        this.routes.set(key, []);
      }
      this.routes.get(key)!.push(entry);

      // Track routes per window for cleanup
      if (!this.windowRoutes.has(config.windowId)) {
        this.windowRoutes.set(config.windowId, new Set());
      }
      this.windowRoutes.get(config.windowId)!.add(key);
    }

    // Return disposable
    return () => {
      if (config.windowId) {
        const entries = this.routes.get(key);
        if (entries) {
          const idx = entries.indexOf(entry);
          if (idx >= 0) entries.splice(idx, 1);
          if (entries.length === 0) this.routes.delete(key);
        }
        this.windowRoutes.get(config.windowId)?.delete(key);
      } else {
        this.globalHandlers.delete(config.channel);
      }
    };
  }

  send(message: Omit<IPCMessage, 'timestamp' | 'windowId' | 'windowRole'>, windowId: string, windowRole?: WindowRole): unknown {
    // Check rate limit
    if (!this.checkRateLimit(windowId)) {
      this.emit('rate-limited', { windowId, channel: message.channel });
      return undefined;
    }

    // Enrich message with windowId and windowRole
    const enriched: IPCMessage = {
      ...message,
      timestamp: Date.now(),
      windowId,
      windowRole,
      sourceWindowId: message.sourceWindowId || windowId,
    };

    // Try per-window handler first
    const windowKey = `${message.channel}:${windowId}`;
    const windowEntries = this.routes.get(windowKey);
    if (windowEntries && windowEntries.length > 0) {
      return windowEntries[0].handler(enriched);
    }

    // Fall back to global handler (first-responder)
    const globalEntry = this.globalHandlers.get(message.channel);
    if (globalEntry) {
      return globalEntry.handler(enriched);
    }

    this.emit('unhandled', enriched);
    return undefined;
  }

  broadcast(channel: string, data?: unknown, sourceWindowId?: string): Map<string, unknown> {
    const results = new Map<string, unknown>();

    for (const [key, entries] of this.routes) {
      if (key.startsWith(`${channel}:`)) {
        for (const entry of entries) {
          if (entry.windowId && !this.destroyedWindows.has(entry.windowId)) {
            const msg: IPCMessage = {
              channel,
              data,
              timestamp: Date.now(),
              windowId: entry.windowId,
              sourceWindowId: sourceWindowId ?? 'broadcast',
            };
            results.set(entry.windowId, entry.handler(msg));
          }
        }
      }
    }

    return results;
  }

  removeWindowRoutes(windowId: string): void {
    const routeKeys = this.windowRoutes.get(windowId);
    if (routeKeys) {
      for (const key of routeKeys) {
        this.routes.delete(key);
      }
      this.windowRoutes.delete(windowId);
    }
    this.destroyedWindows.add(windowId);
  }

  isWindowDestroyed(windowId: string): boolean {
    return this.destroyedWindows.has(windowId);
  }

  getRouteCount(): number {
    let count = this.globalHandlers.size;
    for (const entries of this.routes.values()) {
      count += entries.length;
    }
    return count;
  }

  getWindowRouteCount(windowId: string): number {
    return this.windowRoutes.get(windowId)?.size ?? 0;
  }

  setRateLimit(limit: number): void {
    this.rateLimitPerWindow = limit;
  }

  private checkRateLimit(windowId: string): boolean {
    const now = Date.now();
    let counter = this.rateLimitCounters.get(windowId);
    if (!counter || now - counter.resetTime >= 1000) {
      counter = { count: 0, resetTime: now };
      this.rateLimitCounters.set(windowId, counter);
    }
    counter.count++;
    return counter.count <= this.rateLimitPerWindow;
  }
}
