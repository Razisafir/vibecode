// ============================================================
// VibeCode Desktop — Status Provider
// Read-only system introspection + failure intelligence module
// ============================================================
//
// Aggregates runtime state from all subsystems into a single
// structured snapshot, and when the system is degraded,
// provides failure analysis with root cause inference,
// recommended actions, and safe recovery paths.
//
// Used by:
//   - The /api/status HTTP endpoint (inside Electron)
//   - The CLI `npm run status` command (outside Electron)
//
// SAFETY: This module is strictly read-only. It has zero side
// effects, modifies no state, and never starts or stops anything.
// All recovery suggestions are RECOMMENDATIONS, not commands.
// ============================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type SystemHealthGrade = 'GREEN' | 'YELLOW' | 'RED';

export type RuntimeMode = 'dev' | 'preview' | 'production' | 'unknown';

export interface ProcessState {
  /** Is the Vite dev server expected to be running? */
  viteExpected: boolean;
  /** Is the Electron main process running? */
  electronRunning: boolean;
  /** Is PM2 managing the process? */
  pm2Active: boolean;
  /** PM2 process metadata (if active) */
  pm2Process?: {
    name: string;
    status: string;
    restarts: number;
    uptime: number;
    memory: number;
    pid: number;
  };
  /** Is the watchdog process running? */
  watchdogRunning: boolean;
  /** Watchdog PID (if running) */
  watchdogPid?: number;
}

export interface HealthLayer {
  /** Can the health endpoint be reached? */
  endpointReachable: boolean;
  /** Full health response (if reachable) */
  healthResponse?: {
    status: string;
    uptime: number;
    version: string;
    channel: string;
    services: Record<string, boolean>;
  };
  /** Readiness status */
  ready: boolean | null;
  /** Liveness status */
  alive: boolean | null;
  /** Process memory usage in bytes */
  memoryUsage?: number;
  /** PM2 restart count */
  restartCount: number;
}

export interface InfrastructureLayer {
  /** Is PM2 enabled in the current mode? */
  pm2Enabled: boolean;
  /** Is the watchdog enabled? */
  watchdogEnabled: boolean;
  /** Is the health server enabled? */
  healthServerEnabled: boolean;
  /** Is Caddy expected to be running? */
  caddyExpected: boolean;
}

export interface PortMapping {
  /** Vite dev server port */
  frontend: number | null;
  /** Backend/Electron port (N/A for desktop app) */
  backend: number | null;
  /** Health check HTTP port */
  health: number | null;
}

// ─── Failure Intelligence Types ─────────────────────────────────────────────

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

export interface FailureAnalysis {
  /** Failure category classification */
  category: FailureCategory;
  /** Confidence level of this diagnosis */
  confidence: Confidence;
  /** Likely root causes (best-effort, non-deterministic) */
  likelyCauses: string[];
  /** Recommended recovery actions ordered by priority */
  recommendedActions: RecommendedAction[];
  /** Minimal safe recovery sequence — deterministic, non-destructive */
  safeRecoveryPath: string[];
}

export interface SystemStatus {
  /** Timestamp of this status snapshot */
  timestamp: string;
  /** Detected runtime mode */
  mode: RuntimeMode;
  /** How the mode was determined */
  modeSource: string;
  /** Process state across all layers */
  processes: ProcessState;
  /** Health layer status */
  health: HealthLayer;
  /** Infrastructure layer flags */
  infrastructure: InfrastructureLayer;
  /** Port mapping */
  ports: PortMapping;
  /** Overall health grade */
  grade: SystemHealthGrade;
  /** Human-readable explanation of the grade */
  gradeReason: string[];
  /** Failure analysis (present only when grade is YELLOW or RED) */
  failure?: FailureAnalysis;
  /** Version string */
  version: string;
}

// ─── Mode Detection ─────────────────────────────────────────────────────────

/**
 * Detect the current runtime mode from environment variables and process state.
 *
 * Priority:
 *   1. VIBECODE_ENV (explicit override)
 *   2. NODE_ENV=production -> production
 *   3. PM2 managing the process -> preview
 *   4. Default -> dev
 */
export function detectMode(
  env?: Record<string, string | undefined>,
  pm2Active?: boolean,
): { mode: RuntimeMode; source: string } {
  const e = env ?? process.env as Record<string, string | undefined>;

  // Explicit override
  if (e.VIBECODE_ENV === 'prod' || e.VIBECODE_ENV === 'production') {
    return { mode: 'production', source: 'VIBECODE_ENV=production' };
  }
  if (e.VIBECODE_ENV === 'preview') {
    return { mode: 'preview', source: 'VIBECODE_ENV=preview' };
  }
  if (e.VIBECODE_ENV === 'dev' || e.VIBECODE_ENV === 'development') {
    return { mode: 'dev', source: 'VIBECODE_ENV=dev' };
  }

  // Node environment
  if (e.NODE_ENV === 'production') {
    return { mode: 'production', source: 'NODE_ENV=production' };
  }

  // PM2 detection
  if (pm2Active || e.pm_id !== undefined) {
    return { mode: 'preview', source: 'PM2 process detected (pm_id set)' };
  }

  // Health port set = preview intent
  if (e.VIBECODE_HEALTH_PORT) {
    return { mode: 'preview', source: 'VIBECODE_HEALTH_PORT set' };
  }

  // Dev flag
  if (e.VIBECODE_DEV === '1') {
    return { mode: 'dev', source: 'VIBECODE_DEV=1' };
  }

  // Default
  return { mode: 'dev', source: 'default (no mode indicators found)' };
}

// ─── Health Grading ─────────────────────────────────────────────────────────

/**
 * Grade the overall system health based on collected state.
 *
 * GREEN  — Everything is healthy and running as expected for the current mode.
 * YELLOW — Degraded: some optional components are down, or minor issues detected.
 * RED    — Critical: core components are failing or missing.
 */
export function gradeSystemHealth(
  mode: RuntimeMode,
  processes: ProcessState,
  health: HealthLayer,
  _infrastructure: InfrastructureLayer,
): { grade: SystemHealthGrade; reasons: string[] } {
  const reasons: string[] = [];

  // ─── RED conditions (critical failures) ────────────────────────────────

  // Preview mode without PM2 is critically broken
  if (mode === 'preview' && !processes.pm2Active) {
    return { grade: 'RED', reasons: ['Preview mode detected but PM2 is not managing the process'] };
  }

  // Preview mode with health endpoint down
  if (mode === 'preview' && !health.endpointReachable) {
    return { grade: 'RED', reasons: ['Preview mode detected but health endpoint is unreachable'] };
  }

  // Health endpoint reports unhealthy
  if (health.endpointReachable && health.healthResponse?.status === 'error') {
    return { grade: 'RED', reasons: ['Health endpoint reports error status'] };
  }

  // ─── YELLOW conditions (degraded) ──────────────────────────────────────

  // Watchdog should be running but isn't (preview mode)
  if (mode === 'preview' && !processes.watchdogRunning) {
    reasons.push('Watchdog is not running — process will not auto-recover from crashes');
  }

  // High restart count
  if (health.restartCount > 3) {
    reasons.push(`PM2 restart count is ${health.restartCount} (>3) — possible instability`);
  }

  // Health endpoint shows some services down
  if (health.healthResponse?.services) {
    const downServices = Object.entries(health.healthResponse.services)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (downServices.length > 0) {
      reasons.push(`Services down: ${downServices.join(', ')}`);
    }
  }

  // Dev mode with no Electron process (expected during startup, but worth noting)
  if (mode === 'dev' && !processes.electronRunning) {
    reasons.push('Electron process not detected — may be starting up or stopped');
  }

  // Health server expected but not responding on readiness
  if (health.endpointReachable && health.ready === false) {
    reasons.push('Health endpoint reachable but readiness check failed');
  }

  if (reasons.length > 0) {
    return { grade: 'YELLOW', reasons };
  }

  // ─── GREEN (all clear) ─────────────────────────────────────────────────

  return { grade: 'GREEN', reasons: ['All systems nominal'] };
}

// ─── Port Resolution ────────────────────────────────────────────────────────

export function resolvePorts(mode: RuntimeMode, env?: Record<string, string | undefined>): PortMapping {
  const e = env ?? process.env as Record<string, string | undefined>;

  return {
    frontend: mode === 'dev' ? (parseInt(e.VITE_PORT || '5173', 10) || 5173) : null,
    backend: null, // Electron desktop app — no separate backend port
    health: e.VIBECODE_HEALTH_PORT ? parseInt(e.VIBECODE_HEALTH_PORT, 10) : (mode === 'preview' ? 9876 : null),
  };
}

// ─── Infrastructure Detection ────────────────────────────────────────────────

export function detectInfrastructure(mode: RuntimeMode, env?: Record<string, string | undefined>): InfrastructureLayer {
  const e = env ?? process.env as Record<string, string | undefined>;

  return {
    pm2Enabled: mode === 'preview' || mode === 'production',
    watchdogEnabled: mode === 'preview' && !!e.VIBECODE_HEALTH_PORT,
    healthServerEnabled: !!e.VIBECODE_HEALTH_PORT,
    caddyExpected: false, // Caddy is never automatically expected; manual only
  };
}

// ─── Full Snapshot Builder ──────────────────────────────────────────────────

/**
 * Build a complete system status snapshot.
 * This is the primary entry point for both internal and CLI consumers.
 *
 * @param options - Override individual data sources for testing
 * @returns A fully populated SystemStatus object
 */
export function buildSystemStatus(options?: {
  env?: Record<string, string | undefined>;
  pm2Active?: boolean;
  pm2Process?: ProcessState['pm2Process'];
  electronRunning?: boolean;
  watchdogRunning?: boolean;
  watchdogPid?: number;
  healthEndpointReachable?: boolean;
  healthResponse?: HealthLayer['healthResponse'];
  ready?: boolean | null;
  alive?: boolean | null;
  memoryUsage?: number;
  restartCount?: number;
  version?: string;
}): SystemStatus {
  const env = options?.env ?? process.env as Record<string, string | undefined>;
  const pm2Active = options?.pm2Active ?? false;

  // Detect mode
  const { mode, source: modeSource } = detectMode(env, pm2Active);

  // Build process state
  const processes: ProcessState = {
    viteExpected: mode === 'dev',
    electronRunning: options?.electronRunning ?? false,
    pm2Active,
    pm2Process: options?.pm2Process,
    watchdogRunning: options?.watchdogRunning ?? false,
    watchdogPid: options?.watchdogPid,
  };

  // Build health layer
  const health: HealthLayer = {
    endpointReachable: options?.healthEndpointReachable ?? false,
    healthResponse: options?.healthResponse,
    ready: options?.ready ?? null,
    alive: options?.alive ?? null,
    memoryUsage: options?.memoryUsage,
    restartCount: options?.restartCount ?? (options?.pm2Process?.restarts ?? 0),
  };

  // Build infrastructure layer
  const infrastructure = detectInfrastructure(mode, env);

  // Build port mapping
  const ports = resolvePorts(mode, env);

  // Grade the system
  const { grade, reasons: gradeReason } = gradeSystemHealth(mode, processes, health, infrastructure);

  // Analyze failures if degraded
  const failure = grade !== 'GREEN' ? analyzeFailure(mode, processes, health, infrastructure, gradeReason) : undefined;

  return {
    timestamp: new Date().toISOString(),
    mode,
    modeSource,
    processes,
    health,
    infrastructure,
    ports,
    grade,
    gradeReason,
    failure,
    version: options?.version ?? env.npm_package_version ?? '0.1.0',
  };
}

// ─── Failure Intelligence ────────────────────────────────────────────────────

/**
 * Analyze system state to classify failures, infer root causes,
 * and generate recovery guidance.
 *
 * IMPORTANT: This function is strictly diagnostic. It MUST NOT
 * execute anything, modify any state, or take any action. It only
 * produces recommendations for the developer to follow manually.
 *
 * All language is conservative: "likely cause", "may indicate",
 * "possible" — never "cause" or "definitely".
 */
export function analyzeFailure(
  mode: RuntimeMode,
  processes: ProcessState,
  health: HealthLayer,
  _infrastructure: InfrastructureLayer,
  gradeReason: string[],
): FailureAnalysis {
  // ─── Pattern matching: classify the primary failure ─────────────────────

  // RED: Preview mode without PM2
  if (mode === 'preview' && !processes.pm2Active) {
    return {
      category: 'PM2_MISCONFIGURATION',
      confidence: 'HIGH',
      likelyCauses: [
        'PM2 was not started correctly — preview:start may have failed partially',
        'PM2 process was manually deleted or crashed',
        'The build step failed before PM2 could start the compiled output',
        'PM2 daemon itself has crashed and needs to be reinitialized',
      ],
      recommendedActions: [
        { command: 'npx pm2 list', purpose: 'Check all PM2 processes and their current status', riskLevel: 'LOW' },
        { command: 'npm run preview:stop && npm run preview:start', purpose: 'Fully reset PM2 state and restart with correct configuration', riskLevel: 'LOW' },
        { command: 'npm run status', purpose: 'Verify system health after restart', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run preview:stop', 'npm run preview:start', 'npm run status'],
    };
  }

  // RED: Preview mode with unreachable health endpoint
  if (mode === 'preview' && !health.endpointReachable) {
    return {
      category: 'HEALTH_SERVER_DOWN',
      confidence: 'HIGH',
      likelyCauses: [
        'The Electron process has not finished starting up yet',
        'The health server failed to bind to the configured port',
        'The app under PM2 has crashed and is in a restart loop',
        'A firewall rule may be blocking local connections to the health port',
      ],
      recommendedActions: [
        { command: 'npm run preview:status', purpose: 'Check if PM2 reports the process as running or errored', riskLevel: 'LOW' },
        { command: 'npm run preview:logs', purpose: 'Check for startup errors or crash traces', riskLevel: 'LOW' },
        { command: 'npm run preview:restart', purpose: 'Restart the preview process to re-initialize the health server', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run preview:stop', 'npm run preview:start', 'npm run status'],
    };
  }

  // RED: Health endpoint reports error status
  if (health.endpointReachable && health.healthResponse?.status === 'error') {
    return {
      category: 'PROCESS_FAILURE',
      confidence: 'HIGH',
      likelyCauses: [
        'Electron process crashed due to an unhandled exception',
        'The application ran out of memory and was killed by the OS',
        'A native module caused a segmentation fault',
      ],
      recommendedActions: [
        { command: 'npm run preview:logs', purpose: 'Check PM2 logs for crash stack traces and error messages', riskLevel: 'LOW' },
        { command: 'npm run preview:restart', purpose: 'Restart the PM2 process to recover from the crash', riskLevel: 'LOW' },
        { command: 'npm run status', purpose: 'Verify system health after restart', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run preview:stop', 'npm run preview:start', 'npm run status'],
    };
  }

  // ─── YELLOW: Multiple degraded conditions ──────────────────────────────

  // Watchdog instability: running but high restart count
  if (processes.watchdogRunning && health.restartCount > 3) {
    return {
      category: 'WATCHDOG_INSTABILITY',
      confidence: 'MEDIUM',
      likelyCauses: [
        'The application is crash-looping and the watchdog keeps restarting it',
        'The health endpoint is intermittently unavailable causing false-positive failures',
        'The restart budget may have been exhausted and the watchdog is in cooldown',
      ],
      recommendedActions: [
        { command: 'npm run watchdog:status', purpose: 'Check current watchdog state and restart budget', riskLevel: 'LOW' },
        { command: 'npm run preview:logs', purpose: 'Check application logs for the root cause of repeated crashes', riskLevel: 'LOW' },
        { command: 'npm run watchdog:stop', purpose: 'Temporarily disable the watchdog to stop the restart loop', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run watchdog:stop', 'npm run preview:stop', 'npm run preview:start', 'npm run watchdog:start', 'npm run status'],
    };
  }

  // High restart count without watchdog
  if (!processes.watchdogRunning && health.restartCount > 3) {
    return {
      category: 'PROCESS_FAILURE',
      confidence: 'MEDIUM',
      likelyCauses: [
        'The process has been crashing repeatedly (PM2 has restarted it multiple times)',
        'A persistent error is causing the app to fail on each startup attempt',
        'Memory corruption or resource exhaustion may be triggering the crashes',
      ],
      recommendedActions: [
        { command: 'npm run preview:logs', purpose: 'Check for crash stack traces and repeated error patterns', riskLevel: 'LOW' },
        { command: 'npm run preview:stop && npm run preview:start', purpose: 'Full restart to reset state and attempt clean recovery', riskLevel: 'LOW' },
        { command: 'npm run status', purpose: 'Verify system health after restart', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run preview:stop', 'npm run preview:start', 'npm run status'],
    };
  }

  // Service degradation: some services are down
  if (health.healthResponse?.services) {
    const downServices = Object.entries(health.healthResponse.services)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (downServices.length > 0) {
      return {
        category: 'SERVICE_DEGRADATION',
        confidence: 'MEDIUM',
        likelyCauses: [
          `The ${downServices.join(', ')} service(s) failed to initialize`,
          'A service dependency may have encountered a startup error',
          'Filesystem permissions or data corruption may be preventing service initialization',
        ],
        recommendedActions: [
          { command: 'npm run health', purpose: 'Check detailed health response to identify which service is down', riskLevel: 'LOW' },
          { command: 'npm run status:json', purpose: 'Get structured output showing exact service statuses', riskLevel: 'LOW' },
          { command: 'npm run preview:restart', purpose: 'Restart to re-initialize all services', riskLevel: 'LOW' },
        ],
        safeRecoveryPath: ['npm run preview:restart', 'npm run status'],
      };
    }
  }

  // Readiness check failed
  if (health.endpointReachable && health.ready === false) {
    return {
      category: 'SERVICE_DEGRADATION',
      confidence: 'MEDIUM',
      likelyCauses: [
        'One or more critical services have not finished initializing',
        'A readiness dependency check is failing',
        'The app may still be starting up — readiness probes can take a few seconds',
      ],
      recommendedActions: [
        { command: 'npm run health:ready', purpose: 'Re-check readiness status', riskLevel: 'LOW' },
        { command: 'npm run status:json', purpose: 'Get structured output for detailed analysis', riskLevel: 'LOW' },
        { command: 'npm run preview:restart', purpose: 'Restart if readiness does not recover', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run preview:restart', 'npm run status'],
    };
  }

  // Electron not detected in dev mode
  if (mode === 'dev' && !processes.electronRunning) {
    return {
      category: 'PROCESS_FAILURE',
      confidence: 'LOW',
      likelyCauses: [
        'Electron process not yet started — may still be compiling TypeScript',
        'The app was closed or crashed — check terminal for error output',
        'Another Electron instance may be preventing startup (single-instance lock)',
      ],
      recommendedActions: [
        { command: 'npm run dev', purpose: 'Restart dev mode if the app is not running', riskLevel: 'LOW' },
        { command: 'npm run typecheck', purpose: 'Check for TypeScript compilation errors that may prevent startup', riskLevel: 'LOW' },
        { command: 'npm run clean && npm run dev', purpose: 'Clean build artifacts and restart if issues persist', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run clean', 'npm run dev'],
    };
  }

  // Watchdog not running in preview mode (less severe)
  if (mode === 'preview' && !processes.watchdogRunning) {
    return {
      category: 'WATCHDOG_INSTABILITY',
      confidence: 'LOW',
      likelyCauses: [
        'Watchdog was not started — it requires explicit activation via watchdog:start',
        'The watchdog process crashed or was stopped manually',
        'Watchdog is optional and not required for basic preview operation',
      ],
      recommendedActions: [
        { command: 'npm run watchdog:start', purpose: 'Start the watchdog for automatic crash recovery', riskLevel: 'LOW' },
        { command: 'npm run watchdog:status', purpose: 'Check if the watchdog process is running', riskLevel: 'LOW' },
      ],
      safeRecoveryPath: ['npm run watchdog:start', 'npm run status'],
    };
  }

  // ─── Fallback: unmatched degraded state ────────────────────────────────

  return {
    category: 'UNKNOWN_STATE',
    confidence: 'LOW',
    likelyCauses: [
      'The system is in an unexpected state that does not match any known failure pattern',
      'Environment variables may be set to conflicting values',
      'The system may be in a transitional state between modes',
      ...gradeReason.map(r => `Observed: ${r}`),
    ],
    recommendedActions: [
      { command: 'npm run status:json', purpose: 'Get full structured output for detailed analysis', riskLevel: 'LOW' },
      { command: 'npm run preview:logs', purpose: 'Check logs for any error messages or anomalies', riskLevel: 'LOW' },
      { command: 'npm run clean && npm run build', purpose: 'Clean build artifacts and rebuild from scratch', riskLevel: 'LOW' },
    ],
    safeRecoveryPath: ['npm run clean', 'npm run build', 'npm run dev'],
  };
}
