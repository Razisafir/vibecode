// VibeCode System Supervision - Crash Dump v8.0
// Generates crash dumps for post-mortem analysis

import { EventEmitter } from 'events';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface CrashDumpData {
  serviceName: string;
  error: string;
  stack?: string;
  timestamp: number;
  systemState: Record<string, unknown>;
  memoryUsage?: NodeJS.MemoryUsage;
  uptime?: number;
}

export interface CrashDumpConfig {
  dumpDirectory: string;
  maxDumpFiles: number;
  includeHeapSnapshot: boolean;
  compressDumps: boolean;
}

const DEFAULT_CONFIG: CrashDumpConfig = {
  dumpDirectory: './crash-dumps',
  maxDumpFiles: 10,
  includeHeapSnapshot: false,
  compressDumps: false,
};

export class CrashDump extends EventEmitter {
  private config: CrashDumpConfig;
  private dumpCount = 0;

  constructor(config: Partial<CrashDumpConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  generateDump(data: CrashDumpData): string {
    // Ensure dump directory exists
    if (!existsSync(this.config.dumpDirectory)) {
      mkdirSync(this.config.dumpDirectory, { recursive: true });
    }

    const filename = `crash-${data.serviceName}-${data.timestamp}.json`;
    const filepath = join(this.config.dumpDirectory, filename);

    const dumpRecord = {
      ...data,
      dumpVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      memoryUsage: data.memoryUsage ?? process.memoryUsage(),
      uptime: data.uptime ?? process.uptime(),
    };

    try {
      writeFileSync(filepath, JSON.stringify(dumpRecord, null, 2), 'utf-8');
      this.dumpCount++;
      this.emit('dump:generated', { filepath, serviceName: data.serviceName });
      return filepath;
    } catch (err) {
      this.emit('dump:error', { error: err, serviceName: data.serviceName });
      throw err;
    }
  }

  getDumpCount(): number {
    return this.dumpCount;
  }

  getConfig(): CrashDumpConfig {
    return { ...this.config };
  }
}
