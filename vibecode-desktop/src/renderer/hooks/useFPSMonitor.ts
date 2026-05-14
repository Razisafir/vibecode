// ─── useFPSMonitor Hook ───────────────────────────────────────────────────
// Measures renderer FPS and sends heartbeat data to the main process
// every 5 seconds. Tracks freeze events (FPS < 5 for > 2 seconds).
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from 'react';

interface FPSMonitorOptions {
  /** How often to report FPS to main process (default: 5000ms) */
  reportIntervalMs?: number;
  /** FPS threshold below which is considered a "freeze" (default: 5) */
  freezeThreshold?: number;
  /** How long FPS must be below threshold to count as a freeze event (default: 2000ms) */
  freezeDurationMs?: number;
}

interface FPSMonitorState {
  currentFps: number;
  averageFps: number;
  freezeCount: number;
  isFrozen: boolean;
}

/**
 * Hook that monitors renderer FPS and reports it to the main process
 * via the telemetry:sendHeartbeat IPC channel.
 */
export function useFPSMonitor(options?: FPSMonitorOptions): FPSMonitorState {
  const reportIntervalMs = options?.reportIntervalMs ?? 5000;
  const freezeThreshold = options?.freezeThreshold ?? 5;
  const freezeDurationMs = options?.freezeDurationMs ?? 2000;

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const currentFpsRef = useRef(60);
  const averageFpsRef = useRef(60);
  const freezeCountRef = useRef(0);
  const isFrozenRef = useRef(false);
  const freezeStartRef = useRef<number | null>(null);
  const fpsSamplesRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number>(0);
  const reportTimerRef = useRef<NodeJS.Timeout | null>(null);

  const measureFrame = useCallback(() => {
    frameCountRef.current++;
    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    // Update FPS every second
    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      currentFpsRef.current = fps;
      frameCountRef.current = 0;
      lastTimeRef.current = now;

      // Track for average
      fpsSamplesRef.current.push(fps);
      if (fpsSamplesRef.current.length > 60) {
        fpsSamplesRef.current.shift();
      }

      // Calculate rolling average
      const sum = fpsSamplesRef.current.reduce((a, b) => a + b, 0);
      averageFpsRef.current = Math.round(sum / fpsSamplesRef.current.length);

      // Detect freeze events
      if (fps < freezeThreshold) {
        if (freezeStartRef.current === null) {
          freezeStartRef.current = now;
        } else if (now - freezeStartRef.current > freezeDurationMs) {
          if (!isFrozenRef.current) {
            isFrozenRef.current = true;
            freezeCountRef.current++;
          }
        }
      } else {
        freezeStartRef.current = null;
        isFrozenRef.current = false;
      }
    }

    animationFrameRef.current = requestAnimationFrame(measureFrame);
  }, [freezeThreshold, freezeDurationMs]);

  // Send heartbeat to main process
  const sendHeartbeat = useCallback(async () => {
    try {
      if (window.vibecode?.telemetry) {
        await window.vibecode.telemetry.sendHeartbeat({
          fps: currentFpsRef.current,
        });
      }
    } catch {
      // Best-effort heartbeat — don't spam errors
    }
  }, []);

  useEffect(() => {
    // Start FPS measurement
    animationFrameRef.current = requestAnimationFrame(measureFrame);

    // Start periodic heartbeat reporting
    reportTimerRef.current = setInterval(sendHeartbeat, reportIntervalMs);

    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (reportTimerRef.current) {
        clearInterval(reportTimerRef.current);
      }
    };
  }, [measureFrame, sendHeartbeat, reportIntervalMs]);

  return {
    currentFps: currentFpsRef.current,
    averageFps: averageFpsRef.current,
    freezeCount: freezeCountRef.current,
    isFrozen: isFrozenRef.current,
  };
}
