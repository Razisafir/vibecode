// VibeCode Phase 11: Extended Audit Log Tests
// Targeting ≥ 80% coverage for audit-log.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditLog } from '../../system/observability/audit-log';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join('/tmp', `audit-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);

describe('AuditLog - Extended Coverage', () => {
  let log: AuditLog;

  beforeEach(() => {
    log = new AuditLog({ logDirectory: TEST_DIR, lazyInit: true, maxFileSize: 1024, rotateOnSize: true });
  });

  afterEach(() => {
    log.removeAllListeners();
    try {
      if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors in test
    }
  });

  describe('lazy initialization', () => {
    it('does not initialize when lazyInit is true', () => {
      expect(log.isInitialized()).toBe(false);
    });

    it('initializes immediately when lazyInit is false', () => {
      const dir = join('/tmp', `audit-eager-${Date.now()}`);
      const eager = new AuditLog({ logDirectory: dir, lazyInit: false });
      expect(eager.isInitialized()).toBe(true);
      expect(eager.getCurrentLogFile()).toBeTruthy();
      eager.removeAllListeners();
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    });

    it('creates log directory on initialize', () => {
      const dir = join('/tmp', `audit-mkdir-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
      const fresh = new AuditLog({ logDirectory: dir, lazyInit: true });
      fresh.initialize();
      expect(existsSync(dir)).toBe(true);
      fresh.removeAllListeners();
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    });
  });

  describe('entry logging and buffering', () => {
    it('logs an entry after initialization', () => {
      log.initialize();
      log.log({ action: 'test', actor: 'user', resource: '/api/test', result: 'success' });
      expect(log.getEntryCount()).toBe(1);
    });

    it('buffers entries before initialization', () => {
      log.log({ action: 'buffered', actor: 'user', resource: '/api/test', result: 'success' });
      expect(log.getEntryCount()).toBe(1);
      const entries = log.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].action).toBe('buffered');
    });

    it('flushes buffered entries on initialize', () => {
      log.log({ action: 'buffered1', actor: 'user', resource: '/api/test', result: 'success' });
      log.log({ action: 'buffered2', actor: 'user', resource: '/api/test', result: 'success' });
      log.initialize();
      // After flush, buffer is cleared
      const entries = log.getEntries();
      expect(entries.length).toBe(0);
    });

    it('emits audit:buffered event when not initialized', () => {
      const handler = vi.fn();
      log.on('audit:buffered', handler);
      log.log({ action: 'buffered', actor: 'user', resource: '/api/test', result: 'success' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].action).toBe('buffered');
    });

    it('emits audit:logged event after initialization', () => {
      const handler = vi.fn();
      log.on('audit:logged', handler);
      log.initialize();
      log.log({ action: 'logged', actor: 'user', resource: '/api/test', result: 'success' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].action).toBe('logged');
    });

    it('generates unique IDs for entries', () => {
      log.initialize();
      const handler = vi.fn();
      log.on('audit:logged', handler);
      log.log({ action: 'a', actor: 'user', resource: '/r', result: 'success' });
      log.log({ action: 'b', actor: 'user', resource: '/r', result: 'success' });
      const id1 = handler.mock.calls[0][0].id;
      const id2 = handler.mock.calls[1][0].id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('entry queries', () => {
    it('getEntries returns copy of buffer', () => {
      log.log({ action: 'test', actor: 'user', resource: '/api/test', result: 'success' });
      const entries1 = log.getEntries();
      const entries2 = log.getEntries();
      expect(entries1).not.toBe(entries2);
    });

    it('getEntryCount increments with each log', () => {
      expect(log.getEntryCount()).toBe(0);
      log.log({ action: 'a', actor: 'user', resource: '/r', result: 'success' });
      expect(log.getEntryCount()).toBe(1);
      log.log({ action: 'b', actor: 'user', resource: '/r', result: 'failure' });
      expect(log.getEntryCount()).toBe(2);
    });

    it('getEntries returns all buffered entries (since param reserved for future)', () => {
      log.log({ action: 'first', actor: 'user', resource: '/r', result: 'success' });
      log.log({ action: 'second', actor: 'user', resource: '/r', result: 'failure' });
      const entries = log.getEntries();
      expect(entries.length).toBe(2);
      expect(entries[0].action).toBe('first');
      expect(entries[1].action).toBe('second');
    });
  });

  describe('configuration', () => {
    it('returns config', () => {
      const config = log.getConfig();
      expect(config.logDirectory).toBe(TEST_DIR);
      expect(config.maxFileSize).toBe(1024);
      expect(config.rotateOnSize).toBe(true);
      expect(config.lazyInit).toBe(true);
    });

    it('config is a copy (not a reference)', () => {
      const config = log.getConfig();
      (config as Record<string, unknown>).maxFileSize = 99999;
      expect(log.getConfig().maxFileSize).toBe(1024);
    });

    it('returns null log file before initialization', () => {
      expect(log.getCurrentLogFile()).toBeNull();
    });

    it('returns log file path after initialization', () => {
      log.initialize();
      const filePath = log.getCurrentLogFile();
      expect(filePath).toBeTruthy();
      expect(filePath).toContain('audit-');
      expect(filePath).toContain('.jsonl');
    });
  });

  describe('buffer limits', () => {
    it('respects max buffer size of 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        log.log({ action: `action-${i}`, actor: 'user', resource: '/r', result: 'success' });
      }
      const entries = log.getEntries();
      expect(entries.length).toBeLessThanOrEqual(100);
    });
  });
});
