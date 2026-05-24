// ─── Crash Dump Generation ────────────────────────────────────────────────
// On uncaught exception or unhandled rejection, generates a crash dump
// containing stack trace, memory stats, active plans, recent IPC calls,
// and provider status. Saves to ~/.vibecode/crash-dumps/{timestamp}.json.
// Max 10 crash dumps, auto-cleans oldest.
//
// Extracted from src/main/services/crash-dump.ts during Phase 2 refactoring.
// Class → module-level functions. Internal state moved to module-level variables.
// Uses state.ts getIsDev() instead of local isDev references.
// ─────────────────────────────────────────────────────────────────────────────

import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsReaddirInternalSync,
  kernelFsMkdirInternal,
  kernelFsWriteInternal,
  kernelFsDeleteInternal,
} from '../../main/kernel/kernel-fs';
import * as path from 'path';
import * as os from 'os';
import { telemetry } from '../../main/services/telemetry';
import { logger } from '../../main/utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CrashDump {
  timestamp: number;
  error: {
    message: string;
    stack?: string;
    name: string;
  };
  context?: Record<string, unknown>;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  recentIpcCalls: Array<{
    channel: string;
    durationMs: number;
    timestamp: number;
  }>;
  recentExecutionEvents: Array<{
    type: string;
    durationMs?: number;
    timestamp: number;
  }>;
  uptime: number;
  platform: string;
  nodeVersion: string;
  electronVersion: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CRASH_DUMPS_DIR = path.join(os.homedir(), '.vibecode', 'crash-dumps');
const MAX_CRASH_DUMPS = 10;
const CRASH_DUMP_FILE_PATTERN = /^crash-\d+\.json$/;

// ─── Module-level State ────────────────────────────────────────────────────

let isInitialized = false;

// ─── Public API ─────────────────────────────────────────────────────────────

/** Initialize crash dump service — register global error handlers */
export function initializeCrashDump(): void {
  if (isInitialized) return;
  isInitialized = true;

  process.on('uncaughtException', async (error) => {
    try {
      const dumpPath = await generateCrashDump(error, {
        source: 'uncaughtException',
      });
      logger.error('crash-dump', `Uncaught exception — crash dump saved to ${dumpPath}`, { error: error.message });
    } catch (dumpError) {
      console.error('[CrashDump] Failed to generate crash dump for uncaught exception:', dumpError);
    }
  });

  process.on('unhandledRejection', async (reason) => {
    try {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      const dumpPath = await generateCrashDump(error, {
        source: 'unhandledRejection',
        reason: String(reason),
      });
      logger.error('crash-dump', `Unhandled rejection — crash dump saved to ${dumpPath}`, { error: error.message });
    } catch (dumpError) {
      console.error('[CrashDump] Failed to generate crash dump for unhandled rejection:', dumpError);
    }
  });

  logger.info('crash-dump', 'Crash dump service initialized');
}

/** Generate a crash dump file and return its path */
export async function generateCrashDump(error: Error, context?: Record<string, unknown>): Promise<string> {
  // Ensure directory exists
  await kernelFsMkdirInternal(CRASH_DUMPS_DIR);

  const metrics = telemetry.getMetrics();
  const recentIpcCalls = telemetry.getRecentIpcCalls(20);
  const recentExecutionEvents = telemetry.getRecentExecutionEvents(20);

  const dump: CrashDump = {
    timestamp: Date.now(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    context,
    memory: { ...metrics.memory },
    recentIpcCalls,
    recentExecutionEvents,
    uptime: metrics.timestamps.uptime,
    platform: process.platform,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron ?? 'unknown',
  };

  // Save to file
  const filename = `crash-${Date.now()}.json`;
  const filePath = path.join(CRASH_DUMPS_DIR, filename);

  await kernelFsWriteInternal(filePath, JSON.stringify(dump, null, 2), 'utf-8');

  // Clean up old crash dumps
  await cleanOldDumps();

  return filePath;
}

/** Check if any crash dumps exist (for safe mode detection) */
export function hasCrashDumps(): boolean {
  try {
    if (!kernelFsExistsInternal(CRASH_DUMPS_DIR)) return false;
    const files = kernelFsReaddirInternalSync(CRASH_DUMPS_DIR);
    return files.some((f) => CRASH_DUMP_FILE_PATTERN.test(f));
  } catch {
    return false;
  }
}

/** Get list of crash dumps (newest first) */
export function listCrashDumps(): CrashDump[] {
  try {
    if (!kernelFsExistsInternal(CRASH_DUMPS_DIR)) return [];

    const files = kernelFsReaddirInternalSync(CRASH_DUMPS_DIR)
      .filter((f) => CRASH_DUMP_FILE_PATTERN.test(f))
      .sort()
      .reverse(); // Newest first

    const dumps: CrashDump[] = [];
    for (const file of files) {
      try {
        const content = kernelFsReadSync(path.join(CRASH_DUMPS_DIR, file));
        dumps.push(JSON.parse(content));
      } catch {
        // Skip unreadable files
      }
    }

    return dumps;
  } catch {
    return [];
  }
}

/** Delete all crash dumps */
export async function clearCrashDumps(): Promise<void> {
  try {
    if (!kernelFsExistsInternal(CRASH_DUMPS_DIR)) return;

    const files = kernelFsReaddirInternalSync(CRASH_DUMPS_DIR)
      .filter((f) => CRASH_DUMP_FILE_PATTERN.test(f));

    for (const file of files) {
      await kernelFsDeleteInternal(path.join(CRASH_DUMPS_DIR, file));
    }
  } catch {
    // Best-effort cleanup
  }
}

/** Get the crash dumps directory path */
export function getCrashDumpsDir(): string {
  return CRASH_DUMPS_DIR;
}

// ─── Private Helpers ────────────────────────────────────────────────────────

/** Remove oldest crash dumps if we exceed MAX_CRASH_DUMPS */
async function cleanOldDumps(): Promise<void> {
  try {
    const files = kernelFsReaddirInternalSync(CRASH_DUMPS_DIR)
      .filter((f) => CRASH_DUMP_FILE_PATTERN.test(f))
      .sort(); // Oldest first

    while (files.length > MAX_CRASH_DUMPS) {
      const oldest = files.shift();
      if (oldest) {
        await kernelFsDeleteInternal(path.join(CRASH_DUMPS_DIR, oldest));
      }
    }
  } catch {
    // Best-effort cleanup
  }
}
