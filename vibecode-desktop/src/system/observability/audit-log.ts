// VibeCode System Observability - Audit Log v8.0
// Immutable audit trail with lazy initialization

import { EventEmitter } from 'events';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  resource: string;
  result: 'success' | 'failure' | 'denied';
  timestamp: number;
  details?: Record<string, unknown>;
  sessionId?: string;
}

export interface AuditLogConfig {
  logDirectory: string;
  maxFileSize: number;
  rotateOnSize: boolean;
  lazyInit: boolean;
}

const DEFAULT_CONFIG: AuditLogConfig = {
  logDirectory: './audit-logs',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  rotateOnSize: true,
  lazyInit: true,
};

export class AuditLog extends EventEmitter {
  private config: AuditLogConfig;
  private initialized = false;
  private currentLogFile: string | null = null;
  private entryCount = 0;
  private buffer: AuditEntry[] = [];
  private maxBufferSize = 100;

  constructor(config: Partial<AuditLogConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!this.config.lazyInit) {
      this.initialize();
    }
  }

  initialize(): void {
    if (this.initialized) return;
    
    if (!existsSync(this.config.logDirectory)) {
      mkdirSync(this.config.logDirectory, { recursive: true });
    }
    
    this.currentLogFile = join(this.config.logDirectory, `audit-${new Date().toISOString().split('T')[0]}.jsonl`);
    this.initialized = true;
    
    // Flush any buffered entries
    this.flushBuffer();
  }

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const fullEntry: AuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...entry,
    };

    this.entryCount++;

    if (!this.initialized) {
      // Buffer until initialized
      if (this.buffer.length < this.maxBufferSize) {
        this.buffer.push(fullEntry);
      }
      this.emit('audit:buffered', fullEntry);
      return;
    }

    this.writeEntry(fullEntry);
    this.emit('audit:logged', fullEntry);
  }

  getEntries(since?: number): AuditEntry[] {
    // In a real implementation, this would read from disk
    return [...this.buffer];
  }

  getEntryCount(): number {
    return this.entryCount;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getCurrentLogFile(): string | null {
    return this.currentLogFile;
  }

  getConfig(): AuditLogConfig {
    return { ...this.config };
  }

  private writeEntry(entry: AuditEntry): void {
    if (!this.currentLogFile) return;

    try {
      appendFileSync(this.currentLogFile, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      this.emit('audit:write-error', { error: err, entry });
    }
  }

  private flushBuffer(): void {
    for (const entry of this.buffer) {
      this.writeEntry(entry);
    }
    this.buffer = [];
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
