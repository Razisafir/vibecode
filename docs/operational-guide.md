# VibeCode Operational Guide

This is the definitive reference for running, operating, and diagnosing VibeCode across all system modes. If you need to know how to start, stop, or debug VibeCode, start here.

---

## System Modes at a Glance

VibeCode has three distinct operational modes. Each mode is isolated from the others, serves a different purpose, and requires a different command to activate. No mode automatically enables another.

```
+-------------------+     +--------------------+     +--------------------+
|     DEV MODE      |     |   PREVIEW MODE     |     |  PRODUCTION MODE   |
|   (default)       |     |   (optional)       |     |  (distribution)    |
|                   |     |                    |     |                    |
| npm run dev       |     | npm run            |     | npm run dist       |
|                   |     |   preview:start    |     |                    |
| Vite hot-reload   |     | PM2 supervision    |     | electron-builder   |
| Electron + DevTools|    | Health endpoint    |     | Signed packages    |
| No health server  |     | Watchdog available |     | No source access   |
| No process manager|     | Isolated env files |     | Auto-update ready  |
+-------------------+     +--------------------+     +--------------------+
       |                          |                          |
       v                          v                          v
  Local development      Staging / testing            End-user install
  Hot-reload enabled     Process supervision          No dev dependencies
  Debug-friendly         Health monitoring            Hardened safety rules
```

### Quick Reference

| Mode | Command | Purpose | Health Server | Process Manager |
|------|---------|---------|---------------|-----------------|
| **Dev** | `npm run dev` | Local development with hot-reload | Off | None |
| **Preview** | `npm run preview:start` | Staging/testing with supervision | On (port 9876) | PM2 |
| **Production** | `npm run dist` | Build distributable packages | N/A | N/A |

---

## Dev Mode

Dev mode is the default. It is what you use 99% of the time as a developer working on VibeCode.

### What it does

- Starts the Vite dev server on port 5173 with hot-module replacement
- Compiles the Electron main process TypeScript and launches the app
- Opens Chrome DevTools automatically
- Loads the renderer from the Vite dev server URL (`http://localhost:5173`)
- No process supervision, no health endpoint, no watchdog

### How to start

```bash
cd vibecode-desktop
npm install          # first time only
npm run dev
```

### What runs where

| Component | Process | Port | Hot-reload |
|-----------|---------|------|------------|
| Vite dev server | Node.js (via `vite`) | 5173 | Yes |
| Electron main | Electron process | N/A | No (manual restart) |
| Electron renderer | Embedded Chromium | N/A | Yes (via Vite HMR) |

### Environment

Dev mode does not load `.env.dev` automatically. It uses whatever environment variables are set in your shell or in a `.env` file in the `vibecode-desktop/` directory. If you want mode-specific defaults, copy `.env.dev` to `.env` — but remember that `.env` is gitignored and never committed. The `.env.example` file documents all available variables with empty placeholders.

### When to use it

- Writing code and seeing changes immediately
- Debugging with DevTools
- Running tests (`npm run test`)
- linting (`npm run lint`)
- Any day-to-day development work

### When NOT to use it

- Testing process supervision behavior (use Preview mode)
- Verifying production build output (use `npm run build` + `npm run pack`)
- Running the health endpoint (requires Preview mode)

---

## Preview Mode

Preview mode runs VibeCode under PM2 process supervision with the health check server enabled. It is designed for staging, testing, and verifying that the application behaves correctly under managed conditions.

### What it does

- Builds the application first (equivalent to `npm run build`)
- Starts the built app under PM2 process supervision
- Enables the health check HTTP server on port 9876
- Loads environment from `.env.preview`
- Makes the app reachable at `http://localhost:9876/api/health`

### How to start

```bash
npm run preview:start
```

### How to check status

```bash
npm run preview:status     # PM2 process list
npm run health             # Hit /api/health endpoint
npm run preview:logs       # Tail PM2 logs
```

### How to stop

```bash
npm run preview:stop
```

### How to restart

```bash
npm run preview:restart
```

### What runs where

| Component | Process | Port | Notes |
|-----------|---------|------|-------|
| VibeCode app | PM2-managed Electron | N/A | Auto-restart on crash |
| Health server | HTTP server inside Electron | 9876 | Liveness, readiness, health |
| PM2 daemon | Background Node process | N/A | Manages app lifecycle |

### Health Endpoints

| Endpoint | Purpose | Example Response |
|----------|---------|------------------|
| `GET /api/health` | Full health status with uptime, version, services | `{ "status": "ok", "uptime": 123, ... }` |
| `GET /api/health/ready` | Readiness probe (checks critical services) | `{ "ready": true, "checks": { ... } }` |
| `GET /api/health/live` | Liveness probe (is the process alive?) | `{ "alive": true, "pid": 12345 }` |

### Environment

Preview mode uses `.env.preview`, which sets:
- `VIBECODE_ENV=preview`
- `VIBECODE_CHANNEL=beta`
- `VIBECODE_HEALTH_PORT=9876`
- Separate workspace/memory/session directories (isolated from dev)

### When to use it

- Testing how the app behaves under process supervision
- Verifying health check endpoints work correctly
- Running the app as a long-lived process without a terminal attached
- Validating the production build in a staging environment

### When NOT to use it

- Day-to-day development (use Dev mode)
- Building distributable packages (use `npm run dist`)
- Running alongside Dev mode (they share port 5173 for Vite)

---

## Watchdog

The watchdog is an optional process monitor that watches the VibeCode health endpoint and restarts the app via PM2 if it becomes unresponsive. It is disabled by default and requires explicit activation.

### What it does

- Periodically checks the `/api/health/live` endpoint
- After 3 consecutive failures, triggers a PM2 restart
- Enforces a restart budget (5 restarts per 10-minute window)
- Enters a cooldown period if the budget is exhausted
- Logs all events to `logs/watchdog.log`

### How to start

```bash
npm run watchdog:start          # foreground mode
node watchdog.js --enable --daemonize  # background mode
```

### How to check status

```bash
npm run watchdog:status
```

### How to stop

```bash
npm run watchdog:stop
```

### Prerequisites

The watchdog requires:
1. PM2 to be running with the VibeCode process
2. The health server to be active (port 9876)

Without these, the watchdog will detect failures but cannot restart anything.

### When to use it

- Long-running staging environments
- Testing crash recovery behavior
- Ensuring the app stays alive during automated testing

### When NOT to use it

- During normal development (unnecessary overhead)
- Without PM2 running (it cannot restart the app)
- If you are actively debugging crashes (it will auto-restart and hide the issue)

---

## Production Mode

Production mode builds distributable packages for end-user installation. It does not run the app under supervision or with any development infrastructure.

### How to build

```bash
npm run dist          # current platform
npm run dist:mac      # macOS (DMG + ZIP)
npm run dist:win      # Windows (NSIS + Portable)
npm run dist:linux    # Linux (AppImage + DEB)
```

### What it produces

| Platform | Output | Location |
|----------|--------|----------|
| macOS | `.dmg`, `.zip` | `dist-electron/` |
| Windows | `.exe` (NSIS), `.exe` (Portable) | `dist-electron/` |
| Linux | `.AppImage`, `.deb` | `dist-electron/` |

### Environment

Production builds use the `stable` release channel. The health server is only active if `VIBECODE_HEALTH_PORT` is set in the production environment (it is not set by default in the packaged app).

---

## Complete Command Reference

### Core Commands

| Command | What it does | When to use |
|---------|-------------|-------------|
| `npm run dev` | Start Vite + Electron with hot-reload | Daily development |
| `npm run build` | Compile all TypeScript + build renderer | Before testing production output |
| `npm run test` | Run all vitest tests | After code changes, before commits |
| `npm run lint` | Run ESLint on source files | After code changes, before commits |

### Preview Layer

| Command | What it does | When to use |
|---------|-------------|-------------|
| `npm run preview:start` | Build + start under PM2 with health server | Testing supervised mode |
| `npm run preview:stop` | Stop and delete PM2 process | Done testing preview mode |
| `npm run preview:restart` | Restart the PM2 process | After config changes |
| `npm run preview:logs` | Tail PM2 logs | Debugging preview mode |
| `npm run preview:status` | Show PM2 process list | Checking if preview is running |

### System Layer

| Command | What it does | When to use |
|---------|-------------|-------------|
| `npm run health` | Check `/api/health` endpoint | Is the app alive in preview mode? |
| `npm run health:ready` | Check readiness probe | Are all services initialized? |
| `npm run health:live` | Check liveness probe | Is the process responding? |
| `npm run watchdog:start` | Start the watchdog monitor | Long-running preview sessions |
| `npm run watchdog:status` | Check if watchdog is running | Is the watchdog active? |
| `npm run watchdog:stop` | Stop the watchdog | Done with watchdog |

### Diagnostics

| Command | What it does | When to use |
|---------|-------------|-------------|
| `npm run status` | Unified system status with failure analysis | Any time you need to understand the system or diagnose issues |
| `npm run status:json` | Same as above, in JSON format (includes failure object) | Scripting, monitoring, CI |
| `npm run ci` | typecheck + lint + test + build | Full validation before pushing |
| `npm run typecheck` | Run TypeScript compiler checks | Catching type errors |
| `npm run check:all` | Verify .env not staged, no secrets, .gitignore valid | Before committing |

### Build Sub-steps

| Command | What it does | When to use |
|---------|-------------|-------------|
| `npm run build:main` | Compile main process only | Debugging main process issues |
| `npm run build:preload` | Compile preload script only | Debugging preload issues |
| `npm run build:renderer` | Build Vite renderer only | Debugging renderer issues |
| `npm run pack` | Package without installer | Quick local package test |
| `npm run clean` | Remove build artifacts | Starting fresh |

---

## Failure Recovery

### Dev mode crashes

If the Electron app crashes in dev mode:
1. Check the terminal for error output
2. Restart: `Ctrl+C` then `npm run dev`
3. If the renderer crashes but the main process stays alive, the app will attempt automatic recovery
4. If session recovery is offered on relaunch, accept it to restore your previous state

### Preview mode crashes

If the app crashes under PM2:
1. PM2 will automatically restart it (up to 5 times within a 10-minute window)
2. Check logs: `npm run preview:logs`
3. Check health: `npm run health`
4. If PM2 itself is unresponsive: `npx pm2 kill` then `npm run preview:start`

### Watchdog triggers restart budget

If the watchdog hits the restart limit:
1. The watchdog enters a 5-minute cooldown
2. Check `logs/watchdog.log` for the root cause
3. Fix the underlying issue
4. Stop and restart the preview: `npm run preview:stop && npm run preview:start`

### Corrupted session state

If VibeCode fails to start due to corrupted session data:
```bash
rm -rf ~/.vibecode/sessions/*
npm run dev
```

### Corrupted memory store

If memory indexing fails:
```bash
rm -rf ~/.vibecode/memory/*
npm run dev
```

---

## Common Mistakes

### Running preview:start without installing PM2

PM2 is invoked via `npx`, so it will be downloaded automatically. However, if you want it globally available:

```bash
npm install -g pm2
```

### Running dev and preview simultaneously

Dev mode uses port 5173 for the Vite dev server. Preview mode runs the built app (not Vite). They can technically coexist, but the Electron app can only have one instance running at a time due to the single-instance lock. Stop one before starting the other.

### Forgetting to build before preview:start

`npm run preview:start` runs `npm run build` automatically. But if you run PM2 directly (bypassing the npm script), you must build first.

### Checking health in dev mode

The health server does not start in dev mode. `npm run health` will return "not responding" - this is expected, not an error.

### Running watchdog without PM2

The watchdog restarts the app via PM2. If PM2 is not managing the VibeCode process, the watchdog will detect failures but cannot restart anything. Always start preview mode first, then the watchdog.

---

## System Diagnostics & Debugging

### The `npm run status` command

This is the single command that explains the entire running system. It tells you what mode you are in, which processes are active, whether the health endpoint is responding, and grades overall system health as GREEN, YELLOW, or RED.

```bash
npm run status           # Human-readable status
npm run status:json      # JSON format for scripting
```

### When to run it

- **Before debugging** — understand what is actually running
- **After starting preview mode** — confirm everything came up healthy
- **When something feels wrong** — the grade tells you if there is a real problem
- **Before asking for help** — paste the output so others can see your state

### What the grade means

| Grade | Meaning | Action |
|-------|---------|--------|
| GREEN | All systems nominal for the current mode | None |
| YELLOW | Degraded — system works but something is suboptimal | Read `gradeReason`, decide if action is needed |
| RED | Critical failure — a core component is broken | Investigate immediately using the `gradeReason` field |

### How to interpret the output

Each section of the status output maps to a specific layer of the system:

1. **Mode** — Which operational mode VibeCode is running in and how it was detected
2. **Processes** — Which processes are running (Vite, Electron, PM2, Watchdog)
3. **Health** — Whether the health endpoint is reachable and what it reports
4. **Infrastructure** — Which infrastructure layers are expected to be active
5. **Ports** — Which ports are in use or expected

### Failure Intelligence

When the system is degraded (YELLOW or RED), `npm run status` automatically provides a **Failure Analysis** section that goes beyond simply reporting what is broken. This section includes:

1. **Category** — Classifies the failure type (e.g., `PM2_MISCONFIGURATION`, `HEALTH_SERVER_DOWN`)
2. **Likely Causes** — Best-effort list of possible root causes using conservative language ("likely", "may", "possible")
3. **Recommended Actions** — Step-by-step recovery suggestions, each with a command, purpose, and risk level
4. **Safe Recovery Path** — A minimal, deterministic, non-destructive sequence of commands to recover the system

The failure intelligence system is **strictly read-only**. It never executes fixes, restarts processes, or modifies system state. All recovery suggestions are optional recommendations for the developer to follow manually.

### What to do when the system is degraded

If `npm run status` shows YELLOW or RED:

1. Read the **Failure Analysis** section — it tells you the failure category, likely causes, and recovery steps
2. Follow the **Safe Recovery Path** exactly as listed — this is the minimal safe sequence to restore the system
3. If the issue persists after following the recovery path, check the **Recommended Actions** for additional diagnostic steps
4. Cross-reference with the mode — issues that are normal in DEV mode (no health endpoint) are critical in PREVIEW mode

For detailed failure categories, JSON schema, and troubleshooting reference, see [system-status.md](system-status.md).

---

## Debugging Flow

When something goes wrong, follow this sequence:

```
0. START HERE: Run npm run status
   --> Read the grade and gradeReason
   --> If GREEN: the system is healthy, look elsewhere
   --> If YELLOW/RED: read the Failure Analysis section
     --> It tells you the category, likely causes, and recovery steps
     --> Follow the Safe Recovery Path first

1. Is it a dev mode issue?
   --> Check terminal output for errors
   --> Run: npm run typecheck
   --> Run: npm run lint
   --> Run: npm run test

2. Is it a build issue?
   --> Run: npm run clean
   --> Run: npm run build
   --> Check for TypeScript errors

3. Is it a preview mode issue?
   --> Run: npm run preview:status
   --> Run: npm run preview:logs
   --> Run: npm run health
   --> Check: logs/pm2-error.log

4. Is it a runtime crash?
   --> Check: ~/.vibecode/sessions/ for crash markers
   --> Run: npm run dev (with DevTools open)
   --> Check: Application console for errors

5. Is it a health/watchdog issue?
   --> Run: npm run watchdog:status
   --> Check: logs/watchdog.log
   --> Verify: curl http://localhost:9876/api/health/live

6. Is it a CI issue?
   --> Run: npm run ci (local reproduction)
   --> Run: npm run check:all (pre-commit checks)
```

---

## Environment Files

| File | Mode | Secrets? | Tracked? |
|------|------|----------|----------|
| `.env.example` | Template | No (empty placeholders) | Yes |
| `.env.dev` | Dev mode template | No (empty placeholders) | Yes |
| `.env.preview` | Preview mode template | No (empty placeholders) | Yes |
| `.env.prod` | Production template | No (empty placeholders) | Yes |
| `.env` | Your actual config | Yes (real API keys) | **No** (gitignored) |

Never commit a `.env` file that contains real API keys. The pre-commit hook (`npm run check:env`) will block you if you try.
