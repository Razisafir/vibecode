// ─── Crash Dump Generation ────────────────────────────────────────────────
// On uncaught exception or unhandled rejection, generates a crash dump
// containing stack trace, memory stats, active plans, recent IPC calls,
// and provider status. Saves to ~/.vibecode/crash-dumps/{timestamp}.json.
// Max 10 crash dumps, auto-cleans oldest.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { telemetry } from './telemetry';
import { logger } from '../utils/logger';

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

// ─── Crash Dump Service ────────────────────────────────────────────────────

class CrashDumpService {
  private isInitialized: boolean = false;

  /** Initialize crash dump service — register global error handlers */
  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    process.on('uncaughtException', async (error) => {
      try {
        const dumpPath = await this.generateCrashDump(error, {
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
        const dumpPath = await this.generateCrashDump(error, {
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
  async generateCrashDump(error: Error, context?: Record<string, unknown>): Promise<string> {
    // Ensure directory exists
    await fs.promises.mkdir(CRASH_DUMPS_DIR, { recursive: true });

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

    await fs.promises.writeFile(filePath, JSON.stringify(dump, null, 2), 'utf-8');

    // Clean up old crash dumps
    await this.cleanOldDumps();

    return filePath;
  }

  /** Check if any crash dumps exist (for safe mode detection) */
  hasCrashDumps(): boolean {
    try {
      if (!fs.existsSync(CRASH_DUMPS_DIR)) return false;
      const files = fs.readdirSync(CRASH_DUMPS_DIR);
      return files.some((f) => CRASH_DUMP_FILE_PATTERN.test(f));
    } catch {
      return false;
    }
  }

  /** Get list of crash dumps (newest first) */
  listCrashDumps(): CrashDump[] {
    try {
      if (!fs.existsSync(CRASH_DUMPS_DIR)) return [];

      const files = fs.readdirSync(CRASH_DUMPS_DIR)
        .filter((f) => CRASH_DUMP_FILE_PATTERN.test(f))
        .sort()
        .reverse(); // Newest first

      const dumps: CrashDump[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(CRASH_DUMPS_DIR, file), 'utf-8');
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
  async clearCrashDumps(): Promise<void> {
    try {
      if (!fs.existsSync(CRASH_DUMPS_DIR)) return;

      const files = fs.readdirSync(CRASH_DUMPS_DIR)
        .filter((f) => CRASH_DUMP_FILE_PATTERN.test(f));

      for (const file of files) {
        await fs.promises.unlink(path.join(CRASH_DUMPS_DIR, file));
      }
    } catch {
      // Best-effort cleanup
    }
  }

  /** Get the crash dumps directory path */
  getCrashDumpsDir(): string {
    return CRASH_DUMPS_DIR;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /** Remove oldest crash dumps if we exceed MAX_CRASH_DUMPS */
  private async cleanOldDumps(): Promise<void> {
    try {
      const files = fs.readdirSync(CRASH_DUMPS_DIR)
        .filter((f) => CRASH_DUMP_FILE_PATTERN.test(f))
        .sort(); // Oldest first

      while (files.length > MAX_CRASH_DUMPS) {
        const oldest = files.shift();
        if (oldest) {
          await fs.promises.unlink(path.join(CRASH_DUMPS_DIR, oldest));
        }
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

// Singleton instance
export const crashDumpService = new CrashDumpService();
