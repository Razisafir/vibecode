#!/usr/bin/env node
// ============================================================
// VibeCode Desktop — Watchdog Process Monitor
// ============================================================
//
// SAFETY: This script does NOTHING unless explicitly activated:
//   node watchdog.js --enable
//
// It does NOT auto-start. It does NOT run in the background.
// It does NOT daemonize. It must be manually enabled every time.
//
// What it does (when enabled):
//   1. Monitors the VibeCode process via HTTP health endpoint
//   2. Restarts the process if it becomes unresponsive
//   3. Logs all watchdog events to ./logs/watchdog.log
//   4. Respects a configurable restart budget (max restarts per window)
//
// Usage:
//   node watchdog.js --enable                → Start watchdog (foreground)
//   node watchdog.js --enable --daemonize    → Start watchdog (background)
//   node watchdog.js --status                → Check if watchdog is running
//   node watchdog.js --disable               → Stop a running watchdog
//   node watchdog.js --help                  → Show help
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  /** Health check endpoint URL */
  healthUrl: process.env.VIBECODE_HEALTH_URL || 'http://localhost:9876',
  /** How often to check health (ms) */
  checkIntervalMs: parseInt(process.env.WATCHDOG_INTERVAL_MS || '15000', 10),
  /** HTTP request timeout for health checks (ms) */
  requestTimeoutMs: 5000,
  /** How many consecutive failures before restart */
  failuresBeforeRestart: 3,
  /** Maximum restarts within the restart window */
  maxRestartsPerWindow: 5,
  /** Restart window duration (ms) — restarts beyond max within this window trigger cooldown */
  restartWindowMs: 10 * 60 * 1000, // 10 minutes
  /** Cooldown duration after hitting restart budget (ms) */
  cooldownDurationMs: 5 * 60 * 1000, // 5 minutes
  /** PM2 process name to manage */
  pm2ProcessName: 'vibecode-desktop',
  /** Log file path */
  logFile: path.join(__dirname, 'logs', 'watchdog.log'),
  /** PID file for watchdog itself */
  pidFile: path.join(__dirname, 'logs', 'watchdog.pid'),
};

// ─── State ──────────────────────────────────────────────────────────────────

let enabled = false;
let checkTimer = null;
let consecutiveFailures = 0;
let restartHistory = []; // timestamps of recent restarts
let inCooldown = false;

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (args.includes('--status')) {
  checkStatus();
  process.exit(0);
}

if (args.includes('--disable')) {
  disableWatchdog();
  process.exit(0);
}

if (!args.includes('--enable')) {
  console.error('[Watchdog] ERROR: Must use --enable to start. This is a safety measure.');
  console.error('[Watchdog] The watchdog will NEVER auto-start.');
  process.exit(1);
}

// ─── Main ───────────────────────────────────────────────────────────────────

ensureLogDir();
enableWatchdog(args.includes('--daemonize'));

// ─── Functions ──────────────────────────────────────────────────────────────

function enableWatchdog(daemonize) {
  if (daemonize) {
    // Fork into background
    const child = spawn(process.execPath, [__filename, '--enable'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, WATCHDOG_DAEMON: '1' },
    });
    child.unref();
    console.log(`[Watchdog] Daemonized with PID ${child.pid}`);
    process.exit(0);
  }

  enabled = true;
  writePidFile();

  log('WATCHDOG ENABLED — monitoring started');
  log(`  Health URL: ${CONFIG.healthUrl}`);
  log(`  Check interval: ${CONFIG.checkIntervalMs}ms`);
  log(`  Failures before restart: ${CONFIG.failuresBeforeRestart}`);
  log(`  Max restarts per ${CONFIG.restartWindowMs / 60000}min window: ${CONFIG.maxRestartsPerWindow}`);

  // Handle graceful shutdown
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGHUP', () => {
    log('SIGHUP received — reloading configuration (not implemented yet, no-op)');
  });

  // Start the health check loop
  runHealthCheck();

  // Keep the process alive
  console.log('[Watchdog] Running in foreground. Press Ctrl+C to stop.');
}

function runHealthCheck() {
  if (!enabled) return;

  const url = `${CONFIG.healthUrl}/api/health/live`;

  const req = http.get(url, { timeout: CONFIG.requestTimeoutMs }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.alive === true) {
          onHealthCheckSuccess();
        } else {
          onHealthCheckFailure('Health endpoint returned alive=false');
        }
      } catch {
        onHealthCheckFailure('Invalid health response JSON');
      }
    });
  });

  req.on('error', (err) => {
    onHealthCheckFailure(`Health check error: ${err.message}`);
  });

  req.on('timeout', () => {
    req.destroy();
    onHealthCheckFailure('Health check timed out');
  });

  // Schedule next check
  checkTimer = setTimeout(runHealthCheck, CONFIG.checkIntervalMs);
}

function onHealthCheckSuccess() {
  if (consecutiveFailures > 0) {
    log(`Health check recovered after ${consecutiveFailures} failure(s)`);
  }
  consecutiveFailures = 0;
}

function onHealthCheckFailure(reason) {
  consecutiveFailures++;
  log(`Health check FAILED (${consecutiveFailures}/${CONFIG.failuresBeforeRestart}): ${reason}`);

  if (consecutiveFailures >= CONFIG.failuresBeforeRestart) {
    attemptRestart();
  }
}

function attemptRestart() {
  if (inCooldown) {
    log('RESTART BLOCKED — in cooldown period (too many restarts)');
    return;
  }

  // Clean up old restart timestamps
  const now = Date.now();
  restartHistory = restartHistory.filter((t) => now - t < CONFIG.restartWindowMs);

  // Check restart budget
  if (restartHistory.length >= CONFIG.maxRestartsPerWindow) {
    log(`RESTART BUDGET EXHAUSTED — ${restartHistory.length} restarts in last ${CONFIG.restartWindowMs / 60000} minutes`);
    log(`Entering cooldown for ${CONFIG.cooldownDurationMs / 60000} minutes`);
    inCooldown = true;
    setTimeout(() => {
      inCooldown = false;
      restartHistory = [];
      log('Cooldown period ended — restart budget reset');
    }, CONFIG.cooldownDurationMs);
    return;
  }

  // Perform restart via PM2
  log(`RESTARTING process "${CONFIG.pm2ProcessName}" via PM2...`);
  restartHistory.push(now);

  exec(`npx pm2 restart ${CONFIG.pm2ProcessName}`, (error, stdout, stderr) => {
    if (error) {
      log(`RESTART FAILED: ${error.message}`);
      log(`  stderr: ${stderr}`);
    } else {
      log('RESTART SUCCESSFUL');
      consecutiveFailures = 0;
    }
  });
}

function checkStatus() {
  const pid = readPidFile();
  if (pid && isProcessRunning(pid)) {
    console.log(`[Watchdog] RUNNING (PID ${pid})`);
    console.log(`  Health URL: ${CONFIG.healthUrl}`);
    console.log(`  Log file: ${CONFIG.logFile}`);
  } else {
    console.log('[Watchdog] NOT RUNNING');
  }
}

function disableWatchdog() {
  const pid = readPidFile();
  if (!pid) {
    console.log('[Watchdog] Not running (no PID file found)');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`[Watchdog] Stale PID file found (PID ${pid} not running) — cleaning up`);
    removePidFile();
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[Watchdog] Sent SIGTERM to watchdog (PID ${pid})`);
  } catch {
    console.log(`[Watchdog] Could not stop PID ${pid} — may need manual kill`);
  }

  removePidFile();
}

function gracefulShutdown(signal) {
  log(`Received ${signal} — shutting down watchdog`);
  enabled = false;
  if (checkTimer) {
    clearTimeout(checkTimer);
    checkTimer = null;
  }
  removePidFile();
  process.exit(0);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;

  // Console output
  console.log(`[Watchdog] ${message}`);

  // Append to log file
  try {
    fs.appendFileSync(CONFIG.logFile, line);
  } catch {
    // Best-effort logging
  }
}

function ensureLogDir() {
  const dir = path.dirname(CONFIG.logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writePidFile() {
  try {
    fs.writeFileSync(CONFIG.pidFile, String(process.pid));
  } catch {
    log('WARNING: Could not write PID file');
  }
}

function readPidFile() {
  try {
    if (fs.existsSync(CONFIG.pidFile)) {
      return parseInt(fs.readFileSync(CONFIG.pidFile, 'utf-8').trim(), 10);
    }
  } catch {
    // Ignore
  }
  return null;
}

function removePidFile() {
  try {
    if (fs.existsSync(CONFIG.pidFile)) {
      fs.unlinkSync(CONFIG.pidFile);
    }
  } catch {
    // Ignore
  }
}

function isProcessRunning(pid) {
  try {
    // Sending signal 0 doesn't kill the process, just checks if it exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`
VibeCode Watchdog — Process Monitor

USAGE:
  node watchdog.js --enable          Start watchdog (foreground)
  node watchdog.js --enable --daemonize  Start watchdog (background)
  node watchdog.js --status          Check watchdog status
  node watchdog.js --disable         Stop running watchdog
  node watchdog.js --help            Show this help

ENVIRONMENT VARIABLES:
  VIBECODE_HEALTH_URL   Health endpoint URL (default: http://localhost:9876)
  WATCHDOG_INTERVAL_MS  Check interval in milliseconds (default: 15000)

SAFETY:
  The watchdog does NOT auto-start. It requires explicit --enable.
  It will never modify the default npm run dev workflow.
`);
}
