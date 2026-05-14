// ============================================================
// VibeCode Desktop — Regression Protection System
// Snapshot baselines, golden flow definitions, behavior validation
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BehaviorBaseline {
  id: string;
  name: string;
  category: 'file_operation' | 'terminal_execution' | 'proposal_parsing' | 'execution_flow';
  description: string;
  createdAt: number;
  updatedAt: number;
  assertions: BaselineAssertion[];
}

export interface BaselineAssertion {
  field: string;
  operator: 'equals' | 'contains' | 'matches' | 'not_contains' | 'not_matches' | 'less_than' | 'greater_than';
  expected: unknown;
  description: string;
}

export interface RegressionTestResult {
  baselineId: string;
  passed: boolean;
  failures: RegressionFailure[];
  timestamp: number;
}

export interface RegressionFailure {
  assertion: BaselineAssertion;
  actual: unknown;
  message: string;
}

export interface GoldenFlowStep {
  action: string;
  type: 'file_write' | 'file_read' | 'command' | 'approval';
  params: Record<string, unknown>;
  expectedOutcome: {
    status: 'completed' | 'failed' | 'blocked';
    resultContains?: string;
    resultMatches?: string;
  };
}

export interface GoldenFlow {
  id: string;
  name: string;
  description: string;
  steps: GoldenFlowStep[];
}

// ─── Baseline Persistence ───────────────────────────────────────────────────

const BASELINE_DIR_NAME = '.vibecode/baselines';

function getBaselineDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(homeDir, BASELINE_DIR_NAME);
}

// ─── RegressionProtection Class ─────────────────────────────────────────────

export class RegressionProtection {
  private baselines: Map<string, BehaviorBaseline> = new Map();
  private goldenFlows: Map<string, GoldenFlow> = new Map();
  private recentResults: RegressionTestResult[] = [];

  constructor() {
    this.loadBaselines();
    this.initializeDefaultBaselines();
    this.initializeDefaultGoldenFlows();
  }

  // ─── Baseline Management ─────────────────────────────────────────────────

  addBaseline(baseline: BehaviorBaseline): void {
    this.baselines.set(baseline.id, baseline);
    this.persistBaseline(baseline);
  }

  getBaseline(id: string): BehaviorBaseline | undefined {
    return this.baselines.get(id);
  }

  getAllBaselines(): BehaviorBaseline[] {
    return Array.from(this.baselines.values());
  }

  // ─── Validation ──────────────────────────────────────────────────────────

  validateAgainstBaseline(
    baselineId: string,
    actualValues: Record<string, unknown>,
  ): RegressionTestResult {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      return {
        baselineId,
        passed: false,
        failures: [{
          assertion: { field: 'baseline', operator: 'equals', expected: 'exists', description: 'Baseline must exist' },
          actual: undefined,
          message: `Baseline "${baselineId}" not found`,
        }],
        timestamp: Date.now(),
      };
    }

    const failures: RegressionFailure[] = [];

    for (const assertion of baseline.assertions) {
      const actual = actualValues[assertion.field];
      const passed = this.evaluateAssertion(assertion, actual);

      if (!passed) {
        failures.push({
          assertion,
          actual,
          message: `Assertion failed: "${assertion.description}" — expected ${assertion.operator} ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(actual)}`,
        });
      }
    }

    const result: RegressionTestResult = {
      baselineId,
      passed: failures.length === 0,
      failures,
      timestamp: Date.now(),
    };

    this.recentResults.push(result);
    return result;
  }

  // ─── Golden Flows ────────────────────────────────────────────────────────

  getGoldenFlow(id: string): GoldenFlow | undefined {
    return this.goldenFlows.get(id);
  }

  getAllGoldenFlows(): GoldenFlow[] {
    return Array.from(this.goldenFlows.values());
  }

  // ─── Recent Results ──────────────────────────────────────────────────────

  getRecentResults(count?: number): RegressionTestResult[] {
    return this.recentResults.slice(-(count ?? 10));
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private evaluateAssertion(assertion: BaselineAssertion, actual: unknown): boolean {
    switch (assertion.operator) {
      case 'equals':
        return actual === assertion.expected;
      case 'contains':
        return typeof actual === 'string' && typeof assertion.expected === 'string' && actual.includes(assertion.expected);
      case 'matches':
        try {
          return typeof actual === 'string' && typeof assertion.expected === 'string' && new RegExp(assertion.expected).test(actual);
        } catch {
          return false;
        }
      case 'not_contains':
        return typeof actual === 'string' && typeof assertion.expected === 'string' && !actual.includes(assertion.expected);
      case 'not_matches':
        try {
          return typeof actual === 'string' && typeof assertion.expected === 'string' && !new RegExp(assertion.expected).test(actual);
        } catch {
          return true;
        }
      case 'less_than':
        return typeof actual === 'number' && typeof assertion.expected === 'number' && actual < assertion.expected;
      case 'greater_than':
        return typeof actual === 'number' && typeof assertion.expected === 'number' && actual > assertion.expected;
      default:
        return false;
    }
  }

  private initializeDefaultBaselines(): void {
    // File operation baseline
    if (!this.baselines.has('file-ops-safety')) {
      this.addBaseline({
        id: 'file-ops-safety',
        name: 'File Operation Safety Baseline',
        category: 'file_operation',
        description: 'Core safety assertions for file operations',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        assertions: [
          {
            field: 'pathWithinWorkspace',
            operator: 'equals',
            expected: true,
            description: 'File path must be within workspace',
          },
          {
            field: 'noPathTraversal',
            operator: 'equals',
            expected: true,
            description: 'File path must not contain traversal patterns',
          },
          {
            field: 'noBlockedExtension',
            operator: 'equals',
            expected: true,
            description: 'File must not have a blocked extension',
          },
        ],
      });
    }

    // Terminal execution baseline
    if (!this.baselines.has('terminal-exec-safety')) {
      this.addBaseline({
        id: 'terminal-exec-safety',
        name: 'Terminal Execution Safety Baseline',
        category: 'terminal_execution',
        description: 'Core safety assertions for terminal commands',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        assertions: [
          {
            field: 'noCriticalCommand',
            operator: 'equals',
            expected: true,
            description: 'Command must not match critical dangerous patterns',
          },
          {
            field: 'noSudo',
            operator: 'equals',
            expected: true,
            description: 'Command must not use sudo',
          },
          {
            field: 'noSystemPath',
            operator: 'equals',
            expected: true,
            description: 'Command must not target system paths',
          },
        ],
      });
    }

    // Proposal parsing baseline
    if (!this.baselines.has('proposal-parsing-safety')) {
      this.addBaseline({
        id: 'proposal-parsing-safety',
        name: 'Proposal Parsing Safety Baseline',
        category: 'proposal_parsing',
        description: 'Core safety assertions for parsed proposals',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        assertions: [
          {
            field: 'noDangerousCommand',
            operator: 'equals',
            expected: true,
            description: 'Parsed proposals must not contain dangerous commands',
          },
          {
            field: 'validFileOperations',
            operator: 'equals',
            expected: true,
            description: 'File operations in proposals must have valid paths',
          },
        ],
      });
    }
  }

  private initializeDefaultGoldenFlows(): void {
    // Golden flow: safe file write + read cycle
    this.goldenFlows.set('safe-file-cycle', {
      id: 'safe-file-cycle',
      name: 'Safe File Write/Read Cycle',
      description: 'Write a file, read it back, verify content matches',
      steps: [
        {
          action: 'Write test file',
          type: 'file_write',
          params: { filePath: '__test__/regression-test.txt', content: 'regression-test-content' },
          expectedOutcome: { status: 'completed', resultContains: 'bytesWritten' },
        },
        {
          action: 'Read test file',
          type: 'file_read',
          params: { filePath: '__test__/regression-test.txt' },
          expectedOutcome: { status: 'completed', resultContains: 'regression-test-content' },
        },
      ],
    });

    // Golden flow: safe command execution
    this.goldenFlows.set('safe-command-exec', {
      id: 'safe-command-exec',
      name: 'Safe Command Execution',
      description: 'Execute a safe command and verify output',
      steps: [
        {
          action: 'Run echo command',
          type: 'command',
          params: { command: 'echo regression-test' },
          expectedOutcome: { status: 'completed', resultContains: 'regression-test' },
        },
      ],
    });

    // Golden flow: dangerous command blocked
    this.goldenFlows.set('dangerous-command-blocked', {
      id: 'dangerous-command-blocked',
      name: 'Dangerous Command Blocked',
      description: 'Verify that dangerous commands are blocked by safety guard',
      steps: [
        {
          action: 'Attempt rm -rf /',
          type: 'command',
          params: { command: 'rm -rf /' },
          expectedOutcome: { status: 'blocked' },
        },
      ],
    });
  }

  private loadBaselines(): void {
    try {
      const dir = getBaselineDir();
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = fs.readFileSync(path.join(dir, file), 'utf-8');
          const baseline = JSON.parse(data) as BehaviorBaseline;
          this.baselines.set(baseline.id, baseline);
        } catch {
          // Skip corrupted baselines
        }
      }

      logger.info(`[RegressionProtection] Loaded ${this.baselines.size} baseline(s)`);
    } catch (err) {
      logger.error('[RegressionProtection] Failed to load baselines:', err);
    }
  }

  private persistBaseline(baseline: BehaviorBaseline): void {
    try {
      const dir = getBaselineDir();
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${baseline.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf-8');
    } catch (err) {
      logger.error('[RegressionProtection] Failed to persist baseline:', err);
    }
  }
}
