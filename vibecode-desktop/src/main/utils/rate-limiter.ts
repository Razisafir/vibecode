// ============================================================
// VibeCode Desktop — Rate Limiter
// Per-channel sliding window rate limiting for IPC calls
// ============================================================

import { logger } from './logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];   // Sliding window of request timestamps
}

interface RateLimitConfig {
  maxCalls: number;       // Max calls allowed within the window
  windowMs: number;       // Sliding window duration in milliseconds
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;  // How long until the oldest entry expires
}

// ─── Default Rate Limits ─────────────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000; // 1 minute

const CHANNEL_LIMITS: Record<string, RateLimitConfig> = {
  'provider:chat':            { maxCalls: 10,  windowMs: 60_000 },
  'provider:configure':       { maxCalls: 5,   windowMs: 60_000 },
  'provider:update':          { maxCalls: 5,   windowMs: 60_000 },
  'provider:setActive':       { maxCalls: 10,  windowMs: 60_000 },
  'execution:execute':        { maxCalls: 20,  windowMs: 60_000 },
  'execution:plan':           { maxCalls: 20,  windowMs: 60_000 },
  'execution:propose':        { maxCalls: 20,  windowMs: 60_000 },
  'execution:approve':        { maxCalls: 20,  windowMs: 60_000 },
  'memory:store':             { maxCalls: 60,  windowMs: 60_000 },
  'memory:update':            { maxCalls: 60,  windowMs: 60_000 },
  'fs:writeFile':             { maxCalls: 60,  windowMs: 60_000 },
  'fs:delete':                { maxCalls: 30,  windowMs: 60_000 },
  'session:save':             { maxCalls: 30,  windowMs: 60_000 },
  'session:saveEnhanced':     { maxCalls: 30,  windowMs: 60_000 },
  'workspace:open':           { maxCalls: 10,  windowMs: 60_000 },
  'workspace:switchWorkspace': { maxCalls: 10, windowMs: 60_000 },
};

const DEFAULT_LIMIT: RateLimitConfig = { maxCalls: 100, windowMs: DEFAULT_WINDOW_MS };

// ─── RateLimiter ─────────────────────────────────────────────────────────────

class RateLimiter {
  /** Map of "channel:senderId" → rate limit entry */
  private entries: Map<string, RateLimitEntry> = new Map();

  /** Periodic cleanup timer */
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up stale entries every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check whether an IPC call is allowed under the rate limit.
   *
   * @param channel  - The IPC channel name (e.g. "provider:chat")
   * @param senderId - The webContents ID of the sender (for per-sender limits)
   * @returns Whether the call is allowed, and if not, how long to wait
   */
  checkRateLimit(channel: string, senderId: number): RateLimitResult {
    const key = `${channel}:${senderId}`;
    const config = CHANNEL_LIMITS[channel] ?? DEFAULT_LIMIT;
    const now = Date.now();

    // Get or create entry
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.entries.set(key, entry);
    }

    // Remove timestamps outside the sliding window
    const windowStart = now - config.windowMs;
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

    // Check if under limit
    if (entry.timestamps.length < config.maxCalls) {
      entry.timestamps.push(now);
      return { allowed: true };
    }

    // Rate limited — calculate retry-after
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow !== undefined
      ? oldestInWindow + config.windowMs - now
      : config.windowMs;

    logger.warn('ipc', `Rate limit exceeded for channel "${channel}" (sender: ${senderId})`, {
      channel,
      senderId,
      callCount: entry.timestamps.length,
      maxCalls: config.maxCalls,
      retryAfterMs: Math.max(0, retryAfterMs),
    });

    return {
      allowed: false,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  /**
   * Reset rate limit counters.
   *
   * @param channel - If provided, only reset limits for this channel.
   *                  If omitted, reset all limits.
   */
  resetLimits(channel?: string): void {
    if (channel) {
      // Remove all entries for this channel (across all senders)
      for (const key of this.entries.keys()) {
        if (key.startsWith(channel + ':')) {
          this.entries.delete(key);
        }
      }
    } else {
      this.entries.clear();
    }
  }

  /** Get the current config for a channel (for diagnostics) */
  getLimit(channel: string): RateLimitConfig {
    return CHANNEL_LIMITS[channel] ?? DEFAULT_LIMIT;
  }

  /** Dispose of the rate limiter, stopping the cleanup timer */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.entries.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────

  /** Remove stale entries that haven't been used in over 10 minutes */
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60_000; // 10 minutes

    for (const [key, entry] of this.entries) {
      // If the newest timestamp is older than the threshold, remove the entry
      const newest = entry.timestamps[entry.timestamps.length - 1];
      if (newest === undefined || (now - newest) > staleThreshold) {
        this.entries.delete(key);
      }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const rateLimiter = new RateLimiter();
