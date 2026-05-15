// ============================================================
// VibeCode Desktop — Permission Validation
// Defines permission levels for operations and checks access
// ============================================================

import { logger } from './logger';
import { auditLog } from './audit-log';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// ─── Permission Definitions ──────────────────────────────────────────────────

/**
 * Permission levels for operations in VibeCode.
 *
 * - auto-approve: Always allowed without user interaction
 * - needs-approval: Requires explicit user approval
 * - denied: Always blocked
 */
interface PermissionRule {
  level: 'auto-approve' | 'needs-approval' | 'denied';
  description: string;
}

const PERMISSIONS: Record<string, PermissionRule> = {
  // File system permissions
  'fs.read': {
    level: 'auto-approve',
    description: 'File read access within workspace',
  },
  'fs.write': {
    level: 'needs-approval',
    description: 'File write access — auto-approved within workspace, requires approval outside',
  },
  'fs.delete': {
    level: 'needs-approval',
    description: 'File delete access — always requires approval',
  },

  // Command execution permissions
  'exec.safe': {
    level: 'auto-approve',
    description: 'Safe command execution (npm, node, git, etc.)',
  },
  'exec.unsafe': {
    level: 'needs-approval',
    description: 'Arbitrary command execution — requires approval',
  },

  // Provider management permissions
  'provider.manage': {
    level: 'auto-approve',
    description: 'Provider configuration changes',
  },

  // Session management permissions
  'session.manage': {
    level: 'auto-approve',
    description: 'Session management operations',
  },
};

// ─── Safe Commands ───────────────────────────────────────────────────────────

const SAFE_COMMAND_PREFIXES = [
  'npm', 'npx', 'node', 'git', 'yarn', 'pnpm', 'bun',
  'tsc', 'eslint', 'prettier', 'jest', 'vitest',
  'cargo', 'rustc', 'rustup',
  'go ', 'python', 'python3', 'pip', 'pip3',
  'ls', 'cat', 'head', 'tail', 'pwd', 'echo', 'which', 'whoami',
  'dir', 'type', 'cd',
  'curl', 'wget',
  'docker',
];

// ─── Context Keys ────────────────────────────────────────────────────────────

// These context keys help determine permission dynamically:
// - workspacePath: The workspace root path
// - targetPath: The path being accessed (for fs operations)
// - command: The command being executed (for exec operations)
// - withinWorkspace: Whether the target is inside the workspace

// ─── Permission Checker ──────────────────────────────────────────────────────

/**
 * Check whether an operation is permitted given the current context.
 *
 * @param operation - The permission operation (e.g. "fs.write", "exec.unsafe")
 * @param context   - Additional context about the operation
 * @returns Whether the operation is allowed, with optional reason
 */
export function checkPermission(
  operation: string,
  context: Record<string, unknown> = {}
): PermissionResult {
  const rule = PERMISSIONS[operation];

  if (!rule) {
    // Unknown permission — deny by default
    const reason = `Unknown permission: "${operation}"`;
    logger.warn('general', `Permission denied: ${reason}`);
    return { allowed: false, reason };
  }

  switch (rule.level) {
    case 'auto-approve':
      return checkAutoApprove(operation, context);

    case 'needs-approval':
      return checkNeedsApproval(operation, context);

    case 'denied':
      auditLog.auditLog('permission.denied', { operation, reason: 'Operation is always denied', context }, 'failure');
      return { allowed: false, reason: `Operation "${operation}" is always denied: ${rule.description}` };

    default:
      return { allowed: false, reason: `Unknown permission level for "${operation}"` };
  }
}

// ─── Auto-Approve Logic ──────────────────────────────────────────────────────

function checkAutoApprove(operation: string, context: Record<string, unknown>): PermissionResult {
  // fs.read is auto-approved within workspace
  if (operation === 'fs.read') {
    const withinWorkspace = context.withinWorkspace ?? true;
    if (!withinWorkspace) {
      return { allowed: false, reason: 'File read outside workspace requires approval' };
    }
    return { allowed: true };
  }

  // exec.safe — verify the command is actually safe
  if (operation === 'exec.safe') {
    const command = context.command as string | undefined;
    if (!command) {
      return { allowed: true }; // No command to check
    }

    const isSafe = SAFE_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix));
    if (!isSafe) {
      // Command doesn't match safe list — needs approval
      return {
        allowed: false,
        reason: `Command "${command.slice(0, 50)}" is not in the safe commands list`,
      };
    }
    return { allowed: true };
  }

  // provider.manage and session.manage — auto-approved
  return { allowed: true };
}

// ─── Needs-Approval Logic ────────────────────────────────────────────────────

function checkNeedsApproval(operation: string, context: Record<string, unknown>): PermissionResult {
  // fs.write — auto-approve within workspace, needs approval outside
  if (operation === 'fs.write') {
    const withinWorkspace = context.withinWorkspace ?? false;
    if (withinWorkspace) {
      return { allowed: true };
    }
    auditLog.auditLog('permission.needs_approval', { operation, reason: 'Write outside workspace', context });
    return { allowed: false, reason: 'Writing files outside the workspace requires approval' };
  }

  // fs.delete — always needs approval
  if (operation === 'fs.delete') {
    auditLog.auditLog('permission.needs_approval', { operation, reason: 'Delete always requires approval', targetPath: context.targetPath });
    return { allowed: false, reason: 'File deletion always requires explicit approval' };
  }

  // exec.unsafe — always needs approval
  if (operation === 'exec.unsafe') {
    auditLog.auditLog('permission.needs_approval', { operation, reason: 'Unsafe command requires approval', command: context.command });
    return { allowed: false, reason: 'Arbitrary command execution requires explicit approval' };
  }

  // Default: needs approval
  auditLog.auditLog('permission.needs_approval', { operation, context });
  return { allowed: false, reason: `Operation "${operation}" requires approval` };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine if a command is "safe" (well-known dev tool) or "unsafe" (arbitrary).
 */
export function classifyCommand(command: string): 'exec.safe' | 'exec.unsafe' {
  const isSafe = SAFE_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix));
  return isSafe ? 'exec.safe' : 'exec.unsafe';
}
