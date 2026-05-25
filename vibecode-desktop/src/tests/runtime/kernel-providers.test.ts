// Phase 10: Kernel Provider Tests
// Covers fs-provider.ts, logger-provider.ts, session-provider.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FsProvider, getFsProvider, resetFsProvider } from '../../system/kernel/fs-provider';
import { LoggerProvider, ScopedLogger, getLoggerProvider, resetLoggerProvider } from '../../system/kernel/logger-provider';
import { SessionProvider, getSessionProvider, resetSessionProvider } from '../../system/kernel/session-provider';

describe('FsProvider', () => {
  let fs: FsProvider;

  beforeEach(() => {
    resetFsProvider();
    fs = new FsProvider({ allowedRoots: ['/tmp/vibecode-test'], maxFileSize: 1024, auditLog: false });
  });

  it('creates FsProvider with default config', () => {
    const provider = new FsProvider();
    expect(provider.getConfig()).toBeDefined();
    expect(provider.getConfig().maxFileSize).toBe(50 * 1024 * 1024);
  });

  it('isPathInScope returns true with empty allowed roots', () => {
    const provider = new FsProvider();
    expect(provider.isPathInScope('/any/path')).toBe(true);
  });

  it('isPathInScope checks against allowed roots', () => {
    expect(fs.isPathInScope('/tmp/vibecode-test/file.txt')).toBe(true);
    expect(fs.isPathInScope('/etc/passwd')).toBe(false);
  });

  it('resolvePath resolves base and segments', () => {
    const result = fs.resolvePath('/tmp', 'vibecode', 'test.txt');
    expect(result).toContain('vibecode');
    expect(result).toContain('test.txt');
  });

  it('joinPath joins path segments', () => {
    const result = fs.joinPath('a', 'b', 'c');
    expect(result).toContain('a');
  });

  it('readFileSync throws for out-of-scope paths', () => {
    expect(() => fs.readFileSync('/etc/passwd')).toThrow('outside the allowed scope');
  });

  it('writeFileSync throws for out-of-scope paths', () => {
    expect(() => fs.writeFileSync('/etc/evil.txt', 'data')).toThrow('outside the allowed scope');
  });

  it('singleton getFsProvider returns instance', () => {
    const inst1 = getFsProvider();
    const inst2 = getFsProvider();
    expect(inst1).toBe(inst2);
  });

  it('resetFsProvider clears singleton', () => {
    const inst1 = getFsProvider();
    resetFsProvider();
    const inst2 = getFsProvider();
    expect(inst1).not.toBe(inst2);
  });

  it('existsSync returns false for non-existent path', () => {
    expect(fs.existsSync('/tmp/vibecode-test-nonexistent-xyz')).toBe(false);
  });

  it('read-only roots reject writes', () => {
    const roFs = new FsProvider({
      allowedRoots: ['/tmp/vibecode-test'],
      readOnlyRoots: ['/tmp/vibecode-test/readonly'],
      auditLog: false,
    });
    expect(() => roFs.writeFileSync('/tmp/vibecode-test/readonly/file.txt', 'data')).toThrow('read-only scope');
  });
});

describe('LoggerProvider', () => {
  beforeEach(() => {
    resetLoggerProvider();
  });

  it('creates LoggerProvider with default config', () => {
    const logger = new LoggerProvider();
    expect(logger.getMinLevel()).toBe('info');
    expect(logger.isInitialized()).toBe(false);
  });

  it('initialize sets initialized flag', () => {
    const logger = new LoggerProvider();
    logger.initialize();
    expect(logger.isInitialized()).toBe(true);
  });

  it('log levels are filtered by minLevel', () => {
    const logger = new LoggerProvider({ minLevel: 'warn' });
    logger.debug('test', 'debug message');
    logger.info('test', 'info message');
    logger.warn('test', 'warn message');
    logger.error('test', 'error message');

    const buffer = logger.getBuffer();
    expect(buffer.length).toBe(2); // Only warn and error
    expect(buffer[0].level).toBe('warn');
    expect(buffer[1].level).toBe('error');
  });

  it('setMinLevel changes the minimum level', () => {
    const logger = new LoggerProvider({ minLevel: 'error' });
    logger.info('test', 'should be filtered');
    expect(logger.getBuffer().length).toBe(0);

    logger.setMinLevel('debug');
    logger.info('test', 'should pass now');
    expect(logger.getBuffer().length).toBe(1);
  });

  it('buffer has max size of 1000 entries', () => {
    const logger = new LoggerProvider({ minLevel: 'debug' });
    for (let i = 0; i < 1100; i++) {
      logger.debug('test', `message ${i}`);
    }
    expect(logger.getBuffer().length).toBeLessThanOrEqual(1001);
  });

  it('clearBuffer removes all entries', () => {
    const logger = new LoggerProvider({ minLevel: 'debug' });
    logger.info('test', 'message');
    expect(logger.getBuffer().length).toBe(1);
    logger.clearBuffer();
    expect(logger.getBuffer().length).toBe(0);
  });

  it('addListener receives log entries', () => {
    const logger = new LoggerProvider({ minLevel: 'debug' });
    const entries: string[] = [];
    logger.addListener((entry) => {
      entries.push(entry.message);
    });
    logger.info('test', 'hello');
    expect(entries).toContain('hello');
  });

  it('ScopedLogger prefixes all calls', () => {
    const logger = new LoggerProvider({ minLevel: 'debug' });
    const scoped = logger.createScopedLogger('my-module');
    scoped.info('test message');
    const buffer = logger.getBuffer();
    expect(buffer[0].scope).toBe('my-module');
  });

  it('singleton getLoggerProvider returns instance', () => {
    const inst1 = getLoggerProvider();
    const inst2 = getLoggerProvider();
    expect(inst1).toBe(inst2);
  });
});

describe('SessionProvider', () => {
  beforeEach(() => {
    resetSessionProvider();
  });

  it('creates session with user ID', async () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 60000, maxSessionDurationMs: 3600000 });
    const session = await provider.createSession('user-1');
    expect(session.userId).toBe('user-1');
    expect(session.id).toContain('sess_');
    expect(provider.getSession()).toBe(session);
  });

  it('isSessionValid returns true for active session', async () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 60000, maxSessionDurationMs: 3600000 });
    await provider.createSession('user-1');
    expect(provider.isSessionValid()).toBe(true);
  });

  it('isSessionValid returns false with no session', () => {
    const provider = new SessionProvider();
    expect(provider.isSessionValid()).toBe(false);
  });

  it('refreshSession updates lastActivity', async () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 60000, maxSessionDurationMs: 3600000 });
    await provider.createSession('user-1');
    const before = provider.getSession()!.lastActivity;
    // Small delay
    await new Promise(r => setTimeout(r, 10));
    await provider.refreshSession();
    expect(provider.getSession()!.lastActivity).toBeGreaterThanOrEqual(before);
  });

  it('endSession clears current session', async () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 60000, maxSessionDurationMs: 3600000 });
    await provider.createSession('user-1');
    await provider.endSession();
    expect(provider.getSession()).toBeNull();
    expect(provider.isSessionValid()).toBe(false);
  });

  it('emits session:created event', async () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 60000, maxSessionDurationMs: 3600000 });
    let eventFired = false;
    provider.on('session:created', () => { eventFired = true; });
    await provider.createSession('user-1');
    expect(eventFired).toBe(true);
  });

  it('emits session:ended event', async () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 60000, maxSessionDurationMs: 3600000 });
    let eventFired = false;
    provider.on('session:ended', () => { eventFired = true; });
    await provider.createSession('user-1');
    await provider.endSession();
    expect(eventFired).toBe(true);
  });

  it('getConfig returns configuration', () => {
    const provider = new SessionProvider({ maxIdleTimeMs: 5000, persistToDisk: false });
    const config = provider.getConfig();
    expect(config.maxIdleTimeMs).toBe(5000);
    expect(config.persistToDisk).toBe(false);
  });

  it('singleton getSessionProvider returns instance', () => {
    const inst1 = getSessionProvider();
    const inst2 = getSessionProvider();
    expect(inst1).toBe(inst2);
  });
});
