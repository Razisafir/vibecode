# System Status Reference

This document explains the VibeCode system status model, how to interpret the output of `npm run status`, the failure intelligence layer, and what to do when the system is degraded.

---

## The One Command

```bash
npm run status
```

This is the single command that explains the entire running system. It detects the current mode, checks all process layers, probes the health endpoint, grades the overall system health, and when degraded, provides failure analysis with root cause inference and recovery guidance.

For machine-readable output:

```bash
npm run status:json
```

---

## What `npm run status` Reports

### Runtime Mode

The mode is detected automatically from environment variables and process state. The detection priority is:

| Priority | Signal | Mode |
|----------|--------|------|
| 1 | `VIBECODE_ENV=production` | PRODUCTION |
| 2 | `VIBECODE_ENV=preview` | PREVIEW |
| 3 | `VIBECODE_ENV=dev` | DEV |
| 4 | `NODE_ENV=production` | PRODUCTION |
| 5 | `pm_id` set (PM2 env) | PREVIEW |
| 6 | `VIBECODE_HEALTH_PORT` set | PREVIEW |
| 7 | `VIBECODE_DEV=1` | DEV |
| 8 | None of the above | DEV (default) |

The `modeSource` field in the output tells you exactly which signal was used, so there is never ambiguity about why a particular mode was detected.

### Process State

| Field | Meaning |
|-------|---------|
| `viteExpected` | Whether the Vite dev server should be running (true in DEV mode) |
| `electronRunning` | Whether an Electron process is currently detected on the system |
| `pm2Active` | Whether PM2 is managing the VibeCode process |
| `pm2Process.restarts` | Number of times PM2 has restarted the process |
| `pm2Process.uptime` | Seconds since the PM2 process was started |
| `pm2Process.memory` | Memory usage in bytes |
| `watchdogRunning` | Whether the watchdog process is active |

### Health Layer

| Field | Meaning |
|-------|---------|
| `endpointReachable` | Can the `/api/health` endpoint be reached? |
| `alive` | Did `/api/health/live` return `alive: true`? |
| `ready` | Did `/api/health/ready` return `ready: true`? |
| `healthResponse.services` | Which internal services are reported healthy? |
| `restartCount` | How many times has PM2 restarted the process? |

### Infrastructure Layer

| Field | Meaning |
|-------|---------|
| `pm2Enabled` | Is PM2 expected to be active for the current mode? |
| `watchdogEnabled` | Is the watchdog expected to be running? |
| `healthServerEnabled` | Is the health HTTP server expected to be running? |
| `caddyExpected` | Is Caddy expected to be proxying? (always false; manual only) |

### Port Mapping

| Field | Meaning |
|-------|---------|
| `frontend` | Vite dev server port (5173 in DEV mode, null otherwise) |
| `backend` | Always null (Electron desktop app, no separate backend) |
| `health` | Health check HTTP port (9876 in PREVIEW mode, null in DEV) |

---

## Health Grades

The system grades overall health as one of three states. This grading system is designed so that anyone — regardless of technical background — can understand what the system is telling them and what to do about it.

### Quick Interpretation (Non-Technical)

| Grade | One-Sentence Meaning | Do I Need to Do Anything? |
|-------|---------------------|--------------------------|
| **GREEN** | Everything is working normally. | No. Keep working. |
| **YELLOW** | Something is not ideal but the app still works. | Probably not urgently, but read the details to see if action is recommended. |
| **RED** | Something important is broken. | Yes. Follow the recovery steps shown in the output. |

### What Each Grade Actually Means

**GREEN** is the normal state. When you see GREEN, every part of the system that is expected to be running is running, and no problems have been detected. You do not need to take any action. Think of it like a green traffic light — proceed as normal.

**YELLOW** means the system detected something that is not optimal, but nothing critical has failed. The app will continue to work, but some capabilities may be reduced. For example, the watchdog might not be running in preview mode, which means the app will not automatically restart if it crashes. YELLOW is like a yellow traffic light — the app still works, but you should be aware of the limitation described in the grade reason.

**RED** means a core component has failed or is missing. The app may not be functioning correctly, or may not recover from problems on its own. When you see RED, the status output will include a Failure Analysis section with specific recovery steps you can follow. RED is like a red traffic light — stop and address the issue before continuing.

### How to Respond

1. **GREEN:** No action. Continue your work.
2. **YELLOW:** Read the `gradeReason` line in the output. It will tell you exactly what is suboptimal. Decide whether the limitation affects your work. If it does, follow the suggested action.
3. **RED:** Read the entire Failure Analysis section. It provides a step-by-step Safe Recovery Path. Follow those commands in order. After completing the steps, run `npm run status` again to verify the system has recovered.

### GREEN - All Systems Nominal

The system is running as expected for the current mode. All required processes are active, the health endpoint is reachable (in preview mode), and no anomalies are detected.

**Action required:** None. Keep developing.

### YELLOW - Degraded

The system is partially functional but something is missing or suboptimal. The system will work, but some features may be unavailable or the system may not auto-recover from failures.

**Common causes:**
| Symptom | Meaning | Action |
|---------|---------|--------|
| Watchdog not running (preview) | Process will not auto-restart on crash | `npm run watchdog:start` |
| Electron not detected (dev) | App may be starting up or was closed | Check if app window is open |
| Readiness check failed | Some internal services are not initialized | Wait a moment and re-check |
| High restart count (>3) | Process has been crashing repeatedly | Check `npm run preview:logs` for root cause |

**Action required:** Read the failure analysis section in the status output. The system works but may not recover from failures.

### RED - Critical Failure

The system is in a broken state. A core component required for the current mode is missing or failing.

**Common causes:**
| Symptom | Meaning | Action |
|---------|---------|--------|
| Preview mode but PM2 not active | PM2 should be managing the process but is not | `npm run preview:stop && npm run preview:start` |
| Preview mode but health endpoint unreachable | The app under PM2 is not responding | `npm run preview:logs` to check for crash |
| Health endpoint reports error status | Internal services have failed | Restart the preview process |

**Action required:** Immediate. Follow the safe recovery path provided in the failure analysis.

---

## Failure Intelligence

When the system grade is YELLOW or RED, `npm run status` automatically provides a **Failure Analysis** section that goes beyond simply reporting what is broken. It provides root cause inference, recommended actions, and a safe recovery path.

### Core Principle

> "The system should not only say what is broken, but why it is likely broken and how to safely recover it."

### Failure Categories

| Category | Meaning | Typical Severity |
|----------|---------|-----------------|
| `PROCESS_FAILURE` | The Electron process has crashed or is not running | RED or YELLOW |
| `PORT_CONFLICT` | Another process is using a port that VibeCode needs | YELLOW |
| `HEALTH_SERVER_DOWN` | The health check server is expected but not responding | RED |
| `PM2_MISCONFIGURATION` | PM2 should be managing the process but is not active | RED |
| `WATCHDOG_INSTABILITY` | The watchdog is in an unstable state or triggering excessive restarts | YELLOW |
| `SERVICE_DEGRADATION` | One or more internal services are unhealthy | YELLOW |
| `UNKNOWN_STATE` | The system is in an unexpected state not matching any known pattern | YELLOW |

### Confidence Levels

| Confidence | Meaning |
|------------|---------|
| `HIGH` | The system state clearly matches a well-known failure pattern |
| `MEDIUM` | The pattern is likely but could have alternative explanations |
| `LOW` | The diagnosis is a best-effort guess based on limited signals |

### How Failure Analysis Works

The failure intelligence module examines the current system state (mode, processes, health, infrastructure) and pattern-matches against known failure scenarios. When a match is found, it provides:

1. **Category** — Classifies the type of failure
2. **Likely Causes** — Best-effort list of possible root causes (never claiming certainty)
3. **Recommended Actions** — Step-by-step suggestions, each with a command, purpose, and risk level
4. **Safe Recovery Path** — A minimal, deterministic, non-destructive sequence to recover the system

### Safety Constraints

The failure intelligence system is **strictly read-only**. It:

- Never executes fixes automatically
- Never restarts processes
- Never modifies system state
- Only suggests actions
- Always keeps recommendations optional

All language is conservative: "likely cause", "may indicate", "possible" — never "cause" or "definitely".

---

## Example Output

### Dev Mode (GREEN)

```
  VibeCode System Status
  ────────────────────────────────────────────────

  Overall:   GREEN  All systems nominal

  Mode:      DEV  (VIBECODE_DEV=1)
  Version:   0.1.0

  Processes
  ────────────────────────────────────────────────
  ● Vite dev server    (expected on port 5173)
  ● Electron           running
  ○ PM2 supervision    not active
  ○ Watchdog           not running

  Health
  ────────────────────────────────────────────────
  ○ Health endpoint    not reachable (N/A)
    (This is normal in dev mode - health server only runs in preview)

  Infrastructure
  ────────────────────────────────────────────────
  PM2:            off  (expected for DEV mode)
  Watchdog:       off
  Health server:  off
  Caddy:          off  (manual only)

  Port Mapping
  ────────────────────────────────────────────────
  Frontend (Vite):  5173

  Generated: 2024-01-15T10:30:00.000Z
```

### Preview Mode (RED with Failure Analysis)

```
  VibeCode System Status
  ────────────────────────────────────────────────

  Overall:   RED  Preview mode detected but health endpoint is unreachable

  Mode:      PREVIEW  (VIBECODE_HEALTH_PORT set)
  Version:   0.1.0

  Processes
  ────────────────────────────────────────────────
  ○ Electron           stopped
  ● PM2 supervision    active (restarts: 3)
  ○ Watchdog           not running

  Health
  ────────────────────────────────────────────────
  ○ Health endpoint    not reachable (port 9876)

  Infrastructure
  ────────────────────────────────────────────────
  PM2:            enabled  (expected for PREVIEW mode)
  Watchdog:       enabled
  Health server:  enabled
  Caddy:          off  (manual only)

  Port Mapping
  ────────────────────────────────────────────────
  Health endpoint:  9876

  Failure Analysis
  ────────────────────────────────────────────────

  Category:    HEALTH_SERVER_DOWN
  Confidence:  HIGH

  Likely Causes:
  - The Electron process has not finished starting up yet
  - The health server failed to bind to the configured port
  - The app under PM2 has crashed and is in a restart loop
  - A firewall rule may be blocking local connections to the health port

  Recommended Actions:
  - npm run preview:status
    Check if PM2 reports the process as running or errored
    Risk: LOW
  - npm run preview:logs
    Check for startup errors or crash traces
    Risk: LOW
  - npm run preview:restart
    Restart the preview process to re-initialize the health server
    Risk: LOW

  Safe Recovery Path:
  1. npm run preview:stop
  2. npm run preview:start
  3. npm run status

  Generated: 2024-01-15T10:30:00.000Z
```

---

## JSON Schema

The `npm run status:json` command outputs a structured JSON object with this schema:

```json
{
  "timestamp": "ISO 8601 datetime",
  "mode": "dev | preview | production | unknown",
  "modeSource": "string describing how mode was detected",
  "processes": {
    "viteExpected": "boolean",
    "electronRunning": "boolean",
    "pm2Active": "boolean",
    "pm2Process": {
      "name": "string",
      "status": "string",
      "restarts": "number",
      "uptime": "number (seconds)",
      "memory": "number (bytes)",
      "pid": "number"
    },
    "watchdogRunning": "boolean",
    "watchdogPid": "number | undefined"
  },
  "health": {
    "endpointReachable": "boolean",
    "healthResponse": {
      "status": "string",
      "uptime": "number",
      "version": "string",
      "channel": "string",
      "services": {
        "memory": "boolean",
        "session": "boolean",
        "sandbox": "boolean"
      }
    },
    "ready": "boolean | null",
    "alive": "boolean | null",
    "memoryUsage": "number | undefined",
    "restartCount": "number"
  },
  "infrastructure": {
    "pm2Enabled": "boolean",
    "watchdogEnabled": "boolean",
    "healthServerEnabled": "boolean",
    "caddyExpected": "boolean"
  },
  "ports": {
    "frontend": "number | null",
    "backend": "number | null",
    "health": "number | null"
  },
  "grade": "GREEN | YELLOW | RED",
  "gradeReason": ["string"],
  "failure": {
    "category": "PROCESS_FAILURE | PORT_CONFLICT | HEALTH_SERVER_DOWN | PM2_MISCONFIGURATION | WATCHDOG_INSTABILITY | SERVICE_DEGRADATION | UNKNOWN_STATE",
    "confidence": "HIGH | MEDIUM | LOW",
    "likelyCauses": ["string"],
    "recommendedActions": [
      {
        "command": "string",
        "purpose": "string",
        "riskLevel": "LOW | MEDIUM | HIGH"
      }
    ],
    "safeRecoveryPath": ["string"]
  },
  "version": "string"
}
```

The `failure` object is **only present** when the grade is YELLOW or RED. When the grade is GREEN, the `failure` field is omitted entirely.

---

## Troubleshooting with Status

### "I don't know what mode I'm in"

Run `npm run status`. The `Mode` line tells you exactly which mode is active and why.

### "Is the app running?"

Check the `Electron` line in the Processes section. If it shows `stopped`, the app is not running.

### "Is preview mode healthy?"

Run `npm run status`. If grade is GREEN, everything is working. If YELLOW or RED, read the Failure Analysis section.

### "The app keeps crashing"

1. Run `npm run status` and check the Failure Analysis section
2. The category will tell you the type of failure (e.g., PROCESS_FAILURE, WATCHDOG_INSTABILITY)
3. Follow the Safe Recovery Path exactly as listed
4. If the issue persists, check `npm run preview:logs` for the root cause

### "Health endpoint not responding"

In DEV mode, this is normal — the health server only runs in PREVIEW mode. In PREVIEW mode, the Failure Analysis section will classify this as `HEALTH_SERVER_DOWN` and provide specific recovery steps.

### "Something is wrong but I don't know what"

Run `npm run status`. The Failure Analysis section will appear whenever the grade is YELLOW or RED, providing:
- The category of failure
- Likely root causes
- Step-by-step recommended actions
- A safe recovery path you can follow

---

## Failure Categories Reference

### PROCESS_FAILURE

The Electron main process has crashed, is not running, or is in a restart loop.

**Detection signals:** Electron process not detected, health endpoint reports error status, high PM2 restart count.

**Typical recovery:** Check logs for crash traces, restart the process, verify with `npm run status`.

### PORT_CONFLICT

Another process is using a port that VibeCode needs (typically 5173 for Vite or 9876 for health).

**Detection signals:** EADDRINUSE errors in logs, services failing to bind to ports.

**Typical recovery:** Identify the conflicting process with `lsof -i :<port>`, terminate it, restart VibeCode.

### HEALTH_SERVER_DOWN

The health check HTTP server is expected but not responding.

**Detection signals:** Preview mode detected but health endpoint unreachable.

**Typical recovery:** Check PM2 status and logs, restart the preview process.

### PM2_MISCONFIGURATION

PM2 is expected to manage the process but is not active or misconfigured.

**Detection signals:** Preview mode detected but PM2 is not managing the process.

**Typical recovery:** Stop and restart preview mode fully. Kill the PM2 daemon if needed.

### WATCHDOG_INSTABILITY

The watchdog is in an unstable state — either crash-looping with high restarts or not running when expected.

**Detection signals:** Watchdog running with restart count >3, watchdog not running in preview mode.

**Typical recovery:** Stop the watchdog temporarily, investigate the underlying crash, restart both.

### SERVICE_DEGRADATION

One or more internal services (memory, session, sandbox) are reporting as unhealthy.

**Detection signals:** Health response shows services with `false` status, readiness check fails.

**Typical recovery:** Restart preview mode to re-initialize all services.

### UNKNOWN_STATE

The system is in an unexpected state that does not match any known failure pattern.

**Detection signals:** Grade is YELLOW or RED but no specific pattern matches.

**Typical recovery:** Get JSON output for detailed analysis, check logs, clean and rebuild.

---

## Internal Modules

The status logic is available in two forms:

- **TypeScript module** at `src/main/system/status-provider.ts` — used inside Electron and in tests
- **CLI script** at `scripts/status.cjs` — standalone command that runs outside Electron
- **Failure knowledge map** at `src/main/system/failure-map.ts` — static catalog of failure patterns (used as reference, not imported at runtime)

These modules are:
- **Read-only** — no side effects, never starts or stops anything
- **Testable** — all functions accept environment overrides for testing
- **Safe** — never throws, never blocks, always returns a result
- **Conservative** — all failure analysis uses tentative language ("likely", "may", "possible")
