# Operational Safety & Guardrails

This document defines what is safe to run, what requires explicit activation, and what combinations of features should never be enabled together. Following these rules prevents accidental damage, data loss, and misconfigured deployments.

---

## Safe Defaults

These rules are enforced by the system. You do not need to remember them - the code ensures they are followed.

| Rule | Enforcement |
|------|-------------|
| Health server never starts without `VIBECODE_HEALTH_PORT` | Code check in `health-server.ts` |
| Watchdog never starts without `--enable` flag | CLI argument validation in `watchdog.js` |
| PM2 is never invoked by `npm run dev` | Script isolation in `package.json` |
| `.env` files with real keys are blocked from commits | Pre-commit hook via `check:env` |
| Secret patterns are blocked from commits | Pre-commit hook via `check:secrets` |
| CI gate: typecheck + lint + test + build must all pass | `npm run ci` script |

---

## Mode Compatibility Matrix

| Feature | Dev | Preview | Production |
|---------|-----|---------|------------|
| Vite hot-reload | Yes | No | No |
| Electron DevTools | Auto-open | No | No |
| Health HTTP server | Off | On (port 9876) | Off by default |
| PM2 supervision | No | Yes | No |
| Watchdog | No | Optional | No |
| Source maps | Yes | No | No |
| `VIBECODE_DEBUG` | Enabled | Disabled | Disabled |
| Release channel | alpha | beta | stable |

---

## What NOT to Run in Production

These features are for development and testing only. They must not be enabled in production environments.

| Feature | Why Not | Risk Level |
|---------|---------|------------|
| `npm run dev` | No supervision, no health checks, DevTools exposed | Medium |
| Watchdog in daemon mode without PM2 | Cannot restart, creates orphan process | Low |
| `VIBECODE_DEBUG=1` | Exposes internal state in logs | Medium |
| Health server on a public interface | Information disclosure (version, PID, services) | High |
| PM2 watch mode in production | Restarts on any file change, causes instability | High |

---

## What Requires Explicit Enable Flags

Nothing in VibeCode's infrastructure auto-activates. Every optional feature requires an explicit action:

| Feature | Activation Method | Default |
|---------|-------------------|---------|
| Health server | `VIBECODE_HEALTH_PORT=9876` env var or `--health-port=9876` CLI arg | Off |
| PM2 supervision | `npm run preview:start` | Off |
| Watchdog monitor | `node watchdog.js --enable` or `npm run watchdog:start` | Off |
| Caddy proxy | `caddy run --config Caddyfile` | Off |
| PM2 watch mode | `watch: true` in `ecosystem.config.js` | Off |

---

## What Should Never Be Enabled Together

These combinations create conflicts, resource contention, or undefined behavior:

| Combination | Why | What to do instead |
|-------------|-----|--------------------|
| Dev mode + Preview mode simultaneously | Single-instance lock prevents two Electron processes | Stop one before starting the other |
| Watchdog + no PM2 | Watchdog cannot restart the app without PM2 | Always start preview mode before watchdog |
| PM2 watch + Watchdog | Both try to restart on file changes, creating restart loops | Use one or the other, not both |
| Health server on public IP | Exposes version, PID, and service status to the network | Bind to localhost (127.0.0.1) only |
| `.env.dev` in preview mode | Wrong environment (alpha channel, debug mode) | Use `.env.preview` for preview mode |
| `.env.prod` in dev mode | Production safety rules block features needed for debugging | Use `.env.dev` for dev mode |

---

## Environment File Rules

| File | Contains Secrets? | Tracked in Git? | When to Use |
|------|-------------------|-----------------|-------------|
| `.env.example` | No (empty placeholders) | Yes | Reference for available variables |
| `.env.dev` | No (empty placeholders) | Yes | Dev mode template |
| `.env.preview` | No (empty placeholders) | Yes | Preview mode template |
| `.env.prod` | No (empty placeholders) | Yes | Production template |
| `.env` | **Yes** (real API keys) | **No** (gitignored) | Your actual configuration |

**Rule:** Never commit a file containing real API keys. The `npm run check:env` pre-commit hook enforces this.

---

## Restart Budget

When the watchdog is active, it enforces a restart budget to prevent infinite restart loops:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Consecutive failures before restart | 3 | Avoids restarting on transient glitches |
| Max restarts per window | 5 | Prevents infinite crash-restart loops |
| Restart window | 10 minutes | Time window for restart budget |
| Cooldown duration | 5 minutes | Mandatory wait after budget exhausted |

If the watchdog exhausts its restart budget, it enters a cooldown period. During cooldown, it continues monitoring but does not restart the process. Check `logs/watchdog.log` to diagnose the root cause before re-enabling.

---

## Port Usage

| Port | Service | Mode | Notes |
|------|---------|------|-------|
| 5173 | Vite dev server | Dev only | `strictPort: true` - fails if occupied |
| 9876 | Health check HTTP | Preview only | Configurable via `VIBECODE_HEALTH_PORT` |
| 80/443 | Caddy reverse proxy | Manual only | Requires separate Caddy installation |

If port 5173 is occupied, the Vite dev server will fail to start. Kill the process using that port or change the port in `vite.config.ts`.

---

## Data Directory Safety

VibeCode stores all user data in `~/.vibecode/`. In preview mode, it uses `~/.vibecode-preview/` for isolation.

| Directory | Contents | Safe to Delete? |
|-----------|----------|-----------------|
| `~/.vibecode/workspaces/` | Workspace metadata | Yes (workspaces will re-index) |
| `~/.vibecode/memory/` | Semantic memory store | Yes (AI will re-learn) |
| `~/.vibecode/sessions/` | Session state | Yes (loses unsaved progress) |
| `~/.vibecode/rollbacks/` | Pre-change snapshots | Yes (loses undo history) |

**Never manually edit files** in these directories while VibeCode is running. The app uses append-only writes and in-memory indexes. Manual edits can corrupt the internal state.
