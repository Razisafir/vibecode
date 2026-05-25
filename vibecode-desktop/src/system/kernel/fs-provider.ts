// VibeCode System Kernel - File System Provider v8.0
// Safe file system operations with scope restrictions and audit logging

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { getLoggerProvider } from './logger-provider';

export interface FsProviderConfig {
  allowedRoots: string[];
  readOnlyRoots?: string[];
  maxFileSize: number;
  auditLog: boolean;
}

const DEFAULT_CONFIG: FsProviderConfig = {
  allowedRoots: [],
  maxFileSize: 50 * 1024 * 1024, // 50MB
  auditLog: true,
};

export class FsProvider {
  private config: FsProviderConfig;
  private logger = getLoggerProvider().createScopedLogger('FsProvider');

  constructor(config: Partial<FsProviderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  readFileSync(path: string, encoding: BufferEncoding = 'utf-8'): string {
    this.assertPathInScope(path);
    this.assertFileExists(path);

    const stat = statSync(path);
    if (stat.size > this.config.maxFileSize) {
      throw new Error(`File '${path}' exceeds maximum file size (${this.config.maxFileSize} bytes)`);
    }

    if (this.config.auditLog) {
      this.logger.info('readFileSync', { path, size: stat.size });
    }

    return readFileSync(path, encoding);
  }

  writeFileSync(path: string, content: string, encoding: BufferEncoding = 'utf-8'): void {
    this.assertPathInScope(path);
    this.assertNotReadOnly(path);

    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (this.config.auditLog) {
      this.logger.info('writeFileSync', { path, size: content.length });
    }

    writeFileSync(path, content, encoding);
  }

  existsSync(path: string): boolean {
    return existsSync(path);
  }

  mkdirSync(path: string, recursive: boolean = true): void {
    this.assertPathInScope(path);
    mkdirSync(path, { recursive });
  }

  readdirSync(path: string): string[] {
    this.assertPathInScope(path);
    return readdirSync(path);
  }

  statSync(path: string) {
    this.assertPathInScope(path);
    return statSync(path);
  }

  unlinkSync(path: string): void {
    this.assertPathInScope(path);
    this.assertNotReadOnly(path);
    unlinkSync(path);
  }

  rmSync(path: string, recursive: boolean = false): void {
    this.assertPathInScope(path);
    this.assertNotReadOnly(path);
    rmSync(path, { recursive });
  }

  resolvePath(base: string, ...segments: string[]): string {
    return resolve(base, ...segments);
  }

  joinPath(...segments: string[]): string {
    return join(...segments);
  }

  isPathInScope(path: string): boolean {
    if (this.config.allowedRoots.length === 0) return true;
    const resolved = resolve(path);
    return this.config.allowedRoots.some(root => resolved.startsWith(resolve(root)));
  }

  getConfig(): FsProviderConfig {
    return { ...this.config };
  }

  private assertPathInScope(path: string): void {
    if (!this.isPathInScope(path)) {
      throw new Error(`Path '${path}' is outside the allowed scope`);
    }
  }

  private assertNotReadOnly(path: string): void {
    if (this.config.readOnlyRoots) {
      const resolved = resolve(path);
      const isReadOnly = this.config.readOnlyRoots.some(root => resolved.startsWith(resolve(root)));
      if (isReadOnly) {
        throw new Error(`Path '${path}' is in a read-only scope`);
      }
    }
  }

  private assertFileExists(path: string): void {
    if (!existsSync(path)) {
      throw new Error(`File not found: '${path}'`);
    }
  }
}

// Singleton
let instance: FsProvider | null = null;

export function getFsProvider(config?: Partial<FsProviderConfig>): FsProvider {
  if (!instance) {
    instance = new FsProvider(config);
  }
  return instance;
}

export function resetFsProvider(): void {
  instance = null;
}
