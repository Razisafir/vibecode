// ============================================================
// VibeCode Desktop — Runtime Safety Guard
// Risk scoring, destructive operation detection, blocking rules
// ============================================================

import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface SafetyAssessment {
  /** Overall risk level for the operation */
  riskLevel: RiskLevel;
  /** Numeric risk score (0–100) */
  riskScore: number;
  /** Whether the operation is outright blocked */
  blocked: boolean;
  /** Reason for blocking, if blocked */
  blockReason?: string;
  /** Whether user confirmation is required before execution */
  requiresConfirmation: boolean;
  /** Human-readable warning messages */
  warnings: string[];
  /** The specific rules that matched */
  matchedRules: string[];
}

export interface CommandSafetyContext {
  command: string;
  cwd: string;
  workspaceRoot: string;
}

export interface FileMutationSafetyContext {
  filePath: string;
  operation: 'create' | 'write' | 'edit' | 'delete' | 'rename';
  workspaceRoot: string;
}

// ─── Dangerous Command Patterns ─────────────────────────────────────────────

interface DangerousPattern {
  id: string;
  pattern: RegExp;
  riskLevel: RiskLevel;
  riskScore: number;
  description: string;
  blockByDefault: boolean;
  requiresConfirmation: boolean;
}

const DANGEROUS_COMMAND_PATTERNS: DangerousPattern[] = [
  // Critical: System destruction
  {
    id: 'rm-rf-root',
    pattern: /\brm\s+(-\w*f\w*\s+|.*--force\s+)(\/|~|\/home|\/etc|\/usr|\/var|\/boot|\/sbin|\/bin|C:\\)/,
    riskLevel: 'critical',
    riskScore: 100,
    description: 'Recursive force delete of system directory',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'rm-rf-any',
    pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--force\s+)/,
    riskLevel: 'high',
    riskScore: 80,
    description: 'Recursive force delete',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'npm-publish',
    pattern: /\bnpm\s+publish\b/,
    riskLevel: 'high',
    riskScore: 75,
    description: 'Publishing to npm registry',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'git-force-push',
    pattern: /\bgit\s+push\s+.*(--force|-f)\b/,
    riskLevel: 'high',
    riskScore: 75,
    description: 'Force push to git remote',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'git-reset-hard',
    pattern: /\bgit\s+reset\s+.*--hard\b/,
    riskLevel: 'high',
    riskScore: 70,
    description: 'Hard git reset (loses uncommitted changes)',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  // High: System-level commands
  {
    id: 'sudo',
    pattern: /\bsudo\s+/,
    riskLevel: 'high',
    riskScore: 65,
    description: 'Elevated privilege execution',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'chmod-777',
    pattern: /\bchmod\s+(777|-R\s+)/,
    riskLevel: 'high',
    riskScore: 60,
    description: 'Overly permissive file permissions or recursive chmod',
    blockByDefault: false,
    requiresConfirmation: true,
  },
  {
    id: 'curl-pipe-sh',
    pattern: /\bcurl\s+.*\|\s*(ba)?sh\b/,
    riskLevel: 'critical',
    riskScore: 95,
    description: 'Piping remote content to shell (arbitrary code execution)',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'wget-pipe-sh',
    pattern: /\bwget\s+.*\|\s*(ba)?sh\b/,
    riskLevel: 'critical',
    riskScore: 95,
    description: 'Piping remote content to shell (arbitrary code execution)',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  // High: Database destruction
  {
    id: 'sql-drop',
    pattern: /\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE?)\b/i,
    riskLevel: 'high',
    riskScore: 80,
    description: 'Destructive SQL operation',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  {
    id: 'sql-delete-no-where',
    pattern: /\bDELETE\s+FROM\s+\w+\s*;/i,
    riskLevel: 'high',
    riskScore: 75,
    description: 'DELETE without WHERE clause',
    blockByDefault: true,
    requiresConfirmation: true,
  },
  // Medium: Potentially dangerous
  {
    id: 'pip-uninstall',
    pattern: /\bpip\s+uninstall\b/,
    riskLevel: 'medium',
    riskScore: 40,
    description: 'Uninstalling Python package',
    blockByDefault: false,
    requiresConfirmation: true,
  },
  {
    id: 'docker-rm',
    pattern: /\bdocker\s+(rm|rmi)\b/,
    riskLevel: 'medium',
    riskScore: 35,
    description: 'Removing Docker container/image',
    blockByDefault: false,
    requiresConfirmation: true,
  },
  {
    id: 'kill-process',
    pattern: /\bkill\s+(-9\s+|-KILL\s+)/,
    riskLevel: 'medium',
    riskScore: 30,
    description: 'Force-killing a process',
    blockByDefault: false,
    requiresConfirmation: false,
  },
];

// ─── Blocked path patterns for file mutations ───────────────────────────────

const BLOCKED_MUTATION_PATHS = [
  // System directories
  { pattern: /^\/etc\//, reason: 'System configuration directory' },
  { pattern: /^\/usr\//, reason: 'System programs directory' },
  { pattern: /^\/bin\//, reason: 'System binaries directory' },
  { pattern: /^\/sbin\//, reason: 'System binaries directory' },
  { pattern: /^\/boot\//, reason: 'Boot directory' },
  { pattern: /^\/var\//, reason: 'System variable data directory' },
  { pattern: /^\/dev\//, reason: 'Device directory' },
  { pattern: /^\/proc\//, reason: 'Process filesystem' },
  { pattern: /^\/sys\//, reason: 'System filesystem' },
  // Windows
  { pattern: /^[A-Z]:\\Windows\\/i, reason: 'Windows system directory' },
  { pattern: /^[A-Z]:\\Program Files\\/i, reason: 'Program Files directory' },
  // Credentials
  { pattern: /\.ssh\//, reason: 'SSH credentials directory' },
  { pattern: /\.gnupg\//, reason: 'GPG keys directory' },
  { pattern: /\.aws\//, reason: 'AWS credentials directory' },
  { pattern: /\.kube\//, reason: 'Kubernetes config directory' },
  { pattern: /\.env$/, reason: 'Environment secrets file' },
  { pattern: /\.npmrc$/, reason: 'NPM credentials file' },
  { pattern: /\.pypirc$/, reason: 'Python package credentials' },
  { pattern: /\.netrc$/, reason: 'Network credentials file' },
];

// ─── SafetyGuard Class ──────────────────────────────────────────────────────

export class SafetyGuard {
  private workspaceRoot: string;
  private blockDangerousCommands: boolean;
  private blockExternalMutations: boolean;
  private confirmationThreshold: RiskLevel;

  constructor(
    workspaceRoot: string,
    options?: {
      blockDangerousCommands?: boolean;
      blockExternalMutations?: boolean;
      confirmationThreshold?: RiskLevel;
    },
  ) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.blockDangerousCommands = options?.blockDangerousCommands ?? true;
    this.blockExternalMutations = options?.blockExternalMutations ?? true;
    this.confirmationThreshold = options?.confirmationThreshold ?? 'medium';
  }

  // ─── Command Safety ──────────────────────────────────────────────────────

  assessCommandSafety(ctx: CommandSafetyContext): SafetyAssessment {
    const warnings: string[] = [];
    const matchedRules: string[] = [];
    let maxRiskScore = 0;
    let maxRiskLevel: RiskLevel = 'none';
    let blocked = false;
    let blockReason: string | undefined;

    // Check against all dangerous patterns
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.pattern.test(ctx.command)) {
        matchedRules.push(pattern.id);
        warnings.push(pattern.description);

        if (pattern.riskScore > maxRiskScore) {
          maxRiskScore = pattern.riskScore;
          maxRiskLevel = pattern.riskLevel;
        }

        if (pattern.blockByDefault && this.blockDangerousCommands) {
          blocked = true;
          blockReason = `Blocked by safety rule "${pattern.id}": ${pattern.description}`;
        }
      }
    }

    // Check path traversal in command arguments
    if (this.containsPathTraversal(ctx.command)) {
      matchedRules.push('path-traversal-in-command');
      warnings.push('Command contains path traversal patterns');
      maxRiskScore = Math.max(maxRiskScore, 70);
      maxRiskLevel = this.higherRisk(maxRiskLevel, 'high');
      if (this.blockDangerousCommands) {
        blocked = true;
        blockReason = 'Command contains path traversal patterns';
      }
    }

    const requiresConfirmation =
      maxRiskLevel !== 'none' &&
      this.riskMeetsThreshold(maxRiskLevel, this.confirmationThreshold);

    return {
      riskLevel: maxRiskLevel || 'low',
      riskScore: maxRiskScore || 5,
      blocked,
      blockReason,
      requiresConfirmation,
      warnings,
      matchedRules,
    };
  }

  // ─── File Mutation Safety ────────────────────────────────────────────────

  assessFileMutationSafety(ctx: FileMutationSafetyContext): SafetyAssessment {
    const warnings: string[] = [];
    const matchedRules: string[] = [];
    let riskScore = 0;
    let riskLevel: RiskLevel = 'low';
    let blocked = false;
    let blockReason: string | undefined;

    const resolvedPath = path.resolve(ctx.filePath);
    const relativeToWorkspace = path.relative(this.workspaceRoot, resolvedPath);

    // Check if path is outside workspace
    if (relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
      matchedRules.push('mutation-outside-workspace');
      warnings.push(`File mutation outside workspace: ${resolvedPath}`);
      riskScore = 60;
      riskLevel = 'high';

      if (this.blockExternalMutations) {
        blocked = true;
        blockReason = `File mutation outside workspace root is blocked: ${resolvedPath}`;
      }
    }

    // Check against blocked mutation paths
    for (const blockedPath of BLOCKED_MUTATION_PATHS) {
      if (blockedPath.pattern.test(resolvedPath)) {
        matchedRules.push(`blocked-mutation-path:${blockedPath.reason}`);
        warnings.push(`Blocked path: ${blockedPath.reason}`);
        riskScore = Math.max(riskScore, 90);
        riskLevel = this.higherRisk(riskLevel, 'critical');
        blocked = true;
        blockReason = `File mutation blocked: ${blockedPath.reason}`;
        break;
      }
    }

    // Check for path traversal
    if (this.containsPathTraversal(ctx.filePath)) {
      matchedRules.push('path-traversal-in-file');
      warnings.push('File path contains traversal patterns');
      riskScore = Math.max(riskScore, 80);
      riskLevel = this.higherRisk(riskLevel, 'high');
      blocked = true;
      blockReason = 'File path contains path traversal patterns';
    }

    // Delete operations are inherently riskier
    if (ctx.operation === 'delete') {
      riskScore = Math.max(riskScore, 40);
      riskLevel = this.higherRisk(riskLevel, 'medium');
      warnings.push('File deletion is a destructive operation');
      matchedRules.push('destructive-delete');
    }

    // Overwrite existing file
    if (ctx.operation === 'write' || ctx.operation === 'edit') {
      riskScore = Math.max(riskScore, 10);
      if (!matchedRules.includes('mutation-outside-workspace')) {
        // In-workspace edits are low risk but worth noting
        warnings.push('File will be modified');
      }
    }

    const requiresConfirmation =
      riskLevel !== 'none' &&
      this.riskMeetsThreshold(riskLevel, this.confirmationThreshold);

    return {
      riskLevel,
      riskScore,
      blocked,
      blockReason,
      requiresConfirmation,
      warnings,
      matchedRules,
    };
  }

  // ─── General Safety Check ────────────────────────────────────────────────

  isCommandBlocked(command: string, workspaceRoot: string): boolean {
    return this.assessCommandSafety({ command, cwd: workspaceRoot, workspaceRoot }).blocked;
  }

  isFileMutationBlocked(filePath: string, operation: FileMutationSafetyContext['operation'], workspaceRoot: string): boolean {
    return this.assessFileMutationSafety({ filePath, operation, workspaceRoot }).blocked;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private containsPathTraversal(input: string): boolean {
    // Check for directory traversal patterns
    const traversalPatterns = [
      /\.\.\//,
      /\.\.\\"/,
      /\.\.\//,
      /%2e%2e%2f/i,
      /%2e%2e\//i,
      /\.\.%5c/i,
      /\.\.%2f/i,
    ];
    return traversalPatterns.some((p) => p.test(input));
  }

  private higherRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
    const order: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(a) >= order.indexOf(b) ? a : b;
  }

  private riskMeetsThreshold(risk: RiskLevel, threshold: RiskLevel): boolean {
    const order: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(risk) >= order.indexOf(threshold);
  }
}
