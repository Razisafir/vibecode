// ============================================================
// VibeCode Desktop — Audit Logging
// Logs security-relevant events to ~/.vibecode/audit.log
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  timestamp: number;
  event: string;
  userId: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AUDIT_DIR = path.join(os.homedir(), '.vibecode');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.log');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROTATED_FILES = 3;

// ─── AuditLogger ─────────────────────────────────────────────────────────────

class AuditLogger {
  private writeQueue: AuditEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;

  /**
   * Log a security-relevant event to the audit log.
   *
   * @param event   - Event name (e.g. "provider.api_key.changed")
   * @param details - Additional context about the event
   * @param result  - Whether the operation succeeded (default: 'success')
   */
  /** Alias for auditLog — convenience method used across services */
  log(event: string, details: Record<string, unknown>, result: 'success' | 'failure' = 'success'): void {
    this.auditLog(event, details, result);
  }

  auditLog(event: string, details: Record<string, unknown>, result: 'success' | 'failure' = 'success'): void {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      event,
      userId: 'default',
      details,
      result,
    };

    this.writeQueue.push(entry);
    this.scheduleFlush();
  }

  // ── Private ───────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush().catch((err) => {
        logger.error('general', 'Audit log flush failed', { error: String(err) });
      });
    }, 1000);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private async flush(): Promise<void> {
    if (this.isFlushing || this.writeQueue.length === 0) return;
    this.isFlushing = true;

    // Clear the timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Take all entries from the queue
    const entries = this.writeQueue.splice(0);
    if (entries.length === 0) {
      this.isFlushing = false;
      return;
    }

    try {
      // Ensure directory exists
      await fs.promises.mkdir(AUDIT_DIR, { recursive: true });

      // Rotate if needed
      await this.rotateIfNeeded();

      // Append entries as JSONL
      const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.promises.appendFile(AUDIT_FILE, lines, 'utf-8');
    } catch (err) {
      logger.error('general', 'Failed to write audit log entries', { error: String(err), count: entries.length });
    } finally {
      this.isFlushing = false;

      // If more entries accumulated during flush, schedule another
      if (this.writeQueue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.promises.stat(AUDIT_FILE).catch(() => null);
      if (!stat || stat.size < MAX_FILE_SIZE) return;

      // Rotate: audit.log → audit.log.1, audit.log.1 → audit.log.2, etc.
      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const currentPath = `${AUDIT_FILE}.${i}`;
        const nextPath = `${AUDIT_FILE}.${i + 1}`;

        if (fs.existsSync(currentPath)) {
          if (i === MAX_ROTATED_FILES - 1) {
            // Delete the oldest rotation
            await fs.promises.unlink(currentPath).catch(() => {});
          } else {
            await fs.promises.rename(currentPath, nextPath).catch(() => {});
          }
        }
      }

      // Move current file to .1
      await fs.promises.rename(AUDIT_FILE, `${AUDIT_FILE}.1`).catch(() => {});
    } catch (err) {
      logger.error('general', 'Audit log rotation failed', { error: String(err) });
    }
  }

  /** Force flush all pending entries (call on app quit) */
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const auditLog = new AuditLogger();
