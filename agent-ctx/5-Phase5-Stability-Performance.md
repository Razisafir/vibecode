# Task 5 — Phase 5: Stability + Performance

## Summary

Implemented comprehensive stability and performance infrastructure for VibeCode Desktop including telemetry, watchdog recovery, structured logging, crash dump generation, safe recovery mode, event listener leak detection, memory compaction, and FPS monitoring.

## Files Created (6)

1. **`src/main/services/telemetry.ts`** — Central telemetry service
   - Tracks memory (RSS, heapUsed, heapTotal, external, arrayBuffers) sampled every 10s
   - IPC latency tracking (avg + p95) with bounded buffer (1000 records)
   - Execution timing metrics (active/completed/failed plans, avg duration)
   - Cache hit/miss statistics
   - Renderer FPS tracking via heartbeat
   - Methods: startMonitoring(), stopMonitoring(), getMetrics(), recordIpcCall(), recordExecutionEvent(), recordCacheEvent()

2. **`src/main/services/watchdog.ts`** — Renderer health monitoring and recovery
   - Monitors heartbeat IPC from renderer (30s unresponsive threshold)
   - Escalating recovery: Level 1 (ping) → Level 2 (reload) → Level 3 (recreate)
   - Max 3 recovery attempts
   - Emits: watchdog:unresponsive, watchdog:recovered, watchdog:failed
   - Methods: startWatching(), stopWatching(), forceRecovery()

3. **`src/main/services/crash-dump.ts`** — Crash dump generation and management
   - Auto-generates on uncaught exception and unhandled rejection
   - Dumps include: error info, memory stats, recent IPC calls, execution events, platform info
   - Saves to ~/.vibecode/crash-dumps/{timestamp}.json
   - Max 10 dumps with auto-cleanup
   - Methods: initialize(), generateCrashDump(), hasCrashDumps(), listCrashDumps(), clearCrashDumps()

4. **`src/main/ipc/telemetry-handlers.ts`** — Telemetry IPC handlers
   - telemetry:getMetrics — returns current telemetry snapshot
   - telemetry:getRecentLogs — returns recent structured log entries
   - telemetry:getCrashDumps — lists all crash dumps
   - telemetry:sendHeartbeat — receives FPS data from renderer
   - telemetry:clearCrashDumps — deletes all crash dump files

5. **`src/renderer/hooks/useFPSMonitor.ts`** — FPS monitoring hook
   - Measures renderer FPS via requestAnimationFrame
   - Reports to main process every 5 seconds
   - Tracks freeze events (FPS < 5 for > 2 seconds)
   - Rolling average FPS calculation

6. **`src/main/utils/logger.ts`** — Rewritten as StructuredLogger (was basic)
   - Log levels: debug, info, warn, error
   - Structured format: {timestamp, level, module, message, data?}
   - Categories: ipc, execution, memory, provider, session, workspace, watchdog, crash-dump, telemetry, general
   - Log rotation (5MB max, keeps 3 files in ~/.vibecode/logs/)
   - Methods: setLogLevel(), getRecentLogs(), flush()
   - Includes legacyLogger for backward compatibility

## Files Modified (7)

1. **`src/main/ipc/index.ts`** — Added IPC latency middleware
   - Monkey-patches ipcMain.handle before handler registration
   - Records channel name + duration for every IPC call via telemetry

2. **`src/main/main.ts`** — Safe recovery mode + service integration
   - Detects --safe-mode flag and existing crash dumps
   - Applies restrictions: no streaming, reduced memory, no auto-save
   - Shows safe mode dialog with clear-and-restart option
   - Integrates telemetry, watchdog, crash dump service lifecycle
   - Generates crash dumps on render-process-gone events

3. **`src/main/utils/foundation-stabilization.ts`** — Added EventListenerTracker
   - Tracks active listeners per event name
   - Warning threshold (default: 10 per event)
   - Stale listener cleanup (30min timeout)
   - Methods: trackListener(), removeTrackedListener(), getListenerCount(), detectLeaks(), cleanupStaleListeners(), getSummary()

4. **`src/main/services/memory-store.ts`** — Added cache stats and force compact
   - getCacheStats() → {totalEntries, cachedProjects, estimatedBytes, dirtyCount}
   - forceCompact() — immediately flushes and rewrites all project files

5. **`src/preload/preload.ts`** — Added telemetry namespace
   - telemetry.getMetrics, getRecentLogs, getCrashDumps, sendHeartbeat, clearCrashDumps

6. **`src/renderer/types/index.ts`** — Added telemetry types
   - TelemetryMetrics, CrashDump, LogLevel, LogCategory, LogEntry interfaces
   - Updated VibeCodeAPI with telemetry interface

7. **`src/renderer/App.tsx`** — Integrated useFPSMonitor hook

8. **`src/main/ipc/fs-handlers.ts`** — Fixed logger call to structured format

9. **`src/main/services/path-sandbox.ts`** — Fixed 3 logger calls to structured format

## TypeScript Compilation
- **tsconfig.main.json**: 0 errors ✅
- **tsconfig.preload.json**: 0 errors ✅
- **tsconfig.json**: Pre-existing ProposalCard errors (unrelated to this phase)

## Key Design Decisions
- IPC latency middleware uses monkey-patching approach (non-invasive, no handler code changes needed)
- Structured logger maintains backward compatibility via legacyLogger export
- Watchdog escalates recovery gradually: ping → reload → recreate (avoids unnecessary window destruction)
- Crash dumps auto-generate on global errors and render process crashes
- Safe mode is triggered by either --safe-mode flag or existing crash dumps
- FPS monitoring uses requestAnimationFrame for accuracy, not setTimeout
