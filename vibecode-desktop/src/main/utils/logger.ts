// ─── Structured Logger ─────────────────────────────────────────────────────
// Enhanced logger with levels, structured format, log rotation, and
// category-based filtering. Writes to ~/.vibecode/logs/ with 5MB rotation.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory =
  | 'ipc'
  | 'execution'
  | 'memory'
  | 'provider'
  | 'session'
  | 'workspace'
  | 'watchdog'
  | 'crash-dump'
  | 'telemetry'
  | 'general';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: LogCategory;
  message: string;
  data?: Record<string, unknown>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOGS_DIR = path.join(os.homedir(), '.vibecode', 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'vibecode.log');
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 3; // vibecode.log + vibecode.log.1 + vibecode.log.2

// ─── Structured Logger ──────────────────────────────────────────────────────

class StructuredLogger {
  private minLevel: LogLevel = 'info';
  private logBuffer: LogEntry[] = [];
  private readonly MAX_BUFFER_SIZE = 1000;
  private writeTimer: NodeJS.Timeout | null = null;
  private writePending: boolean = false;

  constructor() {
    this.ensureLogDirectory();
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Set the minimum log level */
  setLogLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /** Get the current minimum log level */
  getLogLevel(): LogLevel {
    return this.minLevel;
  }

  /** Log a debug message */
  debug(module: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('debug', module, message, data);
  }

  /** Log an info message */
  info(module: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('info', module, message, data);
  }

  /** Log a warning message */
  warn(module: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('warn', module, message, data);
  }

  /** Log an error message */
  error(module: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log('error', module, message, data);
  }

  /** Get recent log entries from the in-memory buffer */
  getRecentLogs(count: number = 100, level?: LogLevel): LogEntry[] {
    let entries = this.logBuffer;

    if (level) {
      entries = entries.filter((e) => LOG_LEVEL_ORDER[e.level] >= LOG_LEVEL_ORDER[level]);
    }

    return entries.slice(-count);
  }

  /** Flush any pending log writes to disk */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.writePending = false;
    this.rotateIfNeeded();
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private log(level: LogLevel, module: LogCategory, message: string, data?: Record<string, unknown>): void {
    // Filter by level
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    };

    // Add to in-memory buffer
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
      this.logBuffer.shift();
    }

    // Console output with structured format
    const prefix = `[VibeCode:${level.toUpperCase()}:${module}]`;
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';

    switch (level) {
      case 'debug':
        console.log(`${prefix} ${message}${dataStr}`);
        break;
      case 'info':
        console.log(`${prefix} ${message}${dataStr}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}${dataStr}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}${dataStr}`);
        break;
    }

    // Schedule disk write (batched)
    this.scheduleWrite(entry);
  }

  private scheduleWrite(entry: LogEntry): void {
    if (!this.writePending) {
      this.writePending = true;
      this.writeTimer = setTimeout(() => {
        this.writePending = false;
        this.writeToDisk(entry);
      }, 1000); // Batch writes every 1 second

      // Don't prevent process exit
      if (this.writeTimer.unref) {
        this.writeTimer.unref();
      }
    }
  }

  private writeToDisk(entry: LogEntry): void {
    try {
      this.rotateIfNeeded();
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(LOG_FILE, line, 'utf-8');
    } catch {
      // Best-effort disk write
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(LOG_FILE)) return;

      const stats = fs.statSync(LOG_FILE);
      if (stats.size < MAX_LOG_SIZE_BYTES) return;

      // Rotate: .2 → delete, .1 → .2, .0 → .1, current → .0
      for (let i = MAX_LOG_FILES - 1; i >= 0; i--) {
        const suffix = i === 0 ? '' : `.${i}`;
        const nextSuffix = `.${i + 1}`;
        const currentPath = path.join(LOGS_DIR, `vibecode.log${suffix}`);
        const nextPath = path.join(LOGS_DIR, `vibecode.log${nextSuffix}`);

        if (fs.existsSync(currentPath)) {
          if (i === MAX_LOG_FILES - 1) {
            // Delete the oldest
            fs.unlinkSync(currentPath);
          } else {
            fs.renameSync(currentPath, nextPath);
          }
        }
      }
    } catch {
      // Best-effort rotation
    }
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
    } catch {
      // Directory creation failure is non-fatal
    }
  }
}

// Singleton instance
export const logger = new StructuredLogger();

// Backwards-compatible simple API for existing code that uses logger.info(message, ...args)
// We export a compatibility layer
export const legacyLogger = {
  info: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.info('general', fullMessage);
  },
  warn: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.warn('general', fullMessage);
  },
  error: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.error('general', fullMessage);
  },
  debug: (message: string, ...args: any[]) => {
    const fullMessage = args.length > 0 ? `${message} ${args.join(' ')}` : message;
    logger.debug('general', fullMessage);
  },
};
