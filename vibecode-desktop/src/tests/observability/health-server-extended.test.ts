// VibeCode Phase 11: Extended Health Server Tests
// Targeting ≥ 80% coverage for health-server.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthServer } from '../../system/observability/health-server';
import type { HealthCheckResult, ServiceInfo } from '../../system/kernel/types';

describe('HealthServer - Extended Coverage', () => {
  let server: HealthServer;

  beforeEach(() => {
    server = new HealthServer({ lazyInit: true });
  });

  afterEach(() => {
    server.stop();
  });

  describe('lazy initialization', () => {
    it('does not initialize when lazyInit is true', () => {
      expect(server.isInitialized()).toBe(false);
    });

    it('initializes immediately when lazyInit is false', () => {
      const eager = new HealthServer({ lazyInit: false });
      expect(eager.isInitialized()).toBe(true);
      eager.stop();
    });

    it('emits health-server:initialized event on initialize', () => {
      const handler = vi.fn();
      server.on('health-server:initialized', handler);
      server.initialize();
      expect(handler).toHaveBeenCalledWith({ port: 9090 });
    });

    it('does not double-initialize', () => {
      const handler = vi.fn();
      server.on('health-server:initialized', handler);
      server.initialize();
      server.initialize();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('start and stop lifecycle', () => {
    it('initializes on start if not already initialized', async () => {
      expect(server.isInitialized()).toBe(false);
      await server.start();
      expect(server.isInitialized()).toBe(true);
      expect(server.isRunning()).toBe(true);
    });

    it('emits health-server:started on start', async () => {
      const handler = vi.fn();
      server.on('health-server:started', handler);
      await server.start();
      expect(handler).toHaveBeenCalledWith({ port: 9090, host: '127.0.0.1' });
    });

    it('emits health-server:stopped on stop', async () => {
      const handler = vi.fn();
      server.on('health-server:stopped', handler);
      await server.start();
      await server.stop();
      expect(handler).toHaveBeenCalled();
      expect(server.isRunning()).toBe(false);
    });

    it('reports running state correctly', async () => {
      expect(server.isRunning()).toBe(false);
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('health check registration', () => {
    it('registers and runs a health check', async () => {
      const check: () => Promise<HealthCheckResult> = vi.fn().mockResolvedValue({
        healthy: true,
        latency: 5,
        timestamp: Date.now(),
      });
      server.registerHealthCheck('test-check', check);
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.checks['test-check']).toBeDefined();
      expect(report.checks['test-check'].healthy).toBe(true);
    });

    it('reports unhealthy when a check fails', async () => {
      const check: () => Promise<HealthCheckResult> = vi.fn().mockResolvedValue({
        healthy: false,
        latency: 100,
        timestamp: Date.now(),
        details: { reason: 'timeout' },
      });
      server.registerHealthCheck('failing-check', check);
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.status).toBe('unhealthy');
      expect(report.checks['failing-check'].healthy).toBe(false);
    });

    it('handles health check that throws an error', async () => {
      const check: () => Promise<HealthCheckResult> = vi.fn().mockRejectedValue(new Error('check crashed'));
      server.registerHealthCheck('crashing-check', check);
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.status).toBe('unhealthy');
      expect(report.checks['crashing-check'].healthy).toBe(false);
      expect(report.checks['crashing-check'].details?.error).toBeDefined();
    });
  });

  describe('service info provider', () => {
    it('returns empty services when no provider set', async () => {
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.services).toEqual([]);
    });

    it('returns services from provider', async () => {
      const services: ServiceInfo[] = [
        { name: 'kernel', state: 'ready', version: '1.0.0', dependencies: [] },
        { name: 'runtime', state: 'ready', version: '1.0.0', dependencies: ['kernel'] },
      ];
      server.setServiceInfoProvider(() => services);
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.services).toEqual(services);
    });
  });

  describe('health report structure', () => {
    it('includes all required fields', async () => {
      await server.start();
      const report = await server.getHealthStatus();
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('checks');
      expect(report).toHaveProperty('services');
      expect(report).toHaveProperty('uptime');
      expect(report).toHaveProperty('version');
      expect(typeof report.uptime).toBe('number');
      expect(typeof report.version).toBe('string');
    });

    it('reports healthy when all checks pass', async () => {
      server.registerHealthCheck('ok1', vi.fn().mockResolvedValue({ healthy: true }));
      server.registerHealthCheck('ok2', vi.fn().mockResolvedValue({ healthy: true }));
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.status).toBe('healthy');
    });

    it('reports unhealthy when any check fails', async () => {
      server.registerHealthCheck('ok', vi.fn().mockResolvedValue({ healthy: true }));
      server.registerHealthCheck('bad', vi.fn().mockResolvedValue({ healthy: false }));
      await server.start();
      const report = await server.getHealthStatus();
      expect(report.status).toBe('unhealthy');
    });
  });

  describe('configuration', () => {
    it('returns default config', () => {
      const config = server.getConfig();
      expect(config.port).toBe(9090);
      expect(config.host).toBe('127.0.0.1');
      expect(config.lazyInit).toBe(true);
      expect(config.endpoint).toBe('/health');
    });

    it('accepts custom config', () => {
      const custom = new HealthServer({ port: 8080, host: '0.0.0.0', lazyInit: true, endpoint: '/status' });
      const config = custom.getConfig();
      expect(config.port).toBe(8080);
      expect(config.host).toBe('0.0.0.0');
      expect(config.endpoint).toBe('/status');
      custom.stop();
    });

    it('config is a copy (not a reference)', () => {
      const config = server.getConfig();
      (config as Record<string, unknown>).port = 9999;
      expect(server.getConfig().port).toBe(9090);
    });
  });
});
