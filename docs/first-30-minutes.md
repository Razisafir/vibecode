# First 30 Minutes with VibeCode

This guide walks you through everything you need to do, understand, and verify within your first 30 minutes with the VibeCode codebase. By the end, you will have a working app, understand the operational modes, and know how to diagnose and recover from failures.

---

## Minute 0-5: Clone and Install

```bash
# Clone the repository
git clone https://github.com/Razisafir/vibecode.git
cd vibecode/vibecode-desktop

# Install dependencies (this may take a minute)
npm install
```

**What just happened:**
- You cloned the monorepo and entered the `vibecode-desktop/` directory, which contains the entire application
- `npm install` downloaded Electron, React, Vite, TypeScript, and all development tools
- The `node-pty` package may show optional dependency warnings — this is normal and does not affect functionality

**If install fails:**
- Ensure Node.js 20.x is installed (`node --version`, see `.nvmrc`)
- Try `npm install --legacy-peer-deps` if there are peer dependency conflicts
- Check [troubleshooting.md](troubleshooting.md) for common issues

---

## Minute 5-10: Build and Run

```bash
# Start VibeCode in development mode
npm run dev
```

**What you should see:**
1. A Vite dev server starts on port 5173
2. The TypeScript compiler runs for the main process
3. An Electron window opens with the VibeCode UI
4. Chrome DevTools open automatically

**First-launch setup:**
The app will walk you through a brief onboarding:
1. **Choose an AI provider** — Enter an API key for OpenAI, Anthropic, or Google Gemini. Or select Ollama for fully offline use.
2. **Select a workspace** — Point VibeCode at a project directory on your machine.
3. **Start a conversation** — You're ready to go.

**If the app doesn't start:**
- Check the terminal for TypeScript compilation errors
- Run `npm run typecheck` to see if there are type errors
- Run `npm run clean && npm run dev` to start fresh

---

## Minute 10-15: Understand the Architecture

VibeCode has five layers. You don't need to understand every detail, but knowing what each layer does will help you navigate the codebase.

```
  +---------------------------------------------------------------+
  |  DESKTOP RUNTIME    Electron + React + Vite + Preload bridge   |
  +---------------------------------------------------------------+
           |                              |
  +--------------------+    +-------------------------+
  | AI EXECUTION LAYER |    | SESSION & MEMORY LAYER  |
  | Proposals, safety, |    | Persistence, recovery,  |
  | execution, rollback|    | JSONL store, LRU cache  |
  +--------------------+    +-------------------------+
           |                              |
  +---------------------------------------------------------------+
  |  OPERATIONAL INTELLIGENCE   Status, grading, failure analysis  |
  +---------------------------------------------------------------+
           |
  +---------------------------------------------------------------+
  |  INFRASTRUCTURE             PM2, health, watchdog (optional)   |
  +---------------------------------------------------------------+
```

**Where things live:**
- `src/main/` — The Electron main process (AI logic, file operations, services)
- `src/renderer/` — The React UI (components, hooks, styles)
- `src/preload/` — The bridge between main and renderer (IPC serialization)
- `src/main/system/` — Operational intelligence (status provider, failure map)
- `src/main/services/` — Core services (execution engine, memory store, sandbox)

Read the full [Architecture Overview](architecture-overview.md) when you have time.

---

## Minute 15-20: Understand the Three Modes

VibeCode has three operational modes. Each activates different infrastructure and serves a different purpose.

### DEV mode (what you're using now)

```bash
npm run dev
```

- Vite hot-reload on port 5173
- DevTools open
- No process manager, no health server, no watchdog
- This is what you use 99% of the time as a developer

### PREVIEW mode (staging/testing)

```bash
npm run preview:start
```

- Builds the app first, then runs under PM2 supervision
- Health check HTTP server on port 9876
- Watchdog available for auto-restart on crash
- Isolated environment (separate `.env.preview`, separate data directory)

### PRODUCTION mode (distribution)

```bash
npm run dist
```

- Produces signed, installable packages (DMG, EXE, AppImage)
- No development dependencies
- Hardened safety rules, stable release channel

**Key principle:** Infrastructure is opt-in, never opt-out. Nothing activates without you explicitly requesting it.

---

## Minute 20-25: Run the Status Command

The status command is your diagnostic companion. It tells you everything about the running system in one output.

```bash
npm run status
```

**What you should see (in DEV mode with app running):**

```
  VibeCode System Status
  ────────────────────────────────────────────────

  Overall:   GREEN  All systems nominal

  Mode:      DEV  (default (no mode indicators found))
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
```

**For machine-readable output:**
```bash
npm run status:json    # JSON format for scripting
```

---

## Minute 25-30: Simulate a Failure and Recover

Let's intentionally create a degraded state and see how the system responds.

### Step 1: Stop the app

Close the Electron window, or press Ctrl+C in the terminal to stop `npm run dev`.

### Step 2: Run status

```bash
npm run status
```

You should now see a YELLOW grade because the Electron process is no longer running:

```
  Overall:   YELLOW  Electron process not detected — may be starting up or stopped

  ...

  Failure Analysis
  ────────────────────────────────────────────────

  Category:    PROCESS_FAILURE
  Confidence:  LOW

  Likely Causes:
  - Electron process not yet started — may still be compiling TypeScript
  - The app was closed or crashed — check terminal for error output
  - Another Electron instance may be preventing startup (single-instance lock)

  Recommended Actions:
  - npm run dev
    Restart dev mode if the app is not running
    Risk: LOW
  - npm run typecheck
    Check for TypeScript compilation errors that may prevent startup
    Risk: LOW
  - npm run clean && npm run dev
    Clean build artifacts and restart if issues persist
    Risk: LOW

  Safe Recovery Path:
  1. npm run clean
  2. npm run dev
```

### Step 3: Follow the safe recovery path

```bash
npm run clean
npm run dev
```

### Step 4: Verify recovery

```bash
npm run status
```

You should see GREEN again.

**What you just learned:**
- The status command detects degraded states automatically
- It provides structured failure analysis with likely causes
- It gives you a safe recovery path that is deterministic and non-destructive
- The system never auto-fixes — it suggests, you decide

---

## What's Next?

You now have a working VibeCode setup and understand the fundamentals. Here's where to go from here:

| Want to... | Read this |
|-----------|-----------|
| Understand the full architecture | [Architecture Overview](architecture-overview.md) |
| Understand why VibeCode is designed this way | [System Philosophy](system-philosophy.md) |
| Navigate the codebase | [Repository Map](repository-map.md) |
| Learn all commands and modes | [Operational Guide](operational-guide.md) |
| Understand safety constraints | [Operational Safety](operational-safety.md) |
| Reference failure categories and JSON schema | [System Status](system-status.md) |
| Configure AI providers and environment | [Configuration](configuration.md) |
| Fix a specific problem | [Troubleshooting](troubleshooting.md) |

---

## Quick Command Reference

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev mode (Vite + Electron) |
| `npm run build` | Build all TypeScript + renderer |
| `npm run test` | Run all tests (82 tests across 5 files) |
| `npm run lint` | Run ESLint on source files |
| `npm run status` | System status with failure analysis |
| `npm run status:json` | Same in JSON format |
| `npm run ci` | Full CI: typecheck + lint + test + build |
| `npm run typecheck` | Run TypeScript compiler checks only |
| `npm run clean` | Remove build artifacts |
| `npm run preview:start` | Start under PM2 with health server |
| `npm run preview:stop` | Stop PM2 process |
| `npm run dist` | Build installable package |
