// ─── Foundation Stabilization Utilities ─────────────────────────────────────
// Provides critical stability safeguards for the VibeCode Desktop app:
//   - Bounded buffers that prevent unbounded memory growth
//   - Watcher lifecycle management with automatic cleanup
//   - Stream throttling to prevent renderer flooding
//   - Debounced state updates to prevent stale state cascades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bounded buffer that discards the oldest entries when capacity is reached.
 * Used to prevent unbounded memory growth from streaming data, logs, etc.
 */
export class BoundedBuffer<T> {
  private buffer: T[] = [];
  private readonly maxSize: number;
  private totalAppended: number = 0;
  private totalDropped: number = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = Math.max(1, maxSize);
  }

  /** Append an item. If the buffer is full, the oldest item is dropped. */
  append(item: T): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
      this.totalDropped++;
    }
    this.buffer.push(item);
    this.totalAppended++;
  }

  /** Get all items currently in the buffer. */
  items(): readonly T[] {
    return this.buffer;
  }

  /** Get the current number of items. */
  get length(): number {
    return this.buffer.length;
  }

  /** Clear the buffer. */
  clear(): void {
    this.buffer = [];
  }

  /** Get stats about the buffer usage. */
  stats(): { length: number; maxSize: number; totalAppended: number; totalDropped: number } {
    return {
      length: this.buffer.length,
      maxSize: this.maxSize,
      totalAppended: this.totalAppended,
      totalDropped: this.totalDropped,
    };
  }
}

/**
 * A string buffer that limits total character length.
 * Used for stream buffers to prevent memory pressure from
 * accumulating large LLM responses.
 */
export class BoundedStringBuffer {
  private content: string = '';
  private readonly maxChars: number;
  private truncated: boolean = false;

  constructor(maxChars: number = 100_000) {
    this.maxChars = Math.max(1000, maxChars);
  }

  /** Append text. If the total exceeds maxChars, the beginning is trimmed. */
  append(text: string): void {
    this.content += text;
    if (this.content.length > this.maxChars) {
      // Keep the most recent content
      this.content = this.content.slice(-this.maxChars);
      this.truncated = true;
    }
  }

  /** Get the current content. */
  get(): string {
    return this.content;
  }

  /** Clear the buffer. */
  clear(): void {
    this.content = '';
    this.truncated = false;
  }

  /** Whether the buffer has been truncated (old content dropped). */
  isTruncated(): boolean {
    return this.truncated;
  }

  /** Current content length. */
  get length(): number {
    return this.content.length;
  }
}

/**
 * Throttles a callback to fire at most once per `intervalMs`.
 * The last call within the interval is always delivered.
 */
export class ThrottledEmitter<T> {
  private lastEmitTime: number = 0;
  private pendingValue: T | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly callback: (value: T) => void;

  constructor(callback: (value: T) => void, intervalMs: number = 50) {
    this.callback = callback;
    this.intervalMs = intervalMs;
  }

  /** Emit a value. Will be throttled if called too rapidly. */
  emit(value: T): void {
    const now = Date.now();
    const elapsed = now - this.lastEmitTime;

    if (elapsed >= this.intervalMs) {
      // Enough time has passed — emit immediately
      this.lastEmitTime = now;
      this.callback(value);
    } else {
      // Too soon — schedule the trailing emit
      this.pendingValue = value;
      if (!this.pendingTimer) {
        this.pendingTimer = setTimeout(() => {
          this.pendingTimer = null;
          if (this.pendingValue !== null) {
            this.lastEmitTime = Date.now();
            this.callback(this.pendingValue);
            this.pendingValue = null;
          }
        }, this.intervalMs - elapsed);
      }
    }
  }

  /** Force-emit any pending value immediately. */
  flush(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.pendingValue !== null) {
      this.callback(this.pendingValue);
      this.pendingValue = null;
    }
  }

  /** Clean up any pending timers. */
  dispose(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pendingValue = null;
  }
}

/**
 * Debounces a callback to fire only after `delayMs` of inactivity.
 * Useful for state updates that should not cascade rapidly.
 */
export class DebouncedUpdater<T> {
  private timer: NodeJS.Timeout | null = null;
  private readonly delayMs: number;
  private readonly callback: (value: T) => void;

  constructor(callback: (value: T) => void, delayMs: number = 100) {
    this.callback = callback;
    this.delayMs = delayMs;
  }

  /** Schedule an update. Resets the timer on each call. */
  update(value: T): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.callback(value);
    }, this.delayMs);
  }

  /** Force-emit the latest value immediately. */
  flush(value: T): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.callback(value);
  }

  /** Clean up. */
  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Manages a set of disposable resources (timers, watchers, listeners)
 * that must be cleaned up when a component unmounts or a scope ends.
 */
export class ResourceDisposalBag {
  private disposables: Array<() => void> = [];

  /** Add a disposable resource. */
  add(dispose: () => void): void {
    this.disposables.push(dispose);
  }

  /** Add a timer that will be cleared on disposal. */
  addTimer(timer: NodeJS.Timeout): void {
    this.disposables.push(() => clearTimeout(timer));
  }

  /** Add an interval that will be cleared on disposal. */
  addInterval(interval: NodeJS.Timeout): void {
    this.disposables.push(() => clearInterval(interval));
  }

  /** Dispose all registered resources. */
  disposeAll(): void {
    for (const dispose of this.disposables) {
      try {
        dispose();
      } catch {
        // Best-effort disposal
      }
    }
    this.disposables = [];
  }

  /** Number of registered resources. */
  get size(): number {
    return this.disposables.length;
  }
}

/**
 * Memory pressure monitor. Periodically checks process memory usage
 * and fires a callback when memory usage exceeds a threshold.
 */
export class MemoryPressureMonitor {
  private timer: NodeJS.Timeout | null = null;
  private readonly thresholdMB: number;
  private readonly checkIntervalMs: number;
  private readonly onPressure: (usedMB: number, thresholdMB: number) => void;

  constructor(
    onPressure: (usedMB: number, thresholdMB: number) => void,
    thresholdMB: number = 512,
    checkIntervalMs: number = 30_000,
  ) {
    this.onPressure = onPressure;
    this.thresholdMB = thresholdMB;
    this.checkIntervalMs = checkIntervalMs;
  }

  /** Start monitoring. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / (1024 * 1024);
        if (heapUsedMB > this.thresholdMB) {
          this.onPressure(heapUsedMB, this.thresholdMB);
        }
      } catch {
        // process.memoryUsage() may not be available in all contexts
      }
    }, this.checkIntervalMs);
  }

  /** Stop monitoring. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Get current memory usage. */
  getCurrentUsage(): { heapUsedMB: number; heapTotalMB: number; rssMB: number } | null {
    try {
      const usage = process.memoryUsage();
      return {
        heapUsedMB: usage.heapUsed / (1024 * 1024),
        heapTotalMB: usage.heapTotal / (1024 * 1024),
        rssMB: usage.rss / (1024 * 1024),
      };
    } catch {
      return null;
    }
  }
}
