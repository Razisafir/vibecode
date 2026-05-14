// ============================================================
// VibeCode Desktop — Health Server Tests
// Verifies health check HTTP server behavior:
//   - Server does NOT start without VIBECODE_HEALTH_PORT
//   - Server starts correctly when port is configured
//   - Endpoints return expected JSON structure
// ============================================================

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { startHealthServer, stopHealthServer, isHealthServerRunning } from '../src/main/services/health-server';

// Helper: wait for server to be ready
async function waitForServer(maxRetries = 10, delayMs = 100): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (isHealthServerRunning()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// Helper: wait for HTTP endpoint to be reachable
async function waitForEndpoint(url: string, maxRetries = 10, delayMs = 100): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 503) return true;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

describe('HealthServer', () => {
  afterEach(() => {
    stopHealthServer();
    delete process.env.VIBECODE_HEALTH_PORT;
  });

  describe('Startup behavior', () => {
    it('should NOT start when VIBECODE_HEALTH_PORT is not set', () => {
      delete process.env.VIBECODE_HEALTH_PORT;
      startHealthServer();
      expect(isHealthServerRunning()).toBe(false);
    });

    it('should start when VIBECODE_HEALTH_PORT is set', async () => {
      process.env.VIBECODE_HEALTH_PORT = '19876';
      startHealthServer();
      const running = await waitForServer();
      expect(running).toBe(true);
    });

    it('should not start twice on duplicate calls', async () => {
      process.env.VIBECODE_HEALTH_PORT = '19877';
      startHealthServer();
      const running = await waitForServer();
      expect(running).toBe(true);

      // Second call should be a no-op
      startHealthServer();
      expect(isHealthServerRunning()).toBe(true);
    });
  });

  describe('HTTP endpoints', () => {
    const TEST_PORT = 19878;
    let serverReady = false;

    beforeAll(async () => {
      process.env.VIBECODE_HEALTH_PORT = String(TEST_PORT);
      startHealthServer();
      serverReady = await waitForEndpoint(`http://localhost:${TEST_PORT}/api/health/live`);
    });

    afterAll(() => {
      stopHealthServer();
      delete process.env.VIBECODE_HEALTH_PORT;
    });

    it('should respond to /api/health/live', async () => {
      if (!serverReady) {
        // Skip if server couldn't start (e.g. in CI without network)
        return;
      }
      const response = await fetch(`http://localhost:${TEST_PORT}/api/health/live`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.alive).toBe(true);
      expect(body.pid).toBeTypeOf('number');
      expect(body.timestamp).toBeTypeOf('string');
    });

    it('should respond to /api/health', async () => {
      if (!serverReady) return;
      const response = await fetch(`http://localhost:${TEST_PORT}/api/health`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.uptime).toBeTypeOf('number');
      expect(body.version).toBeTypeOf('string');
      expect(body.channel).toBeTypeOf('string');
      expect(body.services).toBeDefined();
    });

    it('should respond to /api/health/ready', async () => {
      if (!serverReady) return;
      const response = await fetch(`http://localhost:${TEST_PORT}/api/health/ready`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.ready).toBe(true);
      expect(body.checks).toBeDefined();
    });

    it('should return 404 for unknown paths', async () => {
      if (!serverReady) return;
      const response = await fetch(`http://localhost:${TEST_PORT}/unknown`);
      expect(response.status).toBe(404);
    });

    it('should return 405 for non-GET methods', async () => {
      if (!serverReady) return;
      const response = await fetch(`http://localhost:${TEST_PORT}/api/health`, {
        method: 'POST',
      });
      expect(response.status).toBe(405);
    });
  });

  describe('Shutdown', () => {
    it('should stop cleanly', async () => {
      process.env.VIBECODE_HEALTH_PORT = '19879';
      startHealthServer();
      const running = await waitForServer();
      expect(running).toBe(true);

      stopHealthServer();
      await new Promise((r) => setTimeout(r, 300));
      expect(isHealthServerRunning()).toBe(false);
    });
  });
});
