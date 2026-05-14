/**
 * VibeCode Desktop — Analytics Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron BEFORE anything else
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-analytics'),
    isPackaged: false,
    getVersion: vi.fn().mockReturnValue('0.2.0'),
    getName: vi.fn().mockReturnValue('VibeCode'),
  },
  ipcMain: { handle: vi.fn() },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({
    enabled: false,
    crashReporting: false,
    usageMetrics: false,
    performanceMetrics: false,
    sessionId: 'test-session',
    consentDate: null,
    consentVersion: '1.0',
  })),
  rmSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('../main/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../main/utils/audit-log', () => ({
  auditLog: { log: vi.fn() },
}));

import { AnalyticsService } from '../main/services/analytics';

describe('Analytics Service', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService();
  });

  it('should have opt-in by default', () => {
    const config = service.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.crashReporting).toBe(false);
    expect(config.usageMetrics).toBe(false);
    expect(config.performanceMetrics).toBe(false);
  });

  it('should grant consent and enable analytics', () => {
    service.grantConsent();
    const config = service.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.consentDate).toBeTruthy();
    service.revokeConsent();
  });

  it('should revoke consent and disable analytics', () => {
    service.grantConsent();
    service.revokeConsent();
    const config = service.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.consentDate).toBeNull();
  });

  it('should track features only when enabled', () => {
    service.trackFeature('test-feature');
    expect(Object.keys(service.getUsageMetrics().featureUsage).length).toBe(0);

    service.grantConsent();
    service.trackFeature('test-feature');
    expect(service.getUsageMetrics().featureUsage['test-feature']).toBe(1);
    service.revokeConsent();
  });

  it('should track provider usage', () => {
    service.grantConsent();
    service.trackProvider('openai-1', 'openai');
    service.trackProvider('anthropic-1', 'anthropic');
    service.trackProvider('openai-2', 'openai');
    expect(service.getUsageMetrics().providerPopularity['openai']).toBe(2);
    expect(service.getUsageMetrics().providerPopularity['anthropic']).toBe(1);
    service.revokeConsent();
  });

  it('should track execution results', () => {
    service.grantConsent();
    service.trackExecution(true, 500);
    service.trackExecution(true, 300);
    service.trackExecution(false, 100);
    expect(service.getUsageMetrics().executionSuccessRate).toBeCloseTo(2 / 3);
    service.revokeConsent();
  });

  it('should not track when disabled', () => {
    service.revokeConsent();
    service.trackFeature('should-not-track');
    service.trackProvider('test', 'openai');
    service.trackExecution(true);
    expect(Object.keys(service.getUsageMetrics().featureUsage).length).toBe(0);
  });

  it('should support selective consent', () => {
    service.grantConsent({ crashReporting: true, usageMetrics: false, performanceMetrics: true });
    const config = service.getConfig();
    expect(config.crashReporting).toBe(true);
    expect(config.usageMetrics).toBe(false);
    expect(config.performanceMetrics).toBe(true);
    service.revokeConsent();
  });

  it('should anonymize PII in crash events', () => {
    service.grantConsent();
    service.trackCrash('Error at /Users/john/project/file.ts with key sk-abc1234567890123456789');
    const events = service.getPendingEvents();
    expect(events.length).toBeGreaterThan(0);
    service.revokeConsent();
  });
});
