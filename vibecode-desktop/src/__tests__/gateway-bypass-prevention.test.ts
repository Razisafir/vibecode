// ─── VibeCode Desktop — ARC 16: Gateway Bypass Prevention Tests ────────────
// SELF-TEST SUITE (NON-NEGOTIABLE)
//
// These tests prove that bypassing the ExecutionGateway is IMPOSSIBLE.
// If ANY test passes (i.e., a bypass succeeds), the system FAILS ARC 16.
//
// Tests:
// 1. Direct fs.writeFile WITHOUT node → MUST fail
// 2. Direct child_process.exec WITHOUT node → MUST fail
// 3. Terminal command bypass WITHOUT node → MUST fail
// 4. Monaco save bypass WITHOUT node → MUST fail
// 5. ESM executor without node → MUST fail
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

// ─── Import the enforcement layer ─────────────────────────────────────────
import { checkFsAuthorization, checkTerminalAuthorization, reportMonacoBypass, reportExecBypass, clearViolations, configureAudit, getViolationCount, isAuditClean } from '../../main/core/execution-audit';
import { ExecutionGateway } from '../../main/core/execution-gateway';
import { kernelFsWrite, kernelFsDelete, kernelFsMkdir } from '../../main/core/kernel-fs';

// ─── Test workspace setup ────────────────────────────────────────────────

const TEST_WORKSPACE = path.join(os.tmpdir(), `vibecode-arc16-test-${Date.now()}`);

beforeEach(() => {
  // Create test workspace
  fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
  // Clear any violations from previous tests
  clearViolations();
});

afterEach(() => {
  // Clean up test workspace
  try {
    fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  } catch {
    // Cleanup failed — not critical for tests
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Direct fs.writeFile WITHOUT ExecutionNode → MUST fail
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Direct fs.writeFile bypass prevention', () => {
  it('MUST block fs:writeFile IPC when no gateway authorization exists', () => {
    const testFile = path.join(TEST_WORKSPACE, 'bypass-test.txt');

    // Call checkFsAuthorization WITHOUT calling authorizeFsOp first
    // This simulates a renderer calling fs:writeFile directly
    const authorized = checkFsAuthorization(testFile, 'write');

    // MUST be blocked (return false)
    expect(authorized).toBe(false);
  });

  it('MUST record a violation when fs:writeFile bypass is attempted', () => {
    const testFile = path.join(TEST_WORKSPACE, 'bypass-test.txt');

    // This will throw because recordViolation now throws in ARC 16
    try {
      checkFsAuthorization(testFile, 'write');
    } catch {
      // Expected — ARC 16 hard enforcement throws on violation
    }

    // There MUST be violations recorded
    expect(getViolationCount()).toBeGreaterThan(0);
    expect(isAuditClean()).toBe(false);
  });

  it('MUST allow fs:writeFile when properly authorized through gateway', async () => {
    const testFile = path.join(TEST_WORKSPACE, 'authorized-test.txt');

    // Clear violations from previous test
    clearViolations();

    // Properly authorize through the audit system (simulating gateway flow)
    const { authorizeFsOp } = await import('../../main/core/execution-audit');
    authorizeFsOp(testFile, 'test-node-id-123', 'write');

    // Now check authorization — MUST pass
    const authorized = checkFsAuthorization(testFile, 'write');
    expect(authorized).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Direct child_process.exec WITHOUT ExecutionNode → MUST fail
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Direct child_process.exec bypass prevention', () => {
  it('MUST block terminal commands when no gateway authorization exists', () => {
    // Call checkTerminalAuthorization WITHOUT authorizeTerminalOp first
    const authorized = checkTerminalAuthorization('test-session', 'rm -rf /');

    // MUST be blocked
    expect(authorized).toBe(false);
  });

  it('MUST record a violation when terminal bypass is attempted', () => {
    try {
      checkTerminalAuthorization('test-session', 'ls -la');
    } catch {
      // Expected — hard enforcement throws
    }

    expect(getViolationCount()).toBeGreaterThan(0);
    expect(isAuditClean()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Terminal command bypass WITHOUT node → MUST fail
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Terminal command bypass prevention', () => {
  it('MUST block terminal session creation when gateway is not initialized', () => {
    // Gateway is not initialized in test environment
    expect(ExecutionGateway.isInitialized()).toBe(false);

    // Any terminal auth check MUST fail when gateway is not initialized
    // (ARC 16 removed the "gateway not initialized = allow" escape hatch)
    const authorized = checkTerminalAuthorization('new-session', 'echo hello');
    expect(authorized).toBe(false);
  });

  it('MUST allow terminal commands when properly authorized', async () => {
    clearViolations();

    const { authorizeTerminalOp } = await import('../../main/core/execution-audit');
    authorizeTerminalOp('test-session', 'test-node-id-456', 'echo hello');

    const authorized = checkTerminalAuthorization('test-session', 'echo hello');
    expect(authorized).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Monaco save bypass WITHOUT node → MUST fail
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Monaco save bypass prevention', () => {
  it('MUST record a critical violation when Monaco save bypasses gateway', () => {
    clearViolations();

    try {
      reportMonacoBypass('/workspace/src/index.ts');
    } catch {
      // Expected — hard enforcement throws
    }

    // Monaco bypass MUST be recorded as a violation
    expect(getViolationCount()).toBeGreaterThan(0);
    expect(isAuditClean()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: ESM executor without node → MUST fail
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Kernel FS layer enforcement', () => {
  it('MUST throw when kernelFsWrite is called without nodeId', async () => {
    const testFile = path.join(TEST_WORKSPACE, 'kernel-test.txt');

    // kernelFsWrite REQUIRES a nodeId — calling without one MUST throw
    await expect(
      kernelFsWrite({
        nodeId: undefined as any,
        filePath: testFile,
        content: 'should not be written',
      })
    ).rejects.toThrow(/HARD ASSERTION FAILED/);
  });

  it('MUST throw when kernelFsDelete is called without nodeId', async () => {
    const testFile = path.join(TEST_WORKSPACE, 'kernel-delete-test.txt');
    fs.writeFileSync(testFile, 'test content');

    await expect(
      kernelFsDelete({
        nodeId: undefined as any,
        filePath: testFile,
      })
    ).rejects.toThrow(/HARD ASSERTION FAILED/);
  });

  it('MUST throw when kernelFsMkdir is called without nodeId', async () => {
    const testDir = path.join(TEST_WORKSPACE, 'kernel-mkdir-test');

    await expect(
      kernelFsMkdir({
        nodeId: undefined as any,
        dirPath: testDir,
      })
    ).rejects.toThrow(/HARD ASSERTION FAILED/);
  });

  it('MUST throw when empty nodeId is provided', async () => {
    const testFile = path.join(TEST_WORKSPACE, 'empty-nodeid-test.txt');

    await expect(
      kernelFsWrite({
        nodeId: '',
        filePath: testFile,
        content: 'should not be written',
      })
    ).rejects.toThrow(/HARD ASSERTION FAILED/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Audit system cannot be disabled
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Audit system immutability', () => {
  it('MUST NOT allow the audit system to be disabled', () => {
    clearViolations();

    // Attempting to disable the audit MUST fail
    try {
      configureAudit({ active: false });
    } catch {
      // Expected — it throws because recordViolation throws
    }

    // The audit must still be active — verify by checking that violations
    // are still detected
    try {
      checkFsAuthorization('/test/bypass.txt', 'write');
    } catch {
      // Expected
    }

    // Violations must be recorded — audit is still active
    expect(getViolationCount()).toBeGreaterThan(0);
  });

  it('MUST allow production mode configuration', () => {
    clearViolations();

    // Setting production mode MUST be allowed
    expect(() => configureAudit({ productionMode: true })).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: fs:mkdir MUST be gateway-enforced
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — fs:mkdir gateway enforcement', () => {
  it('MUST block mkdir when no gateway authorization exists', () => {
    clearViolations();

    const testDir = path.join(TEST_WORKSPACE, 'unauthorized-dir');

    // fs:mkdir now checks gateway authorization (ARC 16 fix)
    const authorized = checkFsAuthorization(testDir, 'mkdir');
    expect(authorized).toBe(false);
  });

  it('MUST allow mkdir when properly authorized', async () => {
    clearViolations();

    const testDir = path.join(TEST_WORKSPACE, 'authorized-dir');
    const { authorizeFsOp } = await import('../../main/core/execution-audit');
    authorizeFsOp(testDir, 'test-mkdir-node-789', 'mkdir');

    const authorized = checkFsAuthorization(testDir, 'mkdir');
    expect(authorized).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Generic bypass detection
// ═══════════════════════════════════════════════════════════════════════════════

describe('ARC 16 — Generic bypass detection', () => {
  it('MUST record violations for exec bypasses', () => {
    clearViolations();

    try {
      reportExecBypass('/usr/bin/something', 'Direct exec without gateway');
    } catch {
      // Expected — hard enforcement
    }

    expect(getViolationCount()).toBeGreaterThan(0);
    expect(isAuditClean()).toBe(false);
  });
});
