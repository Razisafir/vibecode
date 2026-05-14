// ============================================================
// VibeCode Desktop — Failure Knowledge Map
// Static diagnostic knowledge base for failure interpretation
// ============================================================
//
// This module defines the complete catalog of known failure
// patterns, their detection signals, severity, and recovery
// steps. It is a STATIC KNOWLEDGE FILE with zero runtime side
// effects.
//
// SAFETY: This module never executes anything. It only provides
// data structures that the status-provider uses to generate
// failure analysis. All recovery actions are SUGGESTIONS, not
// commands to be executed.
// ============================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type FailureCategory =
  | 'PROCESS_FAILURE'
  | 'PORT_CONFLICT'
  | 'HEALTH_SERVER_DOWN'
  | 'PM2_MISCONFIGURATION'
  | 'WATCHDOG_INSTABILITY'
  | 'SERVICE_DEGRADATION'
  | 'UNKNOWN_STATE';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RecommendedAction {
  /** The npm script or shell command to run */
  command: string;
  /** What this command does and why it helps */
  purpose: string;
  /** Risk level of executing this command */
  riskLevel: RiskLevel;
}

export interface FailurePattern {
  /** Unique category identifier */
  category: FailureCategory;
  /** Human-readable description of this failure type */
  description: string;
  /** Detection signals — which conditions in SystemStatus trigger this pattern */
  detectionSignals: string[];
  /** Default confidence level when this pattern is matched */
  defaultConfidence: Confidence;
  /** Likely root causes (best-effort, non-deterministic) */
  likelyCauses: string[];
  /** Recommended actions ordered by priority */
  recommendedActions: RecommendedAction[];
  /** Minimal safe recovery sequence — deterministic, non-destructive */
  safeRecoveryPath: string[];
}

// ─── Failure Knowledge Base ─────────────────────────────────────────────────

/**
 * Complete catalog of known failure patterns.
 *
 * Each pattern maps observable system signals to:
 *   - A failure category
 *   - Likely root causes (never claiming certainty)
 *   - Recommended next actions with risk levels
 *   - A deterministic safe recovery path
 */
export const FAILURE_PATTERNS: Record<FailureCategory, FailurePattern> = {
  PROCESS_FAILURE: {
    category: 'PROCESS_FAILURE',
    description: 'The Electron main process is not running or has crashed unexpectedly',
    detectionSignals: [
      'electronRunning === false in non-dev context',
      'pm2Process.status is "stopped" or "errored"',
      'Health endpoint was previously reachable but is now unreachable',
    ],
    defaultConfidence: 'HIGH',
    likelyCauses: [
      'Electron process crashed due to an unhandled exception',
      'The application ran out of memory and was killed by the OS',
      'A native module caused a segmentation fault',
      'The process was manually terminated by the user or system',
    ],
    recommendedActions: [
      {
        command: 'npm run preview:logs',
        purpose: 'Check PM2 logs for crash stack traces and error messages',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:restart',
        purpose: 'Restart the PM2 process to recover from the crash',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run status',
        purpose: 'Verify system health after restart',
        riskLevel: 'LOW',
      },
    ],
    safeRecoveryPath: [
      'npm run preview:stop',
      'npm run preview:start',
      'npm run status',
    ],
  },

  PORT_CONFLICT: {
    category: 'PORT_CONFLICT',
    description: 'Another process is using a port that VibeCode needs',
    detectionSignals: [
      'Vite dev server fails to bind to port 5173',
      'Health server fails to bind to port 9876',
      'EADDRINUSE error in logs',
    ],
    defaultConfidence: 'MEDIUM',
    likelyCauses: [
      'A previous VibeCode dev server did not shut down cleanly',
      'Another application is using port 5173 or 9876',
      'A zombie process from a prior session is still bound to the port',
      'Docker or another development tool is using the same port range',
    ],
    recommendedActions: [
      {
        command: 'lsof -i :5173  (or  lsof -i :9876)',
        purpose: 'Identify which process is holding the conflicting port',
        riskLevel: 'LOW',
      },
      {
        command: 'kill -9 <PID>',
        purpose: 'Terminate the conflicting process (replace <PID> with actual PID)',
        riskLevel: 'MEDIUM',
      },
      {
        command: 'npm run dev',
        purpose: 'Restart VibeCode dev mode after clearing the port',
        riskLevel: 'LOW',
      },
    ],
    safeRecoveryPath: [
      'npm run clean',
      'npm run dev',
    ],
  },

  HEALTH_SERVER_DOWN: {
    category: 'HEALTH_SERVER_DOWN',
    description: 'The health check HTTP server is expected but not responding',
    detectionSignals: [
      'mode === "preview" && health.endpointReachable === false',
      'Health server env var is set but no HTTP response received',
      'Curl to /api/health times out or returns connection refused',
    ],
    defaultConfidence: 'HIGH',
    likelyCauses: [
      'The Electron process has not finished starting up yet',
      'The health server failed to bind to the configured port',
      'The VIBECODE_HEALTH_PORT environment variable is misconfigured',
      'The app under PM2 has crashed and is in a restart loop',
      'A firewall rule is blocking local connections to the health port',
    ],
    recommendedActions: [
      {
        command: 'npm run preview:status',
        purpose: 'Check if PM2 reports the process as running or errored',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:logs',
        purpose: 'Check for startup errors or crash traces',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:restart',
        purpose: 'Restart the preview process to re-initialize the health server',
        riskLevel: 'LOW',
      },
    ],
    safeRecoveryPath: [
      'npm run preview:stop',
      'npm run preview:start',
      'npm run status',
    ],
  },

  PM2_MISCONFIGURATION: {
    category: 'PM2_MISCONFIGURATION',
    description: 'PM2 is expected to manage the process but is not active or misconfigured',
    detectionSignals: [
      'mode === "preview" && pm2Active === false',
      'PM2 process list does not contain vibecode-desktop',
      'pm2Process.status is "errored" or "stopped"',
    ],
    defaultConfidence: 'HIGH',
    likelyCauses: [
      'PM2 was not started correctly — preview:start may have failed partially',
      'PM2 process was manually deleted or crashed',
      'The ecosystem.config.js file has incorrect paths or environment settings',
      'The build step failed before PM2 could start the compiled output',
      'PM2 daemon itself has crashed and needs to be reinitialized',
    ],
    recommendedActions: [
      {
        command: 'npx pm2 list',
        purpose: 'Check all PM2 processes and their current status',
        riskLevel: 'LOW',
      },
      {
        command: 'npx pm2 logs vibecode-desktop',
        purpose: 'Check PM2 logs for startup or configuration errors',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:stop && npm run preview:start',
        purpose: 'Fully reset PM2 state and restart with correct configuration',
        riskLevel: 'LOW',
      },
      {
        command: 'npx pm2 kill',
        purpose: 'Kill the PM2 daemon entirely and start fresh (last resort)',
        riskLevel: 'MEDIUM',
      },
    ],
    safeRecoveryPath: [
      'npx pm2 kill',
      'npm run build',
      'npm run preview:start',
      'npm run status',
    ],
  },

  WATCHDOG_INSTABILITY: {
    category: 'WATCHDOG_INSTABILITY',
    description: 'The watchdog process is in an unstable state or triggering excessive restarts',
    detectionSignals: [
      'watchdogRunning && health.restartCount > 3',
      'Watchdog PID file exists but process is not running',
      'Watchdog restart budget is exhausted',
    ],
    defaultConfidence: 'MEDIUM',
    likelyCauses: [
      'The application is crash-looping and the watchdog keeps restarting it',
      'The watchdog process itself crashed or was killed',
      'The health endpoint is intermittently unavailable causing false-positive failures',
      'The restart budget has been exhausted and the watchdog is in cooldown',
    ],
    recommendedActions: [
      {
        command: 'npm run watchdog:status',
        purpose: 'Check current watchdog state and restart budget',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:logs',
        purpose: 'Check application logs for the root cause of repeated crashes',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run watchdog:stop',
        purpose: 'Temporarily disable the watchdog to stop the restart loop',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:stop && npm run preview:start',
        purpose: 'Full restart of the preview process after investigation',
        riskLevel: 'LOW',
      },
    ],
    safeRecoveryPath: [
      'npm run watchdog:stop',
      'npm run preview:stop',
      'npm run preview:start',
      'npm run watchdog:start',
      'npm run status',
    ],
  },

  SERVICE_DEGRADATION: {
    category: 'SERVICE_DEGRADATION',
    description: 'One or more internal services are reporting as unhealthy',
    detectionSignals: [
      'health.healthResponse.services contains false values',
      'health.ready === false while endpoint is reachable',
      'Non-critical services are failing',
    ],
    defaultConfidence: 'MEDIUM',
    likelyCauses: [
      'A service dependency failed to initialize on startup',
      'Memory store or session manager encountered a corruption issue',
      'The sandbox initialization failed due to a filesystem permission problem',
      'A transient failure that may resolve on its own after retry',
    ],
    recommendedActions: [
      {
        command: 'npm run health',
        purpose: 'Check detailed health response to identify which specific service is down',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run status:json',
        purpose: 'Get structured output showing exact service statuses',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:restart',
        purpose: 'Restart to re-initialize all services',
        riskLevel: 'LOW',
      },
    ],
    safeRecoveryPath: [
      'npm run preview:restart',
      'npm run status',
    ],
  },

  UNKNOWN_STATE: {
    category: 'UNKNOWN_STATE',
    description: 'The system is in an unexpected state that does not match any known failure pattern',
    detectionSignals: [
      'grade is YELLOW or RED but no specific pattern matches',
      'Contradictory signals (e.g., process running but health unreachable in dev mode)',
      'Mode detection returns "unknown"',
    ],
    defaultConfidence: 'LOW',
    likelyCauses: [
      'A new or uncommon failure mode not yet catalogued in the failure knowledge base',
      'Environment variables are set to conflicting values',
      'The system is in a transitional state between modes',
      'External factors (disk full, network issues, OS-level problems) are affecting the system',
    ],
    recommendedActions: [
      {
        command: 'npm run status:json',
        purpose: 'Get full structured output for detailed analysis',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run preview:logs',
        purpose: 'Check logs for any error messages or anomalies',
        riskLevel: 'LOW',
      },
      {
        command: 'npm run clean && npm run build',
        purpose: 'Clean build artifacts and rebuild from scratch',
        riskLevel: 'LOW',
      },
    ],
    safeRecoveryPath: [
      'npm run clean',
      'npm run build',
      'npm run dev',
    ],
  },
};

// ─── Helper: Get all categories ─────────────────────────────────────────────

/**
 * Returns all known failure category identifiers.
 * Useful for validation and iteration.
 */
export function getAllFailureCategories(): FailureCategory[] {
  return Object.keys(FAILURE_PATTERNS) as FailureCategory[];
}

// ─── Helper: Get pattern by category ────────────────────────────────────────

/**
 * Retrieve the failure pattern for a given category.
 * Returns UNKNOWN_STATE if the category is not found.
 */
export function getFailurePattern(category: FailureCategory): FailurePattern {
  return FAILURE_PATTERNS[category] ?? FAILURE_PATTERNS.UNKNOWN_STATE;
}
