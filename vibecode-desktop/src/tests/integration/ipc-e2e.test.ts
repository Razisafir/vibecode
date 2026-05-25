// Phase 10: Integration Test — IPC End-to-End
// Check 5: IPC end-to-end integration (router + batch handler)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCRouter } from '../../system/runtime/ipc-router';
import type { IPCMessage, IPCRouteConfig } from '../../system/kernel/types';

describe('IPC End-to-End Integration', () => {
  let router: IPCRouter;

  beforeEach(() => {
    router = new IPCRouter();
  });

  it('message routes from sender window to target window handler', () => {
    const receivedMessages: IPCMessage[] = [];

    // Register handler for window-1
    router.registerRoute({
      channel: 'editor:save',
      handler: (msg) => {
        receivedMessages.push(msg);
        return { saved: true };
      },
      windowId: 'window-1',
    });

    // Send from window-2 to window-1
    const result = router.send(
      { channel: 'editor:save', data: { file: 'test.ts' }, sourceWindowId: 'window-2' },
      'window-1',
      'secondary'
    );

    expect(result).toEqual({ saved: true });
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].data).toEqual({ file: 'test.ts' });
    expect(receivedMessages[0].windowId).toBe('window-1');
  });

  it('broadcast reaches all registered window handlers', () => {
    const results: string[] = [];

    router.registerRoute({
      channel: 'theme:changed',
      handler: (msg) => { results.push(`win-1`); return true; },
      windowId: 'window-1',
    });
    router.registerRoute({
      channel: 'theme:changed',
      handler: (msg) => { results.push(`win-2`); return true; },
      windowId: 'window-2',
    });

    const broadcastResults = router.broadcast('theme:changed', { theme: 'dark' }, 'window-1');
    expect(broadcastResults.size).toBe(2);
    expect(results).toContain('win-1');
    expect(results).toContain('win-2');
  });

  it('rate limiting integrates with batch processing', () => {
    router.setRateLimit(5);

    const handler = vi.fn().mockReturnValue('ok');
    router.registerRoute({
      channel: 'high-freq',
      handler,
      windowId: 'rate-window',
    });

    let successCount = 0;
    let rateLimitedCount = 0;

    for (let i = 0; i < 10; i++) {
      const result = router.send(
        { channel: 'high-freq', data: { i }, sourceWindowId: 'rate-window' },
        'rate-window',
        'secondary'
      );
      if (result !== undefined) {
        successCount++;
      } else {
        rateLimitedCount++;
      }
    }

    expect(successCount).toBe(5);
    expect(rateLimitedCount).toBe(5);
  });

  it('message enrichment includes windowId and windowRole', () => {
    let capturedMessage: IPCMessage | null = null;

    router.registerRoute({
      channel: 'test:enrich',
      handler: (msg) => { capturedMessage = msg; return true; },
      windowId: 'enrich-window',
    });

    router.send(
      { channel: 'test:enrich', data: null, sourceWindowId: 'source-win' },
      'enrich-window',
      'panel'
    );

    expect(capturedMessage).not.toBeNull();
    expect(capturedMessage!.windowId).toBe('enrich-window');
    expect(capturedMessage!.windowRole).toBe('panel');
    expect(capturedMessage!.sourceWindowId).toBe('source-win');
    expect(capturedMessage!.timestamp).toBeGreaterThan(0);
  });

  it('global handler fallback works when no window-specific handler', () => {
    const globalHandler = vi.fn().mockReturnValue('global-response');

    router.registerRoute({
      channel: 'fallback:channel',
      handler: globalHandler,
      // No windowId — global handler
    });

    const result = router.send(
      { channel: 'fallback:channel', data: null, sourceWindowId: 'any-window' },
      'unknown-window',
      'secondary'
    );

    expect(result).toBe('global-response');
    expect(globalHandler).toHaveBeenCalledTimes(1);
  });

  it('window-specific handler takes priority over global', () => {
    const globalHandler = vi.fn().mockReturnValue('global');
    const windowHandler = vi.fn().mockReturnValue('window-specific');

    router.registerRoute({
      channel: 'priority:test',
      handler: globalHandler,
    });
    router.registerRoute({
      channel: 'priority:test',
      handler: windowHandler,
      windowId: 'priority-window',
    });

    const result = router.send(
      { channel: 'priority:test', data: null, sourceWindowId: 'priority-window' },
      'priority-window',
      'secondary'
    );

    // Window-specific should take priority
    expect(result).toBe('window-specific');
    expect(windowHandler).toHaveBeenCalledTimes(1);
    expect(globalHandler).toHaveBeenCalledTimes(0);
  });

  it('handler cleanup on window close prevents stale routing', () => {
    const handler = vi.fn().mockReturnValue('ok');

    router.registerRoute({
      channel: 'cleanup:test',
      handler,
      windowId: 'closing-window',
    });

    // Route works before close
    const result1 = router.send(
      { channel: 'cleanup:test', data: null, sourceWindowId: 'closing-window' },
      'closing-window',
      'secondary'
    );
    expect(result1).toBe('ok');

    // Close window
    router.removeWindowRoutes('closing-window');
    expect(router.isWindowDestroyed('closing-window')).toBe(true);
    expect(router.getWindowRouteCount('closing-window')).toBe(0);
  });
});
