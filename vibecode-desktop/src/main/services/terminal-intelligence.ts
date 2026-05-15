// ─── VibeCode Desktop — Terminal Intelligence Layer ───────────────────────────
// ARC 20 P0-4: AI-aware terminal execution environment
//
// Upgrades the terminal from "tracked shell" to:
//   - Command summarization
//   - Failure diagnosis
//   - Automatic fix suggestions
//   - Execution intent detection
//   - Dangerous command intervention
//   - Contextual command recommendations
// ──────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** Intelligence analysis of a terminal command */
export interface CommandAnalysis {
  /** Original command */
  command: string;
  /** Human-readable summary */
  summary: string;
  /** Detected intent */
  intent: CommandIntent;
  /** Risk assessment */
  risk: 'safe' | 'caution' | 'dangerous' | 'destructive';
  /** Risk explanation */
  riskReason?: string;
  /** Suggested alternatives (if dangerous) */
  alternatives?: string[];
  /** Related files (if applicable) */
  relatedFiles?: string[];
  /** Whether AI should intervene before execution */
  shouldIntervene: boolean;
  /** Intervention message */
  interventionMessage?: string;
}

/** Command intent types */
export type CommandIntent =
  | 'install'      // Installing dependencies
  | 'build'        // Building the project
  | 'test'         // Running tests
  | 'run'          // Running the application
  | 'deploy'       // Deploying
  | 'debug'        // Debugging
  | 'git'          // Git operations
  | 'explore'      // Exploring files/system
  | 'modify'       // Modifying files (sed, awk, etc.)
  | 'network'      // Network operations (curl, wget, etc.)
  | 'database'     // Database operations
  | 'docker'       // Docker operations
  | 'system'       // System administration
  | 'unknown';

/** Failure diagnosis */
export interface FailureDiagnosis {
  /** Original command */
  command: string;
  /** Exit code */
  exitCode: number;
  /** Captured stderr */
  stderr: string;
  /** Diagnosis category */
  category: FailureCategory;
  /** Human-readable diagnosis */
  diagnosis: string;
  /** Suggested fix */
  suggestedFix: string;
  /** Confidence level */
  confidence: number; // 0-1
  /** Whether the fix can be auto-applied */
  canAutoFix: boolean;
  /** Auto-fix command if applicable */
  autoFixCommand?: string;
}

/** Failure category */
export type FailureCategory =
  | 'dependency_missing'   // Package/module not installed
  | 'syntax_error'         // Syntax error in code
  | 'type_error'           // TypeScript type error
  | 'permission_denied'    // Insufficient permissions
  | 'file_not_found'       // File or directory not found
  | 'network_error'        // Network connectivity issue
  | 'port_in_use'          // Port already in use
  | 'out_of_memory'        // Memory exhausted
  | 'test_failure'         // Test assertion failed
  | 'build_failure'        // Build compilation error
  | 'runtime_error'        // Runtime crash/exception
  | 'config_error'         // Misconfiguration
  | 'version_conflict'     // Version incompatibility
  | 'unknown';

/** Command recommendation based on context */
export interface CommandRecommendation {
  /** Recommended command */
  command: string;
  /** Why this is recommended */
  reason: string;
  /** Category */
  category: 'next_step' | 'fix' | 'improvement' | 'workflow';
  /** Confidence */
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERMINAL INTELLIGENCE SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class TerminalIntelligenceService extends EventEmitter {
  /** Command history for context-aware recommendations */
  private commandHistory: Array<{
    command: string;
    timestamp: number;
    intent: CommandIntent;
    exitCode: number | null;
  }> = [];

  private readonly MAX_HISTORY = 100;

  constructor() {
    super();
    this.setMaxListeners(30);
  }

  // ─── Pre-Execution Analysis ────────────────────────────────────────────

  /** Analyze a command BEFORE execution — for risk assessment and intervention */
  analyzeCommand(command: string): CommandAnalysis {
    const trimmed = command.trim();
    const intent = this.detectIntent(trimmed);
    const risk = this.assessRisk(trimmed, intent);

    const analysis: CommandAnalysis = {
      command: trimmed,
      summary: this.summarizeCommand(trimmed, intent),
      intent,
      risk: risk.level,
      riskReason: risk.reason,
      alternatives: risk.alternatives,
      relatedFiles: this.extractRelatedFiles(trimmed),
      shouldIntervene: risk.level === 'destructive' || risk.level === 'dangerous',
      interventionMessage: risk.level === 'destructive'
        ? `This command is potentially destructive: ${risk.reason}. Are you sure?`
        : risk.level === 'dangerous'
          ? `Caution: ${risk.reason}`
          : undefined,
    };

    return analysis;
  }

  // ─── Post-Execution Diagnosis ──────────────────────────────────────────

  /** Diagnose a failed command AFTER execution */
  diagnoseFailure(command: string, exitCode: number, stderr: string, stdout: string): FailureDiagnosis {
    const category = this.classifyFailure(exitCode, stderr, stdout);
    const diagnosis = this.generateDiagnosis(command, exitCode, stderr, category);
    const suggestedFix = this.generateFix(command, category, stderr);
    const canAutoFix = this.canAutoFix(category, suggestedFix);

    const result: FailureDiagnosis = {
      command,
      exitCode,
      stderr: stderr.slice(-1000), // Keep last 1000 chars
      category,
      diagnosis,
      suggestedFix,
      confidence: this.computeDiagnosisConfidence(category, stderr),
      canAutoFix,
      autoFixCommand: canAutoFix ? this.generateAutoFixCommand(command, category, stderr) : undefined,
    };

    this.emit('failure:diagnosed', result);
    return result;
  }

  // ─── Command Recommendations ───────────────────────────────────────────

  /** Get contextual command recommendations based on recent activity */
  getRecommendations(context: {
    recentCommands?: string[];
    workspaceType?: string;
    recentErrors?: string[];
    activeFile?: string;
  }): CommandRecommendation[] {
    const recommendations: CommandRecommendation[] = [];

    // Based on recent command patterns
    const lastCmd = this.commandHistory[this.commandHistory.length - 1];
    if (lastCmd) {
      // After install → suggest build
      if (lastCmd.intent === 'install' && lastCmd.exitCode === 0) {
        recommendations.push({
          command: this.inferBuildCommand(),
          reason: 'Dependencies were just installed — building the project next',
          category: 'next_step',
          confidence: 0.85,
        });
      }

      // After build failure → suggest fix
      if (lastCmd.intent === 'build' && lastCmd.exitCode !== 0) {
        recommendations.push({
          command: 'Check build errors above for details',
          reason: 'Build failed — review error messages',
          category: 'fix',
          confidence: 0.9,
        });
      }

      // After test failure → suggest running specific test
      if (lastCmd.intent === 'test' && lastCmd.exitCode !== 0) {
        recommendations.push({
          command: 'Run the failing test in isolation for more detail',
          reason: 'Test suite failed — isolate the failing test',
          category: 'fix',
          confidence: 0.8,
        });
      }
    }

    // Based on workspace type
    if (context.workspaceType === 'node' || context.workspaceType === 'web') {
      if (this.commandHistory.filter(c => c.intent === 'install').length === 0) {
        recommendations.push({
          command: 'npm install',
          reason: 'Install project dependencies',
          category: 'workflow',
          confidence: 0.6,
        });
      }
    }

    // Based on recent errors
    if (context.recentErrors && context.recentErrors.length > 0) {
      const typeErrors = context.recentErrors.some(e => e.includes('type') || e.includes('Type'));
      if (typeErrors) {
        recommendations.push({
          command: 'npx tsc --noEmit',
          reason: 'Run TypeScript type checking to find all type errors',
          category: 'fix',
          confidence: 0.75,
        });
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /** Record a command execution for future context */
  recordCommand(command: string, exitCode: number | null): void {
    this.commandHistory.push({
      command,
      timestamp: Date.now(),
      intent: this.detectIntent(command),
      exitCode,
    });
    if (this.commandHistory.length > this.MAX_HISTORY) {
      this.commandHistory = this.commandHistory.slice(-this.MAX_HISTORY);
    }
  }

  // ─── Intent Detection ─────────────────────────────────────────────────

  private detectIntent(command: string): CommandIntent {
    const cmd = command.toLowerCase().trim();

    // Package management
    if (/\b(npm|yarn|pnpm|bun)\s+install\b/.test(cmd) ||
        /\bpip\s+install\b/.test(cmd) ||
        /\bcargo\s+add\b/.test(cmd) ||
        /\bgo\s+get\b/.test(cmd) ||
        /\bapt\b/.test(cmd) || /\bbrew\s+install\b/.test(cmd)) {
      return 'install';
    }

    // Build
    if (/\b(build|compile|bundle|webpack|vite|rollup|tsc|cargo\s+build|go\s+build|make)\b/.test(cmd)) {
      return 'build';
    }

    // Test
    if (/\b(test|spec|jest|vitest|pytest|mocha|cargo\s+test|go\s+test)\b/.test(cmd)) {
      return 'test';
    }

    // Run
    if (/\b(npm|yarn|pnpm|bun)\s+(start|run\s+dev|run\s+start|run\s+serve)\b/.test(cmd) ||
        /\bpython\s+\S+\.py\b/.test(cmd) ||
        /\bnode\s+\S+\.js\b/.test(cmd) ||
        /\bcargo\s+run\b/.test(cmd) || /\bgo\s+run\b/.test(cmd)) {
      return 'run';
    }

    // Deploy
    if (/\b(deploy|vercel|netlify|aws|gcloud|kubectl|helm)\b/.test(cmd)) {
      return 'deploy';
    }

    // Debug
    if (/\b(gdb|lldb|node\s+--inspect|debug|strace)\b/.test(cmd)) {
      return 'debug';
    }

    // Git
    if (/\bgit\s+/.test(cmd)) {
      return 'git';
    }

    // File modification
    if (/\b(sed|awk|perl\s+-pi|truncate|tee)\b/.test(cmd)) {
      return 'modify';
    }

    // Network
    if (/\b(curl|wget|ping|ssh|scp|rsync|nc|telnet)\b/.test(cmd)) {
      return 'network';
    }

    // Docker
    if (/\bdocker\s+/.test(cmd) || /\bdocker-compose\s+/.test(cmd)) {
      return 'docker';
    }

    // Database
    if (/\b(mysql|psql|sqlite|mongosh|redis-cli)\b/.test(cmd)) {
      return 'database';
    }

    // System
    if (/\b(sudo|systemctl|service|chmod|chown|kill|mount)\b/.test(cmd)) {
      return 'system';
    }

    // Explore
    if (/\b(ls|cat|head|tail|find|grep|rg|fd|tree|less|more|which|whereis)\b/.test(cmd)) {
      return 'explore';
    }

    return 'unknown';
  }

  // ─── Risk Assessment ───────────────────────────────────────────────────

  private assessRisk(command: string, intent: CommandIntent): {
    level: 'safe' | 'caution' | 'dangerous' | 'destructive';
    reason?: string;
    alternatives?: string[];
  } {
    const cmd = command.toLowerCase();

    // Destructive patterns — irreversible damage
    const destructive: Array<[RegExp, string, string?]> = [
      [/\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--force\s+)(\/|~|\.\.)/, 'Recursive force deletion of important directory', 'Use trash-cli instead of rm'],
      [/\bdd\s+if=.*of=\/dev\//, 'Direct disk write — can destroy data', undefined],
      [/\bmkfs\b/, 'Formatting a filesystem — erases all data', undefined],
      [/\b:()\{\s*:\s*\|\s*:&\s*\}/, 'Fork bomb — will crash the system', undefined],
      [/\bgit\s+push\s+.*--force\b/, 'Force push overwrites remote history', 'Use git push --force-with-lease instead'],
      [/\bgit\s+reset\s+.*--hard\b/, 'Hard reset discards all uncommitted changes', 'Use git stash before reset'],
      [/\bgit\s+clean\s+(-[a-zA-Z]*d[a-zA-Z]*\s+|--force)\b/, 'Removes untracked files permanently', 'Use git clean -n to preview first'],
      [/DROP\s+TABLE/i, 'Drops a database table permanently', undefined],
    ];

    for (const [pattern, reason, alt] of destructive) {
      if (pattern.test(cmd)) {
        return { level: 'destructive', reason, alternatives: alt ? [alt] : undefined };
      }
    }

    // Dangerous patterns — significant risk
    const dangerous: Array<[RegExp, string, string?]> = [
      [/\brm\s+-/, 'Recursive or forced file deletion', 'Use trash-cli for safe deletion'],
      [/\bsudo\s+/, 'Running with elevated privileges', 'Try without sudo first'],
      [/\bchmod\s+777/, 'Making files world-readable/writable', 'Use more restrictive permissions like 755 or 644'],
      [/\bcurl.*\|\s*(ba)?sh/, 'Piping remote content to shell — potential RCE', 'Download first, inspect, then run'],
      [/\bwget.*\|\s*(ba)?sh/, 'Piping remote content to shell — potential RCE', 'Download first, inspect, then run'],
      [/\bnpm\s+publish/, 'Publishing to npm registry — irreversible', 'Use --dry-run first'],
      [/\bdocker\s+(rm|rmi)/, 'Removing Docker containers/images', undefined],
      [/\bkill\s+-9/, 'Force killing a process', 'Try kill -TERM first'],
    ];

    for (const [pattern, reason, alt] of dangerous) {
      if (pattern.test(cmd)) {
        return { level: 'dangerous', reason, alternatives: alt ? [alt] : undefined };
      }
    }

    // Caution patterns — minor risk
    if (intent === 'system' || intent === 'modify') {
      return { level: 'caution', reason: 'This command modifies system state or files' };
    }

    if (/\b(npm|yarn|pnpm)\s+(uninstall|remove)\b/.test(cmd)) {
      return { level: 'caution', reason: 'Removing dependencies may break the project' };
    }

    return { level: 'safe' };
  }

  // ─── Command Summarization ─────────────────────────────────────────────

  private summarizeCommand(command: string, intent: CommandIntent): string {
    const intentLabels: Record<CommandIntent, string> = {
      install: 'Installing dependencies',
      build: 'Building the project',
      test: 'Running tests',
      run: 'Starting the application',
      deploy: 'Deploying',
      debug: 'Debugging',
      git: 'Git operation',
      explore: 'Exploring files',
      modify: 'Modifying files',
      network: 'Network operation',
      database: 'Database operation',
      docker: 'Docker operation',
      system: 'System administration',
      unknown: 'Running command',
    };

    return `${intentLabels[intent]}: ${command.slice(0, 60)}${command.length > 60 ? '...' : ''}`;
  }

  // ─── Related File Extraction ───────────────────────────────────────────

  private extractRelatedFiles(command: string): string[] {
    const files: string[] = [];
    // Extract file paths from command arguments
    const tokens = command.split(/\s+/);
    for (const token of tokens) {
      if (token.includes('/') || token.includes('.')) {
        // Looks like a file path
        if (/\.\w+$/.test(token) && !token.startsWith('-')) {
          files.push(token);
        }
      }
    }
    return files;
  }

  // ─── Failure Classification ────────────────────────────────────────────

  private classifyFailure(exitCode: number, stderr: string, stdout: string): FailureCategory {
    const combined = (stderr + stdout).toLowerCase();

    // Dependency issues
    if (combined.includes('cannot find module') || combined.includes('module not found') ||
        combined.includes('enoent') && combined.includes('node_modules') ||
        combined.includes('package not found') || combined.includes('no matching distribution')) {
      return 'dependency_missing';
    }

    // Syntax errors
    if (combined.includes('syntaxerror') || combined.includes('syntax error') ||
        combined.includes('unexpected token') || combined.includes('parse error')) {
      return 'syntax_error';
    }

    // Type errors
    if (combined.includes('typeerror') || combined.includes('type ') && combined.includes('is not assignable') ||
        combined.includes('ts') && combined.includes('error ts')) {
      return 'type_error';
    }

    // Permission denied
    if (combined.includes('eacces') || combined.includes('permission denied') ||
        combined.includes('access denied')) {
      return 'permission_denied';
    }

    // File not found
    if (combined.includes('enoent') || combined.includes('no such file') ||
        combined.includes('not found') && !combined.includes('module')) {
      return 'file_not_found';
    }

    // Network errors
    if (combined.includes('econnrefused') || combined.includes('enotfound') ||
        combined.includes('network') || combined.includes('timeout') && combined.includes('connect')) {
      return 'network_error';
    }

    // Port in use
    if (combined.includes('eaddrinuse') || combined.includes('port') && combined.includes('already in use')) {
      return 'port_in_use';
    }

    // Out of memory
    if (combined.includes('enomem') || combined.includes('out of memory') ||
        combined.includes('heap') && combined.includes('allocation failed')) {
      return 'out_of_memory';
    }

    // Test failure
    if (combined.includes('assertion') || combined.includes('expected') && combined.includes('received') ||
        combined.includes('test failed') || combined.includes('failures:')) {
      return 'test_failure';
    }

    // Build failure
    if (combined.includes('compilation error') || combined.includes('build failed') ||
        combined.includes('failed to compile')) {
      return 'build_failure';
    }

    // Version conflict
    if (combined.includes('version conflict') || combined.includes('peer dep') ||
        combined.includes('incompatible version')) {
      return 'version_conflict';
    }

    return 'unknown';
  }

  // ─── Diagnosis Generation ──────────────────────────────────────────────

  private generateDiagnosis(command: string, exitCode: number, stderr: string, category: FailureCategory): string {
    const categoryDescriptions: Record<FailureCategory, string> = {
      dependency_missing: 'A required dependency is missing or not installed.',
      syntax_error: 'There is a syntax error in the code being executed.',
      type_error: 'A TypeScript type error was found.',
      permission_denied: 'Insufficient permissions to perform this operation.',
      file_not_found: 'A required file or directory was not found.',
      network_error: 'A network connectivity issue occurred.',
      port_in_use: 'The requested port is already in use by another process.',
      out_of_memory: 'The process ran out of memory.',
      test_failure: 'One or more test assertions failed.',
      build_failure: 'The build process failed due to compilation errors.',
      runtime_error: 'A runtime error occurred during execution.',
      config_error: 'There is a configuration issue.',
      version_conflict: 'There is a version incompatibility between packages.',
      unknown: `The command failed with exit code ${exitCode}.`,
    };

    return categoryDescriptions[category];
  }

  private generateFix(command: string, category: FailureCategory, stderr: string): string {
    const fixSuggestions: Record<FailureCategory, string> = {
      dependency_missing: 'Install the missing dependency using your package manager.',
      syntax_error: 'Review the syntax error location and fix the code.',
      type_error: 'Review the TypeScript error and add proper type annotations or fix the type mismatch.',
      permission_denied: 'Check file/directory permissions or run with appropriate privileges.',
      file_not_found: 'Verify the file path is correct and the file exists.',
      network_error: 'Check your internet connection and try again.',
      port_in_use: 'Kill the process using the port or use a different port.',
      out_of_memory: 'Free up memory or increase available resources.',
      test_failure: 'Review the failing test assertion and fix the code or update the test.',
      build_failure: 'Fix the compilation errors listed in the build output.',
      runtime_error: 'Review the stack trace and fix the runtime error.',
      config_error: 'Check your configuration file for errors.',
      version_conflict: 'Resolve the version conflict by updating or downgrading packages.',
      unknown: 'Review the error output for more details.',
    };

    return fixSuggestions[category];
  }

  private canAutoFix(category: FailureCategory, suggestedFix: string): boolean {
    // Categories where auto-fix is possible
    return ['dependency_missing', 'port_in_use'].includes(category);
  }

  private generateAutoFixCommand(command: string, category: FailureCategory, stderr: string): string | undefined {
    switch (category) {
      case 'dependency_missing': {
        // Extract the missing module name
        const match = stderr.match(/cannot find module\s+['"]?([^'"\s]+)/i);
        if (match) {
          return `npm install ${match[1]}`;
        }
        return undefined;
      }
      case 'port_in_use': {
        const portMatch = stderr.match(/port\s+(\d+)\s+already/i);
        if (portMatch) {
          return `lsof -ti:${portMatch[1]} | xargs kill -9`;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private computeDiagnosisConfidence(category: FailureCategory, stderr: string): number {
    if (category === 'unknown') return 0.3;
    if (category === 'dependency_missing' || category === 'port_in_use') return 0.9;
    if (category === 'syntax_error' || category === 'type_error') return 0.85;
    if (category === 'permission_denied' || category === 'file_not_found') return 0.8;
    return 0.6;
  }

  private inferBuildCommand(): string {
    // Check recent history for package manager hints
    const recentInstalls = this.commandHistory.filter(c => c.intent === 'install');
    if (recentInstalls.length > 0) {
      const lastInstall = recentInstalls[recentInstalls.length - 1].command;
      if (lastInstall.includes('yarn')) return 'yarn build';
      if (lastInstall.includes('pnpm')) return 'pnpm build';
      if (lastInstall.includes('bun')) return 'bun run build';
    }
    return 'npm run build';
  }
}

// ─── Module-level singleton ──────────────────────────────────────────────────

let terminalIntelligence: TerminalIntelligenceService | null = null;

export function getTerminalIntelligence(): TerminalIntelligenceService {
  if (!terminalIntelligence) {
    terminalIntelligence = new TerminalIntelligenceService();
  }
  return terminalIntelligence;
}
