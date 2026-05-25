// IPC Router Tests - Phase 9 Verification
// Checks 13-18: IPC Routing

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCRouter } from '../../system/runtime/ipc-router';
import type { IPCMessage, IPCRouteConfig } from '../../system/kernel/types';

describe('IPCRouter - IPC Routing', () => {
  let router: IPCRouter;

  beforeEach(() => {
    router = new IPCRouter();
  });

  // Check 13: Per-window IPC routing
  describe('Per-window routing', () => {
    it('same channel, different handlers per window', () => {
      const handler1 = vi.fn().mockReturnValue('result-1');
      const handler2 = vi.fn().mockReturnValue('result-2');

      router.registerRoute({ channel: 'cmd', handler: handler1, windowId: 'win-1' });
      router.registerRoute({ channel: 'cmd', handler: handler2, windowId: 'win-2' });

      const result1 = router.send({ channel: 'cmd', sourceWindowId: 'win-1' }, 'win-1');
      const result2 = router.send({ channel: 'cmd', sourceWindowId: 'win-2' }, 'win-2');

      expect(result1).toBe('result-1');
      expect(result2).toBe('result-2');
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('routes to correct window handler only', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      router.registerRoute({ channel: 'data', handler: handler1, windowId: 'win-1' });
      router.registerRoute({ channel: 'data', handler: handler2, windowId: 'win-2' });

      router.send({ channel: 'data', sourceWindowId: 'win-1' }, 'win-1');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(0);
    });
  });

  // Check 14: Broadcast sends to all active windows
  describe('Broadcast', () => {
    it('sends to all windows with registered handlers', () => {
      const handler1 = vi.fn().mockReturnValue('ok');
      const handler2 = vi.fn().mockReturnValue('ok');

      router.registerRoute({ channel: 'update', handler: handler1, windowId: 'win-1' });
      router.registerRoute({ channel: 'update', handler: handler2, windowId: 'win-2' });

      const results = router.broadcast('update', { type: 'refresh' }, 'source');

      expect(results.size).toBe(2);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('does not send to destroyed windows', () => {
      const handler1 = vi.fn().mockReturnValue('ok');
      const handler2 = vi.fn().mockReturnValue('ok');

      router.registerRoute({ channel: 'update', handler: handler1, windowId: 'win-1' });
      router.registerRoute({ channel: 'update', handler: handler2, windowId: 'win-2' });

      router.removeWindowRoutes('win-2');

      const results = router.broadcast('update', { type: 'refresh' }, 'source');

      expect(results.size).toBe(1);
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(0);
    });
  });

  // Check 15: Message enrichment includes windowId and windowRole
  describe('Message enrichment', () => {
    it('enriched message includes windowId', () => {
      let capturedMsg: IPCMessage | null = null;
      router.registerRoute({
        channel: 'test',
        handler: (msg) => { capturedMsg = msg; },
        windowId: 'win-1',
      });

      router.send({ channel: 'test', sourceWindowId: 'sender' }, 'win-1');

      expect(capturedMsg).not.toBeNull();
      expect(capturedMsg!.windowId).toBe('win-1');
      expect(capturedMsg!.timestamp).toBeDefined();
    });

    it('enriched message includes windowRole', () => {
      let capturedMsg: IPCMessage | null = null;
      router.registerRoute({
        channel: 'test',
        handler: (msg) => { capturedMsg = msg; },
        windowId: 'win-1',
      });

      router.send({ channel: 'test', sourceWindowId: 'sender' }, 'win-1', 'main');

      expect(capturedMsg!.windowRole).toBe('main');
    });

    it('sourceWindowId preserved', () => {
      let capturedMsg: IPCMessage | null = null;
      router.registerRoute({
        channel: 'test',
        handler: (msg) => { capturedMsg = msg; },
        windowId: 'win-1',
      });

      router.send({ channel: 'test', sourceWindowId: 'original-sender' }, 'win-1');

      expect(capturedMsg!.sourceWindowId).toBe('original-sender');
    });
  });

  // Check 16: Global handler - first-responder pattern
  describe('Global handler (first-responder)', () => {
    it('global handler is called when no window-specific handler', () => {
      const globalHandler = vi.fn().mockReturnValue('global-result');
      router.registerRoute({ channel: 'cmd', handler: globalHandler });

      const result = router.send({ channel: 'cmd', sourceWindowId: 'win-1' }, 'win-1');

      expect(result).toBe('global-result');
      expect(globalHandler).toHaveBeenCalledTimes(1);
    });

    it('window-specific handler takes priority over global', () => {
      const globalHandler = vi.fn().mockReturnValue('global');
      const windowHandler = vi.fn().mockReturnValue('window-specific');

      router.registerRoute({ channel: 'cmd', handler: globalHandler });
      router.registerRoute({ channel: 'cmd', handler: windowHandler, windowId: 'win-1' });

      const result = router.send({ channel: 'cmd', sourceWindowId: 'win-1' }, 'win-1');

      expect(result).toBe('window-specific');
      expect(windowHandler).toHaveBeenCalledTimes(1);
      expect(globalHandler).toHaveBeenCalledTimes(0);
    });
  });

  // Check 17: Rate limiting integrates with IPC batch handler
  describe('Rate limiting', () => {
    it('allows messages within rate limit', () => {
      const handler = vi.fn().mockReturnValue('ok');
      router.registerRoute({ channel: 'test', handler, windowId: 'w1' });
      router.setRateLimit(10);
      for (let i = 0; i < 10; i++) {
        const result = router.send({ channel: 'test', sourceWindowId: 'w1' }, 'w1');
        expect(result).toBe('ok');
      }
    });

    it('emits rate-limited event when exceeded', () => {
      const handler = vi.fn().mockReturnValue('ok');
      router.registerRoute({ channel: 'test', handler, windowId: 'w1' });
      router.setRateLimit(3);
      const listener = vi.fn();
      router.on('rate-limited', listener);

      for (let i = 0; i < 5; i++) {
        router.send({ channel: 'test', sourceWindowId: 'w1' }, 'w1');
      }

      expect(listener).toHaveBeenCalled();
    });

    it('rate limit is per-window', () => {
      const handler1 = vi.fn().mockReturnValue('ok1');
      const handler2 = vi.fn().mockReturnValue('ok2');
      router.registerRoute({ channel: 'test', handler: handler1, windowId: 'w1' });
      router.registerRoute({ channel: 'test', handler: handler2, windowId: 'w2' });
      router.setRateLimit(2);
      router.send({ channel: 'test', sourceWindowId: 'w1' }, 'w1');
      router.send({ channel: 'test', sourceWindowId: 'w1' }, 'w1');
      // w2 should still be allowed
      const result = router.send({ channel: 'test', sourceWindowId: 'w2' }, 'w2');
      expect(result).toBe('ok2');
    });
  });

  // Check 18: Handler cleanup when window closes
  describe('Handler cleanup', () => {
    it('removeWindowRoutes clears routes for a window', () => {
      const handler = vi.fn();
      router.registerRoute({ channel: 'test', handler, windowId: 'win-1' });
      expect(router.getWindowRouteCount('win-1')).toBe(1);

      router.removeWindowRoutes('win-1');
      expect(router.getWindowRouteCount('win-1')).toBe(0);
    });

    it('routes return disposable for cleanup', () => {
      const handler = vi.fn();
      const dispose = router.registerRoute({ channel: 'test', handler, windowId: 'win-1' });
      expect(router.getRouteCount()).toBeGreaterThanOrEqual(1);

      dispose();
      // Route should be cleaned up
    });

    it('destroyed window flagged correctly', () => {
      router.removeWindowRoutes('win-1');
      expect(router.isWindowDestroyed('win-1')).toBe(true);
    });
  });
});
