#!/usr/bin/env node
// ============================================================
// VibeCode Desktop — Unified System Status Command
// ============================================================
//
// One command to understand everything about the running system,
// including failure analysis when the system is degraded.
//
// Usage:
//   npm run status              Human-readable status + failure analysis
//   npm run status -- --json    JSON output (includes failure object)
//   npm run status -- --quiet   Only output grade (GREEN/YELLOW/RED)
//
// This script is read-only. It has zero side effects.
// All recovery suggestions are RECOMMENDATIONS, not commands.
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── CLI Args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const quietMode = args.includes('--quiet');

// ─── Constants ──────────────────────────────────────────────────────────────

const HEALTH_PORT = parseInt(process.env.VIBECODE_HEALTH_PORT || '9876', 10);
const HEALTH_URL = process.env.VIBECODE_HEALTH_URL || `http://localhost:${HEALTH_PORT}`;
const VITE_PORT = parseInt(process.env.VITE_PORT || '5173', 10);
const WATCHDOG_PID_FILE = path.join(__dirname, '..', 'logs', 'watchdog.pid');
const PM2_PROCESS_NAME = 'vibecode-desktop';

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const status = await collectSystemStatus();

  if (quietMode) {
    console.log(status.grade);
    process.exit(status.grade === 'RED' ? 1 : 0);
  }

  if (jsonMode) {
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.grade === 'RED' ? 1 : 0);
  }

  printHumanReadable(status);
  process.exit(status.grade === 'RED' ? 1 : 0);
}

// ─── Data Collection ────────────────────────────────────────────────────────

async function collectSystemStatus() {
  // 1. Detect mode
  const modeResult = detectMode();

  // 2. Check process state
  const processState = await collectProcessState(modeResult.mode);

  // 3. Check health layer
  const healthLayer = await collectHealthLayer();

  // 4. Detect infrastructure
  const infraLayer = detectInfrastructure(modeResult.mode);

  // 5. Resolve ports
  const ports = resolvePorts(modeResult.mode);

  // 6. Grade the system
  const grading = gradeSystemHealth(modeResult.mode, processState, healthLayer, infraLayer);

  // 7. Analyze failures if degraded
  const failure = grading.grade !== 'GREEN'
    ? analyzeFailure(modeResult.mode, processState, healthLayer, infraLayer, grading.reasons)
    : undefined;

  return {
    timestamp: new Date().toISOString(),
    mode: modeResult.mode,
    modeSource: modeResult.source,
    processes: processState,
    health: healthLayer,
    infrastructure: infraLayer,
    ports,
    grade: grading.grade,
    gradeReason: grading.reasons,
    failure,
    version: getVersion(),
  };
}

// ─── Mode Detection ─────────────────────────────────────────────────────────

function detectMode() {
  const env = process.env;

  if (env.VIBECODE_ENV === 'prod' || env.VIBECODE_ENV === 'production') {
    return { mode: 'production', source: 'VIBECODE_ENV=production' };
  }
  if (env.VIBECODE_ENV === 'preview') {
    return { mode: 'preview', source: 'VIBECODE_ENV=preview' };
  }
  if (env.VIBECODE_ENV === 'dev' || env.VIBECODE_ENV === 'development') {
    return { mode: 'dev', source: 'VIBECODE_ENV=dev' };
  }

  if (env.NODE_ENV === 'production') {
    return { mode: 'production', source: 'NODE_ENV=production' };
  }

  // PM2 sets pm_id environment variable
  if (env.pm_id !== undefined) {
    return { mode: 'preview', source: 'PM2 process detected (pm_id set)' };
  }

  if (env.VIBECODE_HEALTH_PORT) {
    return { mode: 'preview', source: 'VIBECODE_HEALTH_PORT set' };
  }

  if (env.VIBECODE_DEV === '1') {
    return { mode: 'dev', source: 'VIBECODE_DEV=1' };
  }

  return { mode: 'dev', source: 'default (no mode indicators found)' };
}

// ─── Process State ──────────────────────────────────────────────────────────

async function collectProcessState(mode) {
  const pm2Info = await queryPM2();
  const watchdogInfo = queryWatchdog();
  const electronRunning = detectElectronProcess();

  return {
    viteExpected: mode === 'dev',
    electronRunning,
    pm2Active: pm2Info.active,
    pm2Process: pm2Info.process,
    watchdogRunning: watchdogInfo.running,
    watchdogPid: watchdogInfo.pid,
  };
}

async function queryPM2() {
  try {
    const output = execSync('npx pm2 jlist 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const processes = JSON.parse(output);
    const vibecode = processes.find(
      (p) => p.name === PM2_PROCESS_NAME || p.pm2_env?.pm_exec_path?.includes('vibecode')
    );

    if (vibecode) {
      return {
        active: true,
        process: {
          name: vibecode.name || PM2_PROCESS_NAME,
          status: vibecode.pm2_env?.status || 'unknown',
          restarts: vibecode.pm2_env?.restart_time ?? 0,
          uptime: vibecode.pm2_env?.pm_uptime
            ? Math.floor((Date.now() - vibecode.pm2_env.pm_uptime) / 1000)
            : 0,
          memory: vibecode.monit?.memory ?? 0,
          pid: vibecode.pid ?? 0,
        },
      };
    }

    return { active: false, process: undefined };
  } catch {
    // PM2 not installed or not running
    return { active: false, process: undefined };
  }
}

function queryWatchdog() {
  try {
    if (fs.existsSync(WATCHDOG_PID_FILE)) {
      const pid = parseInt(fs.readFileSync(WATCHDOG_PID_FILE, 'utf-8').trim(), 10);
      if (pid && isProcessRunning(pid)) {
        return { running: true, pid };
      }
      // Stale PID file
      return { running: false, pid: undefined };
    }
  } catch {
    // Ignore
  }
  return { running: false, pid: undefined };
}

function detectElectronProcess() {
  try {
    const output = execSync('ps aux 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    return output.toLowerCase().includes('electron') && output.toLowerCase().includes('vibecode');
  } catch {
    return false;
  }
}

// ─── Health Layer ───────────────────────────────────────────────────────────

async function collectHealthLayer() {
  const healthResult = await fetchHealth('/api/health');
  const readyResult = await fetchHealth('/api/health/ready');
  const liveResult = await fetchHealth('/api/health/live');

  let healthResponse = undefined;
  let ready = null;
  let alive = null;
  let memoryUsage = undefined;
  let restartCount = 0;

  if (healthResult.ok) {
    try {
      healthResponse = {
        status: healthResult.data.status || 'unknown',
        uptime: healthResult.data.uptime ?? 0,
        version: healthResult.data.version || 'unknown',
        channel: healthResult.data.channel || 'unknown',
        services: healthResult.data.services || {},
      };
    } catch {
      // Malformed response
    }
  }

  if (readyResult.ok) {
    ready = readyResult.data.ready ?? null;
  }

  if (liveResult.ok) {
    alive = liveResult.data.alive ?? null;
  }

  // Extract memory from process info if available
  try {
    const pm2Info = await queryPM2();
    if (pm2Info.process) {
      memoryUsage = pm2Info.process.memory;
      restartCount = pm2Info.process.restarts;
    }
  } catch {
    // Ignore
  }

  return {
    endpointReachable: healthResult.ok || readyResult.ok || liveResult.ok,
    healthResponse,
    ready,
    alive,
    memoryUsage,
    restartCount,
  };
}

function fetchHealth(endpoint) {
  return new Promise((resolve) => {
    const url = `${HEALTH_URL}${endpoint}`;
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: true, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, data: {} });
        }
      });
    });

    req.on('error', () => resolve({ ok: false, data: {} }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, data: {} });
    });
  });
}

// ─── Infrastructure Detection ───────────────────────────────────────────────

function detectInfrastructure(mode) {
  return {
    pm2Enabled: mode === 'preview' || mode === 'production',
    watchdogEnabled: mode === 'preview' && !!process.env.VIBECODE_HEALTH_PORT,
    healthServerEnabled: !!process.env.VIBECODE_HEALTH_PORT,
    caddyExpected: false,
  };
}

// ─── Port Resolution ────────────────────────────────────────────────────────

function resolvePorts(mode) {
  return {
    frontend: mode === 'dev' ? VITE_PORT : null,
    backend: null,
    health: process.env.VIBECODE_HEALTH_PORT
      ? parseInt(process.env.VIBECODE_HEALTH_PORT, 10)
      : mode === 'preview' ? 9876 : null,
  };
}

// ─── Health Grading ─────────────────────────────────────────────────────────

function gradeSystemHealth(mode, processes, health, infrastructure) {
  const reasons = [];

  // RED conditions
  if (mode === 'preview' && !processes.pm2Active) {
    return { grade: 'RED', reasons: ['Preview mode detected but PM2 is not managing the process'] };
  }
  if (mode === 'preview' && !health.endpointReachable) {
    return { grade: 'RED', reasons: ['Preview mode detected but health endpoint is unreachable'] };
  }
  if (health.endpointReachable && health.healthResponse?.status === 'error') {
    return { grade: 'RED', reasons: ['Health endpoint reports error status'] };
  }

  // YELLOW conditions
  if (mode === 'preview' && !processes.watchdogRunning) {
    reasons.push('Watchdog is not running - process will not auto-recover from crashes');
  }
  if (health.restartCount > 3) {
    reasons.push(`PM2 restart count is ${health.restartCount} (>3) - possible instability`);
  }
  if (health.healthResponse?.services) {
    const downServices = Object.entries(health.healthResponse.services)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (downServices.length > 0) {
      reasons.push(`Services down: ${downServices.join(', ')}`);
    }
  }
  if (mode === 'dev' && !processes.electronRunning) {
    reasons.push('Electron process not detected - may be starting up or stopped');
  }
  if (health.endpointReachable && health.ready === false) {
    reasons.push('Health endpoint reachable but readiness check failed');
  }

  if (reasons.length > 0) {
    return { grade: 'YELLOW', reasons };
  }

  return { grade: 'GREEN', reasons: ['All systems nominal'] };
}

// ─── Failure Intelligence ───────────────────────────────────────────────────

/**
 * Analyze system state to classify failures, infer likely root causes,
 * and generate recovery guidance.
 *
 * SAFETY: This function is strictly diagnostic. It MUST NOT execute
 * anything, modify any state, or take any action. It only produces
 * recommendations for the developer to follow manually.
 *
 * All language is conservative: "likely cause", "may indicate",
 * "possible" — never "cause" or "definitely".
 */
function analyzeFailure(mode, processes, health, _infrastructure, gradeReason) {
  // ─── RED: Critical failures ─────────────────────────────────────────────

  // Preview mode without PM2
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

  // Preview mode with unreachable health endpoint
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

  // Health endpoint reports error status
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

  // ─── YELLOW: Degraded conditions ────────────────────────────────────────

  // Watchdog running but high restart count
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

  // Watchdog not running in preview mode
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

  // ─── Fallback: unmatched degraded state ─────────────────────────────────

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

// ─── Human-Readable Output ─────────────────────────────────────────────────

function printHumanReadable(status) {
  const gradeColor = { GREEN: '\x1b[32m', YELLOW: '\x1b[33m', RED: '\x1b[31m' };
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const dim = '\x1b[2m';
  const gc = gradeColor[status.grade] || '';

  // Header
  console.log('');
  console.log(`${bold}  VibeCode System Status${reset}`);
  console.log(`${dim}  ${'─'.repeat(48)}${reset}`);
  console.log('');

  // Grade
  console.log(`  Overall:   ${gc}${bold}${status.grade}${reset}  ${dim}${status.gradeReason.join('; ')}${reset}`);
  console.log('');

  // Mode
  const modeLabel = { dev: 'DEV', preview: 'PREVIEW', production: 'PRODUCTION' }[status.mode] || 'UNKNOWN';
  console.log(`  Mode:      ${bold}${modeLabel}${reset}  ${dim}(${status.modeSource})${reset}`);
  console.log(`  Version:   ${status.version}`);
  console.log('');

  // Process State
  console.log(`${bold}  Processes${reset}`);
  console.log(`${dim}  ${'─'.repeat(48)}${reset}`);

  const check = (v) => v ? `${gc}●${reset}` : `${dim}○${reset}`;
  const label = (v) => v ? 'running' : 'stopped';

  if (status.processes.viteExpected) {
    console.log(`  ${check(true)} Vite dev server    ${dim}(expected on port ${status.ports.frontend})${reset}`);
  }
  console.log(`  ${check(status.processes.electronRunning)} Electron           ${dim}${label(status.processes.electronRunning)}${reset}`);
  console.log(`  ${check(status.processes.pm2Active)} PM2 supervision    ${dim}${status.processes.pm2Active ? `active (restarts: ${status.processes.pm2Process?.restarts ?? 0})` : 'not active'}${reset}`);
  console.log(`  ${check(status.processes.watchdogRunning)} Watchdog           ${dim}${status.processes.watchdogRunning ? `running (PID ${status.processes.watchdogPid})` : 'not running'}${reset}`);
  console.log('');

  // Health Layer
  console.log(`${bold}  Health${reset}`);
  console.log(`${dim}  ${'─'.repeat(48)}${reset}`);

  if (status.health.endpointReachable) {
    console.log(`  ${check(true)} Health endpoint    ${dim}reachable on port ${status.ports.health}${reset}`);
    console.log(`  ${check(status.health.alive === true)} Liveness           ${dim}${status.health.alive ? 'alive' : 'not alive'}${reset}`);
    console.log(`  ${check(status.health.ready === true)} Readiness          ${dim}${status.health.ready ? 'ready' : 'not ready'}${reset}`);
    if (status.health.healthResponse) {
      console.log(`  ${dim}  Uptime: ${formatUptime(status.health.healthResponse.uptime)}${reset}`);
      console.log(`  ${dim}  Channel: ${status.health.healthResponse.channel}${reset}`);
    }
    if (status.health.memoryUsage) {
      console.log(`  ${dim}  Memory: ${formatBytes(status.health.memoryUsage)}${reset}`);
    }
  } else {
    const portNote = status.ports.health ? `port ${status.ports.health}` : 'N/A';
    console.log(`  ${check(false)} Health endpoint    ${dim}not reachable (${portNote})${reset}`);
    if (status.mode === 'dev') {
      console.log(`  ${dim}  (This is normal in dev mode - health server only runs in preview)${reset}`);
    }
  }
  console.log('');

  // Infrastructure
  console.log(`${bold}  Infrastructure${reset}`);
  console.log(`${dim}  ${'─'.repeat(48)}${reset}`);
  console.log(`  PM2:            ${status.infrastructure.pm2Enabled ? 'enabled' : 'off'}  ${dim}(expected for ${modeLabel} mode)${reset}`);
  console.log(`  Watchdog:       ${status.infrastructure.watchdogEnabled ? 'enabled' : 'off'}${reset}`);
  console.log(`  Health server:  ${status.infrastructure.healthServerEnabled ? 'enabled' : 'off'}${reset}`);
  console.log(`  Caddy:          ${status.infrastructure.caddyExpected ? 'expected' : 'off'}  ${dim}(manual only)${reset}`);
  console.log('');

  // Ports
  console.log(`${bold}  Port Mapping${reset}`);
  console.log(`${dim}  ${'─'.repeat(48)}${reset}`);
  if (status.ports.frontend) console.log(`  Frontend (Vite):  ${status.ports.frontend}`);
  if (status.ports.health) console.log(`  Health endpoint:  ${status.ports.health}`);
  if (!status.ports.frontend && !status.ports.health) {
    console.log(`  ${dim}(No ports expected in current mode)${reset}`);
  }
  console.log('');

  // ─── Failure Analysis (only when degraded) ──────────────────────────────
  if (status.failure) {
    const f = status.failure;
    const confColor = { HIGH: '\x1b[31m', MEDIUM: '\x1b[33m', LOW: '\x1b[36m' }[f.confidence] || '';

    console.log(`${bold}  Failure Analysis${reset}`);
    console.log(`${dim}  ${'─'.repeat(48)}${reset}`);
    console.log('');

    // Category + Confidence
    console.log(`  Category:    ${gc}${bold}${f.category}${reset}`);
    console.log(`  Confidence:  ${confColor}${f.confidence}${reset}`);
    console.log('');

    // Likely Causes
    console.log(`  ${bold}Likely Causes:${reset}`);
    for (const cause of f.likelyCauses) {
      console.log(`  ${dim}-${reset} ${cause}`);
    }
    console.log('');

    // Recommended Actions
    console.log(`  ${bold}Recommended Actions:${reset}`);
    for (const action of f.recommendedActions) {
      const riskBadge = { LOW: '\x1b[32m', MEDIUM: '\x1b[33m', HIGH: '\x1b[31m' }[action.riskLevel] || '';
      console.log(`  ${dim}-${reset} ${bold}${action.command}${reset}`);
      console.log(`    ${dim}${action.purpose}${reset}`);
      console.log(`    ${dim}Risk: ${riskBadge}${action.riskLevel}${reset}`);
    }
    console.log('');

    // Safe Recovery Path
    console.log(`  ${bold}Safe Recovery Path:${reset}`);
    f.safeRecoveryPath.forEach((step, i) => {
      console.log(`  ${dim}${i + 1}.${reset} ${step}`);
    });
    console.log('');
  }

  // Footer
  console.log(`${dim}  Generated: ${status.timestamp}${reset}`);
  console.log('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Status command failed:', err.message);
  process.exit(2);
});
