// ============================================================
// VibeCode Desktop — Status Provider Tests
// Verifies mode detection, health grading, failure intelligence,
// and snapshot building
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  detectMode,
  gradeSystemHealth,
  resolvePorts,
  detectInfrastructure,
  buildSystemStatus,
  analyzeFailure,
  type ProcessState,
  type HealthLayer,
  type InfrastructureLayer,
} from '../src/main/system/status-provider';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const makeProcesses = (overrides: Partial<ProcessState> = {}): ProcessState => ({
  viteExpected: false,
  electronRunning: false,
  pm2Active: false,
  watchdogRunning: false,
  ...overrides,
});

const makeHealth = (overrides: Partial<HealthLayer> = {}): HealthLayer => ({
  endpointReachable: false,
  ready: null,
  alive: null,
  restartCount: 0,
  ...overrides,
});

const makeInfra = (overrides: Partial<InfrastructureLayer> = {}): InfrastructureLayer => ({
  pm2Enabled: false,
  watchdogEnabled: false,
  healthServerEnabled: false,
  caddyExpected: false,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StatusProvider', () => {
  describe('Mode Detection', () => {
    it('should detect dev mode by default', () => {
      const result = detectMode({});
      expect(result.mode).toBe('dev');
      expect(result.source).toContain('default');
    });

    it('should detect dev mode from VIBECODE_ENV=dev', () => {
      const result = detectMode({ VIBECODE_ENV: 'dev' });
      expect(result.mode).toBe('dev');
      expect(result.source).toContain('VIBECODE_ENV=dev');
    });

    it('should detect preview mode from VIBECODE_ENV=preview', () => {
      const result = detectMode({ VIBECODE_ENV: 'preview' });
      expect(result.mode).toBe('preview');
    });

    it('should detect production mode from VIBECODE_ENV=production', () => {
      const result = detectMode({ VIBECODE_ENV: 'production' });
      expect(result.mode).toBe('production');
    });

    it('should detect preview mode from VIBECODE_HEALTH_PORT', () => {
      const result = detectMode({ VIBECODE_HEALTH_PORT: '9876' });
      expect(result.mode).toBe('preview');
      expect(result.source).toContain('VIBECODE_HEALTH_PORT');
    });

    it('should detect preview mode from pm_id (PM2)', () => {
      const result = detectMode({ pm_id: '0' });
      expect(result.mode).toBe('preview');
      expect(result.source).toContain('PM2');
    });

    it('should detect production mode from NODE_ENV=production', () => {
      const result = detectMode({ NODE_ENV: 'production' });
      expect(result.mode).toBe('production');
    });

    it('should detect dev mode from VIBECODE_DEV=1', () => {
      const result = detectMode({ VIBECODE_DEV: '1' });
      expect(result.mode).toBe('dev');
    });

    it('should prioritize VIBECODE_ENV over NODE_ENV', () => {
      const result = detectMode({ VIBECODE_ENV: 'preview', NODE_ENV: 'production' });
      expect(result.mode).toBe('preview');
    });
  });

  describe('Port Resolution', () => {
    it('should return Vite port in dev mode', () => {
      const ports = resolvePorts('dev', {});
      expect(ports.frontend).toBe(5173);
      expect(ports.health).toBeNull();
    });

    it('should return health port in preview mode', () => {
      const ports = resolvePorts('preview', { VIBECODE_HEALTH_PORT: '9876' });
      expect(ports.health).toBe(9876);
      expect(ports.frontend).toBeNull();
    });

    it('should return default health port for preview without explicit setting', () => {
      const ports = resolvePorts('preview', {});
      expect(ports.health).toBe(9876);
    });

    it('should have no ports in production mode', () => {
      const ports = resolvePorts('production', {});
      expect(ports.frontend).toBeNull();
      expect(ports.health).toBeNull();
    });
  });

  describe('Infrastructure Detection', () => {
    it('should detect no infrastructure in dev mode', () => {
      const infra = detectInfrastructure('dev', {});
      expect(infra.pm2Enabled).toBe(false);
      expect(infra.watchdogEnabled).toBe(false);
      expect(infra.healthServerEnabled).toBe(false);
    });

    it('should detect PM2 as enabled in preview mode', () => {
      const infra = detectInfrastructure('preview', { VIBECODE_HEALTH_PORT: '9876' });
      expect(infra.pm2Enabled).toBe(true);
      expect(infra.healthServerEnabled).toBe(true);
      expect(infra.watchdogEnabled).toBe(true);
    });

    it('should detect PM2 as enabled in production mode', () => {
      const infra = detectInfrastructure('production', {});
      expect(infra.pm2Enabled).toBe(true);
    });

    it('should never expect Caddy automatically', () => {
      const infra = detectInfrastructure('preview', { VIBECODE_HEALTH_PORT: '9876' });
      expect(infra.caddyExpected).toBe(false);
    });
  });

  describe('Health Grading', () => {
    it('should grade GREEN for healthy dev mode', () => {
      const result = gradeSystemHealth(
        'dev',
        makeProcesses({ electronRunning: true }),
        makeHealth(),
        makeInfra(),
      );
      expect(result.grade).toBe('GREEN');
    });

    it('should grade YELLOW when Electron is not running in dev mode', () => {
      const result = gradeSystemHealth(
        'dev',
        makeProcesses({ electronRunning: false }),
        makeHealth(),
        makeInfra(),
      );
      expect(result.grade).toBe('YELLOW');
    });

    it('should grade RED for preview mode without PM2', () => {
      const result = gradeSystemHealth(
        'preview',
        makeProcesses({ pm2Active: false }),
        makeHealth({ endpointReachable: false }),
        makeInfra(),
      );
      expect(result.grade).toBe('RED');
    });

    it('should grade RED for preview mode with unreachable health endpoint', () => {
      const result = gradeSystemHealth(
        'preview',
        makeProcesses({ pm2Active: true }),
        makeHealth({ endpointReachable: false }),
        makeInfra(),
      );
      expect(result.grade).toBe('RED');
    });

    it('should grade YELLOW when watchdog is not running in preview mode', () => {
      const result = gradeSystemHealth(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: false }),
        makeHealth({ endpointReachable: true, alive: true, ready: true }),
        makeInfra(),
      );
      expect(result.grade).toBe('YELLOW');
    });

    it('should grade YELLOW when restart count is high', () => {
      const result = gradeSystemHealth(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: true }),
        makeHealth({ endpointReachable: true, alive: true, ready: true, restartCount: 5 }),
        makeInfra(),
      );
      expect(result.grade).toBe('YELLOW');
    });

    it('should grade GREEN for healthy preview mode', () => {
      const result = gradeSystemHealth(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: true }),
        makeHealth({ endpointReachable: true, alive: true, ready: true }),
        makeInfra(),
      );
      expect(result.grade).toBe('GREEN');
    });
  });

  describe('Failure Intelligence', () => {
    it('should classify PM2_MISCONFIGURATION when preview mode has no PM2', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: false }),
        makeHealth({ endpointReachable: false }),
        makeInfra(),
        ['Preview mode detected but PM2 is not managing the process'],
      );

      expect(result.category).toBe('PM2_MISCONFIGURATION');
      expect(result.confidence).toBe('HIGH');
      expect(result.likelyCauses.length).toBeGreaterThanOrEqual(2);
      expect(result.recommendedActions.length).toBeGreaterThanOrEqual(1);
      expect(result.safeRecoveryPath.length).toBeGreaterThanOrEqual(2);
    });

    it('should classify HEALTH_SERVER_DOWN when preview has unreachable health', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true }),
        makeHealth({ endpointReachable: false }),
        makeInfra(),
        ['Preview mode detected but health endpoint is unreachable'],
      );

      expect(result.category).toBe('HEALTH_SERVER_DOWN');
      expect(result.confidence).toBe('HIGH');
      expect(result.likelyCauses).toContain('The Electron process has not finished starting up yet');
      expect(result.recommendedActions.some(a => a.command === 'npm run preview:logs')).toBe(true);
    });

    it('should classify PROCESS_FAILURE when health endpoint reports error', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true, electronRunning: false }),
        makeHealth({
          endpointReachable: true,
          healthResponse: { status: 'error', uptime: 0, version: '0.1.0', channel: 'beta', services: {} },
        }),
        makeInfra(),
        ['Health endpoint reports error status'],
      );

      expect(result.category).toBe('PROCESS_FAILURE');
      expect(result.confidence).toBe('HIGH');
      expect(result.likelyCauses.some(c => c.includes('unhandled exception'))).toBe(true);
    });

    it('should classify WATCHDOG_INSTABILITY when watchdog runs but restarts are high', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: true }),
        makeHealth({ endpointReachable: true, alive: true, ready: true, restartCount: 7 }),
        makeInfra(),
        ['PM2 restart count is 7 (>3) - possible instability'],
      );

      expect(result.category).toBe('WATCHDOG_INSTABILITY');
      expect(result.confidence).toBe('MEDIUM');
      expect(result.recommendedActions.some(a => a.command === 'npm run watchdog:stop')).toBe(true);
    });

    it('should classify PROCESS_FAILURE for high restarts without watchdog', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: false }),
        makeHealth({ endpointReachable: true, alive: true, ready: true, restartCount: 6 }),
        makeInfra(),
        ['PM2 restart count is 6 (>3) - possible instability'],
      );

      expect(result.category).toBe('PROCESS_FAILURE');
      expect(result.confidence).toBe('MEDIUM');
      expect(result.likelyCauses.some(c => c.includes('crashing repeatedly'))).toBe(true);
    });

    it('should classify SERVICE_DEGRADATION when services are down', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: true }),
        makeHealth({
          endpointReachable: true,
          alive: true,
          ready: true,
          healthResponse: {
            status: 'ok',
            uptime: 100,
            version: '0.1.0',
            channel: 'beta',
            services: { memory: true, session: false, sandbox: true },
          },
        }),
        makeInfra(),
        ['Services down: session'],
      );

      expect(result.category).toBe('SERVICE_DEGRADATION');
      expect(result.confidence).toBe('MEDIUM');
      expect(result.likelyCauses.some(c => c.includes('session'))).toBe(true);
    });

    it('should classify SERVICE_DEGRADATION when readiness check fails', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: true }),
        makeHealth({ endpointReachable: true, alive: true, ready: false }),
        makeInfra(),
        ['Health endpoint reachable but readiness check failed'],
      );

      expect(result.category).toBe('SERVICE_DEGRADATION');
      expect(result.confidence).toBe('MEDIUM');
      expect(result.recommendedActions.some(a => a.command === 'npm run health:ready')).toBe(true);
    });

    it('should classify PROCESS_FAILURE when Electron not running in dev mode', () => {
      const result = analyzeFailure(
        'dev',
        makeProcesses({ electronRunning: false }),
        makeHealth(),
        makeInfra(),
        ['Electron process not detected - may be starting up or stopped'],
      );

      expect(result.category).toBe('PROCESS_FAILURE');
      expect(result.confidence).toBe('LOW');
      expect(result.likelyCauses.some(c => c.includes('not yet started'))).toBe(true);
    });

    it('should classify WATCHDOG_INSTABILITY when watchdog not running in preview', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: true, watchdogRunning: false }),
        makeHealth({ endpointReachable: true, alive: true, ready: true }),
        makeInfra(),
        ['Watchdog is not running - process will not auto-recover from crashes'],
      );

      expect(result.category).toBe('WATCHDOG_INSTABILITY');
      expect(result.confidence).toBe('LOW');
      expect(result.recommendedActions.some(a => a.command === 'npm run watchdog:start')).toBe(true);
    });

    it('should classify UNKNOWN_STATE for unmatched degraded states', () => {
      const result = analyzeFailure(
        'dev',
        makeProcesses({ electronRunning: true }),
        makeHealth(),
        makeInfra(),
        ['Some unrecognized condition'],
      );

      expect(result.category).toBe('UNKNOWN_STATE');
      expect(result.confidence).toBe('LOW');
      expect(result.likelyCauses.some(c => c.includes('unexpected state'))).toBe(true);
    });

    it('should always provide at least one recommended action', () => {
      const scenarios = [
        { mode: 'preview', processes: makeProcesses({ pm2Active: false }), health: makeHealth({ endpointReachable: false }), reasons: ['test'] },
        { mode: 'dev', processes: makeProcesses({ electronRunning: false }), health: makeHealth(), reasons: ['test'] },
        { mode: 'preview', processes: makeProcesses({ pm2Active: true }), health: makeHealth({ endpointReachable: false }), reasons: ['test'] },
      ];

      for (const s of scenarios) {
        const result = analyzeFailure(s.mode, s.processes, s.health, makeInfra(), s.reasons);
        expect(result.recommendedActions.length).toBeGreaterThanOrEqual(1);
        expect(result.safeRecoveryPath.length).toBeGreaterThanOrEqual(1);
        expect(result.likelyCauses.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should include riskLevel in all recommended actions', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: false }),
        makeHealth({ endpointReachable: false }),
        makeInfra(),
        ['test'],
      );

      for (const action of result.recommendedActions) {
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(action.riskLevel);
        expect(action.command).toBeTruthy();
        expect(action.purpose).toBeTruthy();
      }
    });

    it('should use conservative language in likely causes', () => {
      const result = analyzeFailure(
        'preview',
        makeProcesses({ pm2Active: false }),
        makeHealth({ endpointReachable: false }),
        makeInfra(),
        ['test'],
      );

      // Causes should use tentative language, not definitive claims
      for (const cause of result.likelyCauses) {
        // Should NOT contain words like "definitely", "certainly", "is the cause"
        const lower = cause.toLowerCase();
        expect(lower).not.toContain('definitely');
        expect(lower).not.toContain('certainly');
        expect(lower).not.toContain('is the cause');
      }
    });
  });

  describe('Full Snapshot Builder', () => {
    it('should build a complete status snapshot', () => {
      const status = buildSystemStatus({
        env: { VIBECODE_ENV: 'preview', VIBECODE_HEALTH_PORT: '9876' },
        pm2Active: true,
        electronRunning: true,
        watchdogRunning: true,
        healthEndpointReachable: true,
        alive: true,
        ready: true,
        version: '0.1.0',
      });

      expect(status.mode).toBe('preview');
      expect(status.grade).toBe('GREEN');
      expect(status.processes.pm2Active).toBe(true);
      expect(status.health.endpointReachable).toBe(true);
      expect(status.ports.health).toBe(9876);
      expect(status.version).toBe('0.1.0');
    });

    it('should build a dev mode snapshot by default', () => {
      const status = buildSystemStatus();

      expect(status.mode).toBe('dev');
      expect(status.processes.viteExpected).toBe(true);
      expect(status.ports.frontend).toBe(5173);
    });

    it('should include failure analysis when grade is YELLOW', () => {
      const status = buildSystemStatus({
        env: {},
        electronRunning: false,
      });

      expect(status.grade).toBe('YELLOW');
      expect(status.failure).toBeDefined();
      expect(status.failure?.category).toBe('PROCESS_FAILURE');
    });

    it('should include failure analysis when grade is RED', () => {
      const status = buildSystemStatus({
        env: { VIBECODE_ENV: 'preview', VIBECODE_HEALTH_PORT: '9876' },
        pm2Active: false,
        electronRunning: false,
        healthEndpointReachable: false,
      });

      expect(status.grade).toBe('RED');
      expect(status.failure).toBeDefined();
      expect(status.failure?.category).toBe('PM2_MISCONFIGURATION');
      expect(status.failure?.confidence).toBe('HIGH');
    });

    it('should NOT include failure analysis when grade is GREEN', () => {
      const status = buildSystemStatus({
        env: { VIBECODE_ENV: 'preview', VIBECODE_HEALTH_PORT: '9876' },
        pm2Active: true,
        electronRunning: true,
        watchdogRunning: true,
        healthEndpointReachable: true,
        alive: true,
        ready: true,
      });

      expect(status.grade).toBe('GREEN');
      expect(status.failure).toBeUndefined();
    });
  });
});
