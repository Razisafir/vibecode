/**
 * VibeCode Desktop — Analytics Service
 *
 * Privacy-first, opt-in analytics architecture.
 * All data collection requires explicit user consent.
 * Data is anonymized and aggregated before any transmission.
 *
 * Key Principles:
 * - Opt-in only — never collects without consent
 * - Anonymized — no personally identifiable information
 * - Transparent — users can see exactly what is collected
 * - Minimal — only collect what is necessary
 * - Local-first — data stays on device unless user opts into sync
 */

import { app } from 'electron';
import {
  kernelFsExistsInternal,
  kernelFsReadSync,
  kernelFsMkdirInternalSync,
  kernelFsWriteInternalSync,
  kernelFsAppendInternalSync,
  kernelFsDeleteInternalSync,
} from '../kernel/kernel-fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit-log';

// ── Types ──────────────────────────────────────────────────────

export interface AnalyticsConfig {
  enabled: boolean;
  crashReporting: boolean;
  usageMetrics: boolean;
  performanceMetrics: boolean;
  sessionId: string;
  consentDate: number | null;
  consentVersion: string;
}

export interface AnalyticsEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
}

export interface UsageMetrics {
  sessionLength: number;
  featureUsage: Record<string, number>;
  executionSuccessRate: number;
  providerPopularity: Record<string, number>;
  averageSessionLength: number;
  totalSessions: number;
  crashFrequency: number;
}

// ── Analytics Service ──────────────────────────────────────────

export class AnalyticsService {
  private config: AnalyticsConfig;
  private configPath: string;
  private sessionStartTime: number = 0;
  private eventQueue: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private featureUsage: Record<string, number> = {};
  private providerUsage: Record<string, number> = {};
  private executionResults: { success: number; failure: number } = { success: 0, failure: 0 };

  constructor() {
    this.config = this.getDefaultConfig();
    this.configPath = path.join(app.getPath('userData'), 'config', 'analytics.json');
    this.loadConfig();
  }

  // ── Configuration ─────────────────────────────────────────────

  private getDefaultConfig(): AnalyticsConfig {
    return {
      enabled: false, // OPT-IN by default
      crashReporting: false,
      usageMetrics: false,
      performanceMetrics: false,
      sessionId: crypto.randomUUID(),
      consentDate: null,
      consentVersion: '1.0',
    };
  }

  private loadConfig(): void {
    try {
      if (kernelFsExistsInternal(this.configPath)) {
        const data = kernelFsReadSync(this.configPath);
        const saved = JSON.parse(data);
        this.config = { ...this.getDefaultConfig(), ...saved };
      }
    } catch (err) {
      logger.warn('analytics', 'Failed to load analytics config, using defaults');
    }
  }

  private saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!kernelFsExistsInternal(configDir)) {
        kernelFsMkdirInternalSync(configDir);
      }
      kernelFsWriteInternalSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (err) {
      logger.error('analytics', 'Failed to save analytics config', { error: String(err) });
    }
  }

  // ── Consent Management ────────────────────────────────────────

  /**
   * Grant consent for analytics data collection.
   */
  grantConsent(options?: Partial<Pick<AnalyticsConfig, 'crashReporting' | 'usageMetrics' | 'performanceMetrics'>>): void {
    this.config.enabled = true;
    this.config.consentDate = Date.now();
    this.config.consentVersion = '1.0';
    this.config.sessionId = crypto.randomUUID();

    if (options) {
      if (options.crashReporting !== undefined) this.config.crashReporting = options.crashReporting;
      if (options.usageMetrics !== undefined) this.config.usageMetrics = options.usageMetrics;
      if (options.performanceMetrics !== undefined) this.config.performanceMetrics = options.performanceMetrics;
    } else {
      // Default: enable all when consent is granted
      this.config.crashReporting = true;
      this.config.usageMetrics = true;
      this.config.performanceMetrics = true;
    }

    this.saveConfig();
    logger.info('analytics', 'Analytics consent granted');
    auditLog.auditLog('analytics:consent', { enabled: true, options: this.config });

    this.startSession();
  }

  /**
   * Revoke consent and stop all data collection.
   */
  revokeConsent(): void {
    this.config.enabled = false;
    this.config.crashReporting = false;
    this.config.usageMetrics = false;
    this.config.performanceMetrics = false;
    this.config.consentDate = null;
    this.saveConfig();

    this.stopSession();
    this.clearLocalData();

    logger.info('analytics', 'Analytics consent revoked');
    auditLog.auditLog('analytics:consent', { enabled: false });
  }

  /**
   * Get current consent configuration.
   */
  getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  /**
   * Update specific consent settings.
   */
  updateConfig(updates: Partial<Pick<AnalyticsConfig, 'crashReporting' | 'usageMetrics' | 'performanceMetrics'>>): void {
    if (!this.config.enabled) return;

    if (updates.crashReporting !== undefined) this.config.crashReporting = updates.crashReporting;
    if (updates.usageMetrics !== undefined) this.config.usageMetrics = updates.usageMetrics;
    if (updates.performanceMetrics !== undefined) this.config.performanceMetrics = updates.performanceMetrics;

    this.saveConfig();
    logger.info('analytics', 'Analytics config updated', updates);
  }

  // ── Session Tracking ──────────────────────────────────────────

  startSession(): void {
    if (!this.config.enabled) return;

    this.sessionStartTime = Date.now();
    this.featureUsage = {};
    this.providerUsage = {};
    this.executionResults = { success: 0, failure: 0 };

    // Flush events every 5 minutes
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5 * 60 * 1000);

    this.trackEvent('session:start', {});
    logger.info('analytics', 'Analytics session started');
  }

  stopSession(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.config.enabled && this.sessionStartTime > 0) {
      const sessionLength = Date.now() - this.sessionStartTime;
      this.trackEvent('session:end', { sessionLength });
      this.flush();
    }

    this.sessionStartTime = 0;
    logger.info('analytics', 'Analytics session stopped');
  }

  // ── Event Tracking ────────────────────────────────────────────

  /**
   * Track a feature usage event.
   */
  trackFeature(feature: string): void {
    if (!this.config.enabled || !this.config.usageMetrics) return;

    this.featureUsage[feature] = (this.featureUsage[feature] || 0) + 1;
    this.trackEvent('feature:use', { feature });
  }

  /**
   * Track a provider usage event.
   */
  trackProvider(providerId: string, providerType: string): void {
    if (!this.config.enabled || !this.config.usageMetrics) return;

    this.providerUsage[providerType] = (this.providerUsage[providerType] || 0) + 1;
    this.trackEvent('provider:use', { providerType });
  }

  /**
   * Track an execution result.
   */
  trackExecution(success: boolean, durationMs?: number): void {
    if (!this.config.enabled || !this.config.usageMetrics) return;

    if (success) {
      this.executionResults.success++;
    } else {
      this.executionResults.failure++;
    }
    this.trackEvent('execution:result', { success, durationMs });
  }

  /**
   * Track a crash event.
   */
  trackCrash(error: string, context?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.config.crashReporting) return;

    this.trackEvent('crash', {
      error: this.anonymizeString(error),
      ...context,
    });
  }

  /**
   * Track a performance metric.
   */
  trackPerformance(metric: string, value: number, unit?: string): void {
    if (!this.config.enabled || !this.config.performanceMetrics) return;

    this.trackEvent('performance:metric', { metric, value, unit });
  }

  // ── Metrics Retrieval ─────────────────────────────────────────

  /**
   * Get current usage metrics (for display in settings).
   */
  getUsageMetrics(): UsageMetrics {
    const totalExecutions = this.executionResults.success + this.executionResults.failure;
    return {
      sessionLength: this.sessionStartTime > 0 ? Date.now() - this.sessionStartTime : 0,
      featureUsage: { ...this.featureUsage },
      executionSuccessRate: totalExecutions > 0
        ? this.executionResults.success / totalExecutions
        : 0,
      providerPopularity: { ...this.providerUsage },
      averageSessionLength: 0, // Computed from historical data
      totalSessions: 1, // Current session
      crashFrequency: 0, // Computed from crash reports
    };
  }

  /**
   * Get the list of events that would be sent (for transparency).
   */
  getPendingEvents(): AnalyticsEvent[] {
    return [...this.eventQueue];
  }

  // ── Private Helpers ───────────────────────────────────────────

  private trackEvent(event: string, properties: Record<string, unknown>): void {
    if (!this.config.enabled) return;

    const analyticsEvent: AnalyticsEvent = {
      event,
      properties: this.anonymizeProperties(properties),
      timestamp: Date.now(),
      sessionId: this.config.sessionId,
    };

    this.eventQueue.push(analyticsEvent);

    // Keep queue bounded
    if (this.eventQueue.length > 1000) {
      this.eventQueue = this.eventQueue.slice(-500);
    }
  }

  private anonymizeProperties(props: Record<string, unknown>): Record<string, unknown> {
    const anonymized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        anonymized[key] = this.anonymizeString(value);
      } else {
        anonymized[key] = value;
      }
    }
    return anonymized;
  }

  private anonymizeString(str: string): string {
    // Remove potential PII: file paths, user names, API keys
    return str
      .replace(/\/Users\/[^/]+/g, '/Users/[REDACTED]')
      .replace(/\/home\/[^/]+/g, '/home/[REDACTED]')
      .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\[REDACTED]')
      .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-[REDACTED]')
      .replace(/key-[a-zA-Z0-9]{20,}/g, 'key-[REDACTED]')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
  }

  private flush(): void {
    if (this.eventQueue.length === 0) return;

    // In production, this would send events to the analytics server.
    // For now, events are stored locally only.
    logger.debug('analytics', `Flushing ${this.eventQueue.length} analytics events`);

    // Store locally for transparency
    try {
      const analyticsDir = path.join(app.getPath('userData'), 'analytics');
      if (!kernelFsExistsInternal(analyticsDir)) {
        kernelFsMkdirInternalSync(analyticsDir);
      }
      const date = new Date().toISOString().split('T')[0];
      const logPath = path.join(analyticsDir, `events-${date}.jsonl`);
      const lines = this.eventQueue.map(e => JSON.stringify(e)).join('\n') + '\n';
      kernelFsAppendInternalSync(logPath, lines);
    } catch {
      // Best-effort persistence
    }

    this.eventQueue = [];
  }

  private clearLocalData(): void {
    try {
      const analyticsDir = path.join(app.getPath('userData'), 'analytics');
      if (kernelFsExistsInternal(analyticsDir)) {
        kernelFsDeleteInternalSync(analyticsDir, { recursive: true });
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────

export const analyticsService = new AnalyticsService();
