// VibeCode System Kernel - Logger Provider v8.0
// Structured logging with log levels, scopes, and lazy initialization

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

interface LogEntry {
  level: LogLevel;
  scope: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface LoggerConfig {
  minLevel: LogLevel;
  persistToDisk: boolean;
  maxLogSize: number;
  logDirectory?: string;
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  persistToDisk: false,
  maxLogSize: 10 * 1024 * 1024, // 10MB
};

export class LoggerProvider {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private listeners: ((entry: LogEntry) => void)[] = [];
  private initialized = false;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.info('LoggerProvider', 'Logger initialized', { minLevel: this.config.minLevel });
  }

  debug(scope: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', scope, message, data);
  }

  info(scope: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', scope, message, data);
  }

  warn(scope: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', scope, message, data);
  }

  error(scope: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', scope, message, data);
  }

  fatal(scope: string, message: string, data?: Record<string, unknown>): void {
    this.log('fatal', scope, message, data);
  }

  createScopedLogger(scope: string): ScopedLogger {
    return new ScopedLogger(this, scope);
  }

  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  clearBuffer(): void {
    this.buffer = [];
  }

  addListener(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  getMinLevel(): LogLevel {
    return this.config.minLevel;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private log(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      scope,
      message,
      timestamp: Date.now(),
      data,
    };

    // Buffer management
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
    }
    this.buffer.push(entry);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Listener errors must not propagate
      }
    }

    // Console output
    const formatted = `[${new Date(entry.timestamp).toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}`;
    switch (level) {
      case 'debug':
        console.debug(formatted, data ?? '');
        break;
      case 'info':
        console.info(formatted, data ?? '');
        break;
      case 'warn':
        console.warn(formatted, data ?? '');
        break;
      case 'error':
      case 'fatal':
        console.error(formatted, data ?? '');
        break;
    }
  }
}

export class ScopedLogger {
  constructor(
    private provider: LoggerProvider,
    private scope: string
  ) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.provider.debug(this.scope, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.provider.info(this.scope, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.provider.warn(this.scope, message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.provider.error(this.scope, message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.provider.fatal(this.scope, message, data);
  }
}

// Singleton
let instance: LoggerProvider | null = null;

export function getLoggerProvider(config?: Partial<LoggerConfig>): LoggerProvider {
  if (!instance) {
    instance = new LoggerProvider(config);
  }
  return instance;
}

export function resetLoggerProvider(): void {
  if (instance) {
    instance.clearBuffer();
  }
  instance = null;
}
