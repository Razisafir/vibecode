// ============================================================
// VibeCode Desktop — Performance Optimization Module
// ARC 10 — Premium Performance & Responsiveness
// ============================================================

import React from 'react';

// ─── Monaco Lazy Loading ──────────────────────────────────────

let monacoLoaded = false;
let monacoLoadPromise: Promise<typeof import('monaco-editor')> | null = null;

/**
 * Lazy-loads Monaco editor only when needed.
 * Prevents the heavy Monaco bundle from blocking initial page load.
 */
export async function loadMonacoLazy(): Promise<typeof import('monaco-editor')> {
  if (monacoLoaded) {
    return import('monaco-editor');
  }

  if (monacoLoadPromise) {
    return monacoLoadPromise;
  }

  monacoLoadPromise = import('monaco-editor').then((monaco) => {
    monacoLoaded = true;
    return monaco;
  });

  return monacoLoadPromise;
}

// ─── Render Batching ──────────────────────────────────────────

/**
 * Batches multiple state updates into a single render.
 * Uses React 18's automatic batching via microtask.
 */
export function batchUpdates(callback: () => void): void {
  Promise.resolve().then(callback);
}

// ─── Animation Optimization ───────────────────────────────────

/**
 * Throttles a callback to run at most once per animation frame.
 * Useful for scroll, resize, and mouse-move handlers.
 */
export function throttleToFrame<T extends (...args: unknown[]) => void>(
  callback: T,
): T & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: unknown[] | null = null;

  const throttled = ((...args: unknown[]) => {
    lastArgs = args;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs !== null) {
          callback(...lastArgs);
          lastArgs = null;
        }
      });
    }
  }) as T & { cancel: () => void };

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

// ─── Virtualization Helper ────────────────────────────────────

/**
 * Calculates which items are visible in a virtualized list.
 * Returns the start and end indices of visible items.
 */
export function getVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  totalItems: number,
  overscan: number = 5,
): { start: number; end: number; visibleCount: number } {
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const end = Math.min(
    totalItems - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );
  return { start, end, visibleCount: end - start + 1 };
}

// ─── Memory Leak Prevention ───────────────────────────────────

/**
 * Creates a self-cleaning WeakMap-based cache that evicts entries
 * after a specified TTL. Prevents unbounded memory growth.
 */
export class TTLCache<K extends object, V> {
  private cache = new WeakMap<K, { value: V; expiry: number }>();
  private ttl: number;

  constructor(ttlMs: number = 60_000) {
    this.ttl = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.cache.set(key, { value, expiry: Date.now() + this.ttl });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }
}

// ─── FPS Monitor ──────────────────────────────────────────────

let fpsMonitorActive = false;
let frameCount = 0;
let lastFpsCheck = performance.now();
let currentFps = 60;

/**
 * Starts monitoring FPS. Call getFPS() to get the current reading.
 */
export function startFPSMonitor(): void {
  if (fpsMonitorActive) return;
  fpsMonitorActive = true;
  frameCount = 0;
  lastFpsCheck = performance.now();

  function tick(now: number) {
    if (!fpsMonitorActive) return;
    frameCount++;
    const elapsed = now - lastFpsCheck;
    if (elapsed >= 1000) {
      currentFps = Math.round((frameCount * 1000) / elapsed);
      frameCount = 0;
      lastFpsCheck = now;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/**
 * Stops the FPS monitor.
 */
export function stopFPSMonitor(): void {
  fpsMonitorActive = false;
}

/**
 * Gets the current FPS reading.
 */
export function getFPS(): number {
  return currentFps;
}

// ─── Panel Transition Smoothing ───────────────────────────────

/**
 * Creates a smooth resize animation for panel transitions.
 * Uses requestAnimationFrame with a spring-like easing curve.
 */
export function createSmoothResizer(
  element: HTMLElement,
  property: 'width' | 'height',
  targetValue: number,
  duration: number = 200,
): void {
  const startValue = element.getBoundingClientRect()[property];
  const delta = targetValue - startValue;
  const startTime = performance.now();

  element.style.transition = 'none';

  function animate(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);

    // Spring-like easing: ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);

    const currentValue = startValue + delta * eased;
    element.style[property] = `${currentValue}px`;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      element.style.transition = '';
    }
  }

  requestAnimationFrame(animate);
}

// ─── Startup Optimization ─────────────────────────────────────

/**
 * Defers non-critical work until the browser is idle.
 * Uses requestIdleCallback with setTimeout fallback.
 */
export function deferUntilIdle(callback: () => void, timeout: number = 2000): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, Math.min(timeout, 100));
  }
}

// ─── Bundle Reduction ─────────────────────────────────────────

/**
 * Marks a dynamic import as a separate chunk for code splitting.
 * Use this for heavy components that aren't needed on initial load.
 */
export function lazyComponent<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(importFn);
}
