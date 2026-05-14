# VibeCode Architecture Overview

This document explains how VibeCode is built, how data flows through the system, and how each layer interacts with the others. It is intended for developers who want to understand the codebase structure before contributing or extending it.

---

## System Layers

VibeCode is organized into five distinct layers, each with a clear responsibility boundary. No layer reaches across another without going through a defined interface.

```
+===================================================================+
|                        DESKTOP RUNTIME                            |
|   Electron shell, window management, IPC bridge, lifecycle        |
+===================================================================+
              |                                      |
              v                                      v
+===========================+       +===========================+
|   AI EXECUTION LAYER     |       |   SESSION & MEMORY LAYER  |
|   Providers, proposals,  |       |   Persistence, context,   |
|   execution engine,      |       |   crash recovery,         |
|   safety guard, rollback |       |   JSONL store, LRU cache  |
+===========================+       +===========================+
              |                                      |
              +------------------+-------------------+
                                 |
                                 v
+===================================================================+
|                    OPERATIONAL INTELLIGENCE LAYER                  |
|   Health grading, failure analysis, status provider, diagnostics  |
+===================================================================+
                                 |
                                 v
+===================================================================+
|                      INFRASTRUCTURE LAYER                         |
|   PM2, health server, watchdog, env separation, Caddy (optional) |
+===================================================================+
```

---

## Layer Details

### 1. Desktop Runtime

The outermost layer. Electron provides the process model (main + renderer + preload), and Vite provides the development build pipeline.

| Component | Technology | Role |
|-----------|-----------|------|
| Main process | Electron + TypeScript | System access, file I/O, AI calls, process management |
| Renderer process | React + Vite + Tailwind | UI components, user interactions |
| Preload bridge | TypeScript (CommonJS) | IPC serialization, API exposure to renderer |

The main process and renderer never communicate directly. All communication flows through the preload bridge via IPC handlers organized into 9 namespaces.

```
  Main Process                          Renderer Process
  +------------------+                  +------------------+
  | ipc/             |   IPC Channel    | components/      |
  |   app-handlers   | <=============> |   AIPanel        |
  |   execution-     |   (async)       |   ProposalCard   |
  |   fs-handlers    |                  |   Workspace      |
  |   memory-handlers|                  |   ...            |
  |   provider-      |                  +------------------+
  |   proposal-      |                        |
  |   session-       |                        v
  |   terminal-      |                  +------------------+
  |   workspace-     |                  | hooks/           |
  +------------------+                  |   useAIChat      |
                                        |   useProposals   |
                                        |   useSession     |
                                        +------------------+
               ^                               
               |  contextBridge.exposeInMainWorld
        +------+------+
        |  preload.ts |  9 namespaces: fs, terminal, provider,
        +-------------+  memory, session, execution, workspace,
                         proposal, app
```

### 2. AI Execution Layer

This layer handles everything related to AI interaction: which provider to use, what to ask, how to structure the response, and how to execute the result safely.

```
  User Input
      |
      v
  +------------------+     +--------------------+
  | Provider Manager |---->| LLM (OpenAI,       |
  | (routing, keys)  |     |  Anthropic, Google, |
  +------------------+     |  Ollama)            |
      |                    +--------------------+
      v                            |
  +------------------+              | raw LLM response
  | LLM Response     |<-------------+
  | Parser            |
  +------------------+
      | structured proposals
      v
  +------------------+     +--------------------+
  | Proposal          |---->| User Approval      |
  | Generator         |     | (review / modify / |
  +------------------+     |  reject)            |
      |                    +--------------------+
      | approved                  ^
      v                           |
  +------------------+            |
  | Execution Engine |---step---->+
  | (ordered steps)  |            |
  +------------------+     +-----+------+
      |                    | Safety     |
      +---validate-------->| Guard      |
      |                    +------------+
      v
  +------------------+
  | Executors (7)    |
  |  file_write      |
  |  file_read       |
  |  file_edit       |
  |  command         |
  |  code_generation |
  |  code_edit       |
  |  diff_apply      |
  +------------------+
      |
      v  (on failure)
  +------------------+
  | Rollback Engine  |
  | (per-step undo)  |
  +------------------+
```

**Key safety properties:**
- The Safety Guard validates every step before execution
- The PathSandbox restricts all file operations to the project directory
- The Proposal Generator always creates a diff preview before execution
- Every execution step is independently reversible via the Rollback Engine

### 3. Session & Memory Layer

This layer provides continuity — both within a single session and across multiple sessions over time.

```
  +-------------------+       +-------------------+
  | Session Manager   |       | Memory Store      |
  |                   |       |                   |
  | - Auto-save      |       | - Store facts     |
  | - Crash detect   |       | - Search (semantic)|
  | - Recovery prompt|       | - Rank (importance)|
  | - Enhanced state |       | - Prune (LRU)     |
  +-------------------+       +-------------------+
        |                              |
        v                              v
  +-------------------+       +-------------------+
  | JSONL Persistence |       | Inverted Index    |
  | (append-only)     |       | + LRU Cache       |
  |                   |       | (eviction policy) |
  +-------------------+       +-------------------+
```

**Session persistence:**
- Sessions are auto-saved continuously (conversation, execution plans, open files, scroll positions)
- On crash, a recovery marker is written; next launch offers a recovery prompt
- Safe shutdown clears the crash marker

**Memory persistence:**
- Facts are stored as append-only JSONL entries (crash-safe writes via temp + rename)
- An inverted index enables fast text search
- An LRU cache with configurable size limit handles eviction
- Memory entries are ranked by importance, recency, and relevance

### 4. Operational Intelligence Layer

This layer provides system observability and failure intelligence. It is strictly read-only — it observes and interprets, but never modifies system state.

```
  System State (mode, processes, health, infrastructure)
      |
      v
  +---------------------------+
  | Status Provider           |
  |                           |
  | - detectMode()            |
  | - gradeSystemHealth()     |
  | - analyzeFailure()        |
  | - buildSystemStatus()     |
  +---------------------------+
      |                              |
      v                              v
  +------------------+    +-------------------+
  | Health Grading   |    | Failure Analysis  |
  | GREEN / YELLOW / |    | - Category        |
  | RED              |    | - Likely causes   |
  +------------------+    | - Actions (risk)  |
                          | - Recovery path   |
                          +-------------------+
```

**How failure intelligence works:**
1. The Status Provider collects system state (mode, process health, infrastructure status)
2. `gradeSystemHealth()` evaluates state against known thresholds → GREEN / YELLOW / RED
3. If degraded, `analyzeFailure()` pattern-matches against 7 known failure categories
4. Each failure category includes likely causes, recommended actions with risk levels, and a safe recovery path
5. All analysis is conservative: "likely cause", "may indicate", never "cause" or "definitely"

**Failure categories:** `PROCESS_FAILURE`, `PORT_CONFLICT`, `HEALTH_SERVER_DOWN`, `PM2_MISCONFIGURATION`, `WATCHDOG_INSTABILITY`, `SERVICE_DEGRADATION`, `UNKNOWN_STATE`

### 5. Infrastructure Layer

Optional operational infrastructure that activates only in Preview mode. Nothing in this layer runs in Dev mode unless explicitly enabled.

```
  +-------------------------------------------+
  |              PREVIEW MODE                  |
  |                                           |
  |  +--------+    +----------+    +--------+ |
  |  |  PM2   |    |  Health  |    | Watch- | |
  |  | Process |    |  Server  |    |  dog   | |
  |  | Manager |    | (port    |    |        | |
  |  |         |    |  9876)   |    |        | |
  |  +----+---+    +-----+----+    +---+----+ |
  |       |               |             |      |
  |       |    +----------+----------+  |      |
  |       +--->| /api/health          |<--+      |
  |            | /api/health/ready    |         |
  |            | /api/health/live     |         |
  |            +----------------------+         |
  |                                            |
  |  Environment: .env.preview                 |
  |  Data dir: ~/.vibecode-preview/            |
  +--------------------------------------------+

  +-------------------------------------------+
  |           DEV MODE (default)               |
  |                                           |
  |  +--------+    +----------+               |
  |  |  Vite  |    | Electron |               |
  |  | (5173) |    | + DevTools|               |
  |  +--------+    +----------+               |
  |                                           |
  |  No PM2, no health server, no watchdog    |
  |  Environment: shell vars or .env          |
  |  Data dir: ~/.vibecode/                   |
  +-------------------------------------------+
```

**Key safety constraints:**
- Health server never starts without `VIBECODE_HEALTH_PORT` set
- Watchdog never starts without `--enable` flag
- PM2 is never invoked by `npm run dev`
- All infrastructure is dormant by default

---

## Runtime Mode Flow

```
                    +------------------+
                    |   npm run dev    |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |   DEV MODE       |
                    |                  |
                    | - Vite hot-reload|
                    | - DevTools open  |
                    | - No infra       |
                    | - Fast iteration |
                    +------------------+

                    +------------------+
                    | npm run          |
                    | preview:start    |
                    +--------+---------+
                             |
                    build ---+
                             |
                             v
                    +------------------+
                    |  PREVIEW MODE    |
                    |                  |
                    | - PM2 managed    |
                    | - Health on 9876 |
                    | - Watchdog avail |
                    | - Isolated env   |
                    +--------+---------+
                             |
                    npm run status
                             |
                             v
                    +------------------+
                    |  GRADE: GREEN    |  All systems nominal
                    |  GRADE: YELLOW   |  Degraded + failure analysis
                    |  GRADE: RED      |  Critical + recovery path
                    +------------------+

                    +------------------+
                    | npm run dist     |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    | PRODUCTION MODE  |
                    |                  |
                    | - Signed packages|
                    | - Auto-update    |
                    | - No dev deps    |
                    | - Hardened safety|
                    +------------------+
```

---

## How Observability Works

```
  Running System
       |
       +---> Status Provider (read-only)
       |         |
       |         +---> detectMode()           Which mode? How detected?
       |         +---> collectProcessState()  What processes are running?
       |         +---> collectHealthLayer()   Is health endpoint responding?
       |         +---> detectInfrastructure() What infra is expected?
       |         +---> resolvePorts()         Which ports are in use?
       |         |
       |         +---> gradeSystemHealth()    GREEN / YELLOW / RED
       |         |
       |         +---> analyzeFailure()       (only when YELLOW/RED)
       |                   |
       |                   +---> Category classification
       |                   +---> Likely root causes
       |                   +---> Recommended actions + risk levels
       |                   +---> Safe recovery path
       |
       +---> npm run status       (human-readable)
       +---> npm run status:json  (machine-readable)
```

---

## How Failure Intelligence Works

When the system detects a degraded or critical state, the failure intelligence layer provides structured guidance:

```
  Degraded State Detected
       |
       v
  +------------------------------------------+
  | analyzeFailure()                          |
  |                                           |
  | Pattern-match against known failures:     |
  |                                           |
  |  Preview + no PM2    -> PM2_MISCONFIG     |
  |  Preview + no health -> HEALTH_SERVER_DOWN|
  |  Health error status  -> PROCESS_FAILURE  |
  |  High restart count   -> WATCHDOG_INSTAB  |
  |  Services down        -> SERVICE_DEGRAD   |
  |  Dev + no Electron    -> PROCESS_FAILURE  |
  |  No match             -> UNKNOWN_STATE    |
  +------------------------------------------+
       |
       v
  +------------------------------------------+
  | Failure Analysis Output                   |
  |                                           |
  | Category:     HEALTH_SERVER_DOWN          |
  | Confidence:   HIGH                        |
  | Likely Causes:                            |
  |   - App still starting up                 |
  |   - Health port bind failure              |
  |   - PM2 crash loop                        |
  | Recommended Actions:                      |
  |   - npm run preview:status (LOW risk)     |
  |   - npm run preview:logs   (LOW risk)     |
  |   - npm run preview:restart(LOW risk)     |
  | Safe Recovery Path:                       |
  |   1. npm run preview:stop                 |
  |   2. npm run preview:start                |
  |   3. npm run status                       |
  +------------------------------------------+
```

**Critical safety constraint:** The failure intelligence layer is strictly read-only. It never executes fixes, restarts processes, or modifies system state. All recommendations are suggestions for the developer to follow manually.

---

## Data Flow Summary

```
  User                    AI                    System
   |                      |                      |
   |--- "Add error    --->|                      |
   |    handling to   --->|                      |
   |    auth.ts"      --->|                      |
   |                      |                      |
   |                      |-- analyze project -->|
   |                      |-- recall memory --->|
   |                      |                      |
   |<-- Proposal ------<--|                      |
   |    (3 files,         |                      |
   |     5 steps,         |                      |
   |     LOW risk)        |                      |
   |                      |                      |
   |--- Approve ------->--|                      |
   |                      |                      |
   |                      |-- validate safety -->|
   |                      |-- execute step 1 --->|  (file_read)
   |                      |-- execute step 2 --->|  (file_edit)
   |                      |-- execute step 3 --->|  (command)
   |                      |-- execute step 4 --->|  (file_write)
   |                      |-- execute step 5 --->|  (diff_apply)
   |                      |                      |
   |<-- Results -------<--|                      |
   |                      |                      |
   |                      |-- update memory ---->|
   |                      |-- save session ----->|
   |                      |                      |
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Repository Map](repository-map.md) | Where everything lives in the codebase |
| [System Philosophy](system-philosophy.md) | Why VibeCode is designed this way |
| [Operational Guide](operational-guide.md) | How to run VibeCode in every mode |
| [System Status](system-status.md) | Status command reference and failure categories |
| [Operational Safety](operational-safety.md) | Guardrails, mode compatibility, safety constraints |
| [Glossary](glossary.md) | Terminology reference |
| [FAQ](faq.md) | Frequently asked questions |
| [Documentation Hub](README.md) | Documentation index and navigation |
