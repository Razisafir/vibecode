// VibeCode System Supervision - Crash Recovery v8.0
// Handles service crash recovery with exponential backoff

import { EventEmitter } from 'events';
import type { FailureCategory } from '../kernel/types';

export interface RecoveryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  restartableCategories: FailureCategory[];
}

const DEFAULT_POLICY: RecoveryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  restartableCategories: ['NETWORK_ERROR', 'TIMEOUT', 'RESOURCE_EXHAUSTED', 'PM2_MISCONFIGURATION'],
};

interface RecoveryAttempt {
  serviceName: string;
  attempt: number;
  delay: number;
  timestamp: number;
  error?: string;
}

export class CrashRecovery extends EventEmitter {
  private policy: RecoveryPolicy;
  private attempts = new Map<string, number>();
  private recoveries = new Map<string, RecoveryAttempt[]>();
  private isRecovering = new Set<string>();

  constructor(policy: Partial<RecoveryPolicy> = {}) {
    super();
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  async attemptRecovery(
    serviceName: string,
    category: FailureCategory,
    restartFn: () => Promise<void>
  ): Promise<boolean> {
    if (this.isRecovering.has(serviceName)) {
      return false;
    }

    if (!this.policy.restartableCategories.includes(category)) {
      this.emit('recovery:non-restartable', { serviceName, category });
      return false;
    }

    const currentAttempt = (this.attempts.get(serviceName) || 0) + 1;
    if (currentAttempt > this.policy.maxAttempts) {
      this.emit('recovery:exhausted', { serviceName, attempts: currentAttempt });
      return false;
    }

    this.isRecovering.add(serviceName);
    this.attempts.set(serviceName, currentAttempt);

    const delay = this.calculateBackoff(currentAttempt);
    const attempt: RecoveryAttempt = {
      serviceName,
      attempt: currentAttempt,
      delay,
      timestamp: Date.now(),
    };

    if (!this.recoveries.has(serviceName)) {
      this.recoveries.set(serviceName, []);
    }
    this.recoveries.get(serviceName)!.push(attempt);

    this.emit('recovery:attempting', attempt);

    // Wait for backoff delay
    await this.sleep(delay);

    try {
      await restartFn();
      this.attempts.delete(serviceName);
      this.isRecovering.delete(serviceName);
      this.emit('recovery:succeeded', { serviceName, attempt: currentAttempt });
      return true;
    } catch (err) {
      attempt.error = String(err);
      this.isRecovering.delete(serviceName);
      this.emit('recovery:failed', { serviceName, attempt: currentAttempt, error: String(err) });
      return false;
    }
  }

  resetAttempts(serviceName: string): void {
    this.attempts.delete(serviceName);
    this.recoveries.delete(serviceName);
    this.isRecovering.delete(serviceName);
  }

  getAttemptCount(serviceName: string): number {
    return this.attempts.get(serviceName) || 0;
  }

  getRecoveryHistory(serviceName: string): RecoveryAttempt[] {
    return this.recoveries.get(serviceName) ?? [];
  }

  isServiceRecovering(serviceName: string): boolean {
    return this.isRecovering.has(serviceName);
  }

  getPolicy(): RecoveryPolicy {
    return { ...this.policy };
  }

  private calculateBackoff(attempt: number): number {
    const delay = this.policy.baseDelayMs * Math.pow(this.policy.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.policy.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
