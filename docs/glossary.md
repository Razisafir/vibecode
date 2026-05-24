# VibeCode Glossary

This document defines the specialized terminology used throughout the VibeCode codebase, documentation, and operational tooling. If you encounter an unfamiliar term, check here first.

---

## Core Concepts

### Approval Flow

The human-in-the-loop mechanism that requires explicit user consent before any AI-proposed action is executed. VibeCode has no auto-apply mode — every change to the filesystem requires the developer to review and approve it. This is the foundational safety constraint of the entire system. The approval flow works in concert with the Safety Guard, PathSandbox, and Runtime Safety Guard to form four independent layers of protection.

### Executor

One of seven execution step types that the Execution Engine can run after a proposal is approved. Executors are the only mechanisms through which VibeCode can modify the filesystem or run commands. The seven types are:

| Executor | What It Does |
|----------|-------------|
| `file_write` | Create or overwrite a file with new content |
| `file_read` | Read a file within the sandbox boundaries |
| `file_edit` | Make targeted edits to an existing file |
| `command` | Execute a shell command within the workspace |
| `code_generation` | Generate code from an AI-produced specification |
| `code_edit` | Apply AI-suggested modifications to existing code |
| `diff_apply` | Apply a structured diff to a file |

Each executor validates its inputs through the PathSandbox before execution and creates a rollback snapshot before making any changes.

### IPC Namespace

One of nine communication channels between the Electron main process and renderer process, exposed through the preload bridge via `contextBridge.exposeInMainWorld`. The nine namespaces are: `fs`, `terminal`, `provider`, `memory`, `session`, `execution`, `workspace`, `proposal`, and `app`. No communication between main and renderer occurs outside these defined channels.

### Proposal

A structured plan produced by the AI in response to a user request. A proposal includes: the list of files that will be affected, the sequence of execution steps, a risk assessment for each step, and a rollback plan. Proposals are presented to the user for review, modification, or rejection before any execution begins. The proposal system is the interface between the AI's intent and the execution engine's action.

### Rollback

The mechanism that reverses a previously executed step. VibeCode creates snapshots before each execution step, enabling per-step rollback. If a step fails, the system can undo just that step. If the user disapproves of a result, they can roll back any individual step or the entire plan. Rollback snapshots are persisted to `~/.vibecode/rollbacks/`.

---

## Safety Systems

### PathSandbox

The filesystem security boundary that validates all file operations before they execute. PathSandbox enforces a six-step validation pipeline: (1) resolve the path to its absolute form, (2) verify it is within the workspace root, (3) check it is not in a blocked directory, (4) check the file extension is not blocked, (5) verify the operation type is permitted, (6) execute. Blocked directories include `.ssh`, `.aws`, `.gnupg`, and credential stores. Blocked extensions include `.exe`, `.dll`, `.pem`, and `.key`.

### Safety Guard

The execution validation layer that checks every proposed action before it reaches the execution engine. The Safety Guard evaluates risk levels against user-configured thresholds, blocks high-risk operations without explicit approval, and tracks execution state to prevent duplicate or out-of-order execution. It is independent of the PathSandbox — both must pass for an action to proceed.

### Runtime Safety Guard

The regression detection layer that maintains baseline measurements of system behavior and blocks changes that would degrade known-good behavior. This guard compares current behavior against established baselines and prevents execution of steps that would cause regressions. It provides a third independent safety layer, ensuring that even if an action passes the Safety Guard and PathSandbox, it still cannot degrade system quality.

---

## Memory & Session

### JSONL Persistence

The storage format used for VibeCode's memory store. Facts are appended as JSON Lines entries to a file, enabling crash-safe writes via the atomic temp-file-then-rename pattern. JSONL is chosen over alternatives because it supports append-only writes (no file rewriting), crash safety (partial writes do not corrupt the entire file), and simple line-by-line parsing for reconstruction after a crash.

### Inverted Index

A data structure that maps terms to the memory entries that contain them, enabling fast text search across all stored memories. When a user asks a question, the inverted index quickly identifies which memory entries are relevant, rather than scanning every entry sequentially. The index is rebuilt on startup from the JSONL persistence files.

### LRU Cache

The Least Recently Used cache that manages memory entry eviction when the store exceeds its configured size limit. Entries that are accessed frequently stay in the cache; entries that have not been referenced recently are evicted first. The LRU policy ensures that the memory store does not grow unbounded while keeping the most useful entries available.

### Session

The complete state of a VibeCode interaction at a point in time, including the conversation history, execution plans, open files, and scroll positions. Sessions are auto-saved continuously using atomic writes. On crash, a recovery marker is written; on next launch, the user is offered a recovery prompt to restore the full session state.

### Crash Recovery

The mechanism that detects when VibeCode terminated unexpectedly (crash marker present) and offers to restore the previous session state. On clean shutdown, the crash marker is cleared. On crash, the marker persists, and the next launch detects it and prompts the user with the option to recover.

---

## Operational Modes

### DEV Mode

The default operational mode, activated by `npm run dev`. In DEV mode, VibeCode runs as a plain Electron + Vite development server with no process management, no health endpoint, and no monitoring. This is what developers use 99% of the time. Infrastructure that exists in Preview mode is intentionally absent here to keep the development loop fast and simple.

### PREVIEW Mode

The staging and testing mode, activated by `npm run preview:start`. In PREVIEW mode, VibeCode runs under PM2 process supervision with the health check HTTP server enabled on port 9876. The watchdog is available but not auto-started. PREVIEW mode uses isolated environment files and data directories to prevent interference with DEV mode.

### PRODUCTION Mode

The distribution mode, activated by `npm run dist`. In PRODUCTION mode, VibeCode is built into signed, installable packages (DMG, EXE, AppImage) with no development dependencies and hardened safety rules. The health server is only active if `VIBECODE_HEALTH_PORT` is explicitly set.

---

## Observability

### Health Grade

The overall system health assessment reported by `npm run status`, expressed as one of three values:

| Grade | Meaning |
|-------|---------|
| GREEN | All systems nominal for the current mode |
| YELLOW | Degraded — system works but something is suboptimal |
| RED | Critical failure — a core component is broken |

### Failure Category

A classification of a system problem, used by the failure intelligence layer to provide structured diagnostic guidance. The seven categories are: `PROCESS_FAILURE`, `PORT_CONFLICT`, `HEALTH_SERVER_DOWN`, `PM2_MISCONFIGURATION`, `WATCHDOG_INSTABILITY`, `SERVICE_DEGRADATION`, and `UNKNOWN_STATE`. Each category includes likely causes, recommended actions with risk levels, and a safe recovery path.

### Failure Intelligence

The read-only diagnostic system that analyzes degraded or critical system states and provides structured guidance including the failure category, likely root causes, recommended actions, and a safe recovery path. The failure intelligence layer never modifies system state — it only observes and suggests.

### Status Provider

The TypeScript module at `src/main/system/status-provider.ts` that implements all observability logic: mode detection, process state collection, health checking, health grading, and failure analysis. It is exposed to users through `npm run status` (human-readable) and `npm run status:json` (machine-readable).

---

## Infrastructure

### PM2

The process manager used in PREVIEW mode to supervise the VibeCode Electron process. PM2 provides auto-restart on crash (with budget limits), process status reporting, and log management. PM2 is never invoked in DEV mode and is activated only through `npm run preview:start`.

### Watchdog

An optional process monitor that watches the VibeCode health endpoint and restarts the app via PM2 if it becomes unresponsive. The watchdog enforces a restart budget (5 restarts per 10-minute window) and enters a cooldown period if the budget is exhausted. It requires explicit activation via `npm run watchdog:start` and is disabled by default.

### Health Server

An optional HTTP server inside the Electron process that provides liveness, readiness, and full health endpoints. The health server never starts without `VIBECODE_HEALTH_PORT` being set. In PREVIEW mode, it runs on port 9876 by default. In DEV mode, it is not active.

### Caddy

An optional reverse proxy for production deployments, configured via `Caddyfile`. Caddy is not included with VibeCode and must be installed separately. It is referenced in documentation for operators who need TLS termination or reverse proxying.

---

## Provider System

### Provider

An AI service that VibeCode integrates with for chat completions. Supported providers are OpenAI, Anthropic, Google Gemini, and Ollama (local). Each provider requires an API key (except Ollama), which is stored locally on the user's device and never transmitted to VibeCode servers.

### Provider Routing

The algorithm that selects which provider to use for a given request. The scoring formula is: `score = (priority * 10) + (latency / 100) - availability_bonus`. Higher priority providers are preferred when multiple providers are available. Users can set provider priority in Settings.

### Provider Manager

The service at `src/main/services/provider-manager.ts` that manages AI provider configuration, routing, and failover. It handles API key storage, priority scoring, latency measurement, and automatic failover when a provider becomes unavailable.
