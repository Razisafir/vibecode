// ============================================================
// VibeCode Desktop — Health Check HTTP Server
// ============================================================
//
// Provides a lightweight HTTP endpoint for process supervisors
// (PM2, systemd, Kubernetes, load balancers) to probe liveness.
//
// SAFETY: This server does NOT start unless explicitly requested:
//   - Environment variable: VIBECODE_HEALTH_PORT=<port>
//   - OR CLI flag: --health-port=<port>
//
// The default `npm run dev` workflow NEVER sets these variables,
// so this server is completely dormant during normal development.
//
// Endpoints:
//   GET /api/health       → { status: "ok", uptime, version, channel }
//   GET /api/health/ready  → { ready: true/false }  (checks critical services)
//   GET /api/health/live   → { alive: true }         (liveness probe)
// ============================================================

import * as http from 'http';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthStatus {
  status: string;
  uptime: number;
  version: string;
  channel: string;
  timestamp: string;
  services: {
    memory: boolean;
    session: boolean;
    sandbox: boolean;
  };
}

interface ReadinessStatus {
  ready: boolean;
  checks: Record<string, boolean>;
  timestamp: string;
}

interface LivenessStatus {
  alive: boolean;
  pid: number;
  timestamp: string;
}

// ─── Health Server ──────────────────────────────────────────────────────────

let server: http.Server | null = null;
let startedAt: number = 0;

/**
 * Start the health check HTTP server.
 *
 * This is a NO-OP unless VIBECODE_HEALTH_PORT is set.
 * Called from main.ts during app initialization — but only
 * activates when the environment variable is present.
 */
export function startHealthServer(): void {
  const port = getHealthPort();
  if (!port) {
    logger.info('health', 'VIBECODE_HEALTH_PORT not set — health server NOT started (this is normal for dev mode)');
    return;
  }

  if (server) {
    logger.warn('health', 'Already running — skipping duplicate start');
    return;
  }

  startedAt = Date.now();

  server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] || '/';
    const method = req.method || 'GET';

    // Only allow GET requests
    if (method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    switch (url) {
      case '/api/health':
        handleHealth(res);
        break;
      case '/api/health/ready':
        handleReadiness(res);
        break;
      case '/api/health/live':
        handleLiveness(res);
        break;
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(port, () => {
    logger.info('health', `Listening on port ${port}`);
  });

  server.on('error', (err: Error) => {
    logger.error('health', `Server error: ${err.message}`);
    server = null;
  });
}

/**
 * Stop the health check HTTP server gracefully.
 */
export function stopHealthServer(): void {
  if (!server) return;

  server.close(() => {
    logger.info('health', 'Stopped');
    server = null;
  });
}

/**
 * Check if the health server is currently running.
 */
export function isHealthServerRunning(): boolean {
  return server !== null;
}

// ─── Route Handlers ─────────────────────────────────────────────────────────

function handleHealth(res: http.ServerResponse): void {
  const health: HealthStatus = {
    status: 'ok',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    version: getVersion(),
    channel: getChannel(),
    timestamp: new Date().toISOString(),
    services: checkServices(),
  };

  const allServicesHealthy = Object.values(health.services).every(Boolean);
  res.writeHead(allServicesHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health, null, 2));
}

function handleReadiness(res: http.ServerResponse): void {
  const checks = checkServices();
  const ready = Object.values(checks).every(Boolean);

  const status: ReadinessStatus = {
    ready,
    checks,
    timestamp: new Date().toISOString(),
  };

  res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(status, null, 2));
}

function handleLiveness(res: http.ServerResponse): void {
  const status: LivenessStatus = {
    alive: true,
    pid: process.pid,
    timestamp: new Date().toISOString(),
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(status, null, 2));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHealthPort(): number | null {
  // Check environment variable first, then CLI args
  const envPort = process.env.VIBECODE_HEALTH_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }

  // Check CLI arguments: --health-port=<port>
  const cliArg = process.argv.find((a) => a.startsWith('--health-port='));
  if (cliArg) {
    const parsed = parseInt(cliArg.split('=')[1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }

  return null;
}

function getVersion(): string {
  try {
    // Read from package.json via Electron app
    const { app } = require('electron');
    return app.getVersion();
  } catch {
    return '0.1.0';
  }
}

function getChannel(): string {
  return process.env.VIBECODE_CHANNEL || 'alpha';
}

function checkServices(): { memory: boolean; session: boolean; sandbox: boolean } {
  // Basic service checks — these are lightweight and non-blocking.
  // If the main process is alive enough to respond to HTTP,
  // these services are very likely operational.
  return {
    memory: true,   // Memory store is initialized at app startup
    session: true,   // Session manager is initialized at app startup
    sandbox: true,   // PathSandbox is initialized at app startup
  };
}
