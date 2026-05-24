# ARC 13 — SYSTEM TRUTH VERIFICATION REPORT

**Date**: 2026-05-16  
**Method**: Full static code audit — every claim traced to source code  
**Scope**: All 10 P0 tests from ARC 13 directive  

---

## VIBE_CODE_TRUTH_REPORT

### 1. CORE_STATE_MACHINE: **FAIL**

**Claim**: Only ONE execution system is active at runtime; ALL actions route into ESM.

**Evidence Found**:

| Action Type | Routes Through ESM? | Evidence |
|---|---|---|
| Plan/Step execution | YES | `sm:createPlan` → `sm:approvePlan` → `sm:executePlan` IPC chain works |
| Monaco edits | **NO** | `MonacoAIIntegration.ts` fires DOM events (`vibecode:ai-action`, `vibecode:change-accepted`) but has **zero code** creating `monaco_edit` ExecutionNodes |
| Terminal commands | **NO** | `TerminalPanel.tsx` uses xterm.js + node-pty; `terminal-handlers.ts` manages PTY sessions independently; **zero code** creating `terminal_command` ExecutionNodes |
| AI responses | **NO** | Provider chat goes through `provider:chatStream` IPC; **zero code** creating `ai_reasoning` ExecutionNodes |
| File mutations | **NO** | `fs:writeFile`, `fs:deleteFile` etc. go through `fs-handlers.ts` directly; **zero code** creating `file_mutation` ExecutionNodes |

**Verdict**: The ESM is a **plan execution engine**, not a universal execution backbone. Only explicitly-created plans route through it. All other actions bypass the graph entirely.

---

### 2. LEGACY_SYSTEMS: **FAIL**

**Claim**: `execution-engine.ts`, `execution-queue.ts`, `execution-persistence.ts` are truly unused.

**Evidence Found**:

| File | Exists? | Actively Used? | Details |
|---|---|---|---|
| `execution-engine.ts` | YES (709 lines) | **PARTIALLY** | IPC handlers commented out in `ipc/index.ts`, but `ExecutionPersistence` imports `ExecutionPlan` type from it |
| `execution-queue.ts` | YES (505 lines) | **NO** at IPC level | Not registered, but file exists with full class |
| `execution-persistence.ts` | YES (154 lines) | **YES** | `execution-state-machine.ts` line 12: `import { ExecutionPersistence } from './execution-persistence'` — **actively imported and instantiated** in ESM constructor |

**Critical Finding**: The ESM itself depends on the legacy `ExecutionPersistence` class, which in turn imports `ExecutionPlan` from `execution-engine.ts`. This creates a dependency chain: `ESM → ExecutionPersistence → ExecutionEngine`. The persistence layer stores `ExecutionPlan` objects (legacy format), NOT `ExecutionGraph`/`ExecutionNode` objects.

**LEGACY_USAGE_REPORT**:
- execution-engine: **TYPE DEPENDENCY** (ExecutionPlan type used by ExecutionPersistence)
- execution-queue: **UNUSED** at runtime but file still in codebase
- execution-persistence: **USED** (imported by ESM constructor)

---

### 3. TERMINAL_BINDING: **FAIL**

**Claim**: Every terminal command creates `ExecutionNode(type = terminal_command)` with stdout/stderr inside node.

**Evidence Found**:
- `TerminalPanel.tsx`: Uses `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-search` — **real xterm.js terminal** (not placeholder anymore)
- `terminal-handlers.ts`: Manages PTY sessions via `node-pty` or `child_process.spawn`
- Terminal IPC channels: `terminal:create`, `terminal:write`, `terminal:kill`, `terminal:resize` — all go through **terminal-handlers.ts**, NOT through ESM
- **ZERO code** anywhere that creates `terminal_command` ExecutionNodes when commands are typed
- The ESM defines `TerminalCommandData` type but it is never instantiated by the terminal system
- No risk scoring applied to user-typed commands
- No graph link to AI or UI actions

**Verdict**: Terminal operates as a completely independent subsystem with zero connection to the execution graph.

---

### 4. MONACO_BINDING: **FAIL**

**Claim**: Every edit generates `monaco_edit` node with original code, diff, region ID.

**Evidence Found**:
- `MonacoAIIntegration.ts`: 938 lines of sophisticated Monaco integration — inline diffs, ghost text, AI code actions, edit regions, execution highlights, diagnostics, accept/reject changes
- **Real Monaco editor** is used (imports from `monaco-editor`)
- But: **ZERO code** creates `monaco_edit` ExecutionNodes when user or AI edits code
- The module fires custom DOM events (`vibecode:ai-action`, `vibecode:change-accepted`, `vibecode:change-rejected`) but these are **never bridged to ESM**
- No `originalContent`/`newContent`/`region` data flows into execution graph
- No parent-child relationships created between Monaco edits and execution steps

**Verdict**: Monaco integration is visually impressive but graph-disconnected. Edits do not produce ExecutionNodes.

---

### 5. SAFETY_SYSTEM: **FAIL**

**Claim**: Safety derived ONLY from graph; dangerous commands blocked; no UI-only safety override.

**Evidence Found**:

**What works** (for ESM-routed execution only):
- ESM has 7 built-in `SAFETY_RULES` that evaluate on node creation
- Safety gate in `executePlan()` and `executeStep()`: blocks if `safetyScore <= 20`
- Auto-require approval for `safetyScore <= 60`
- `SafetyGuard` class in `runtime-safety-guard.ts` used by ESM executors
- Dangerous command patterns (rm -rf, sudo, curl|sh, etc.) detected and blocked

**What doesn't work**:
- Safety is **ONLY enforced when going through ESM's plan execution flow**
- Direct terminal commands (typed by user): **NO safety check, no graph node, no blocking**
- Direct file mutations via `fs:writeFile`: **NO safety check**
- Monaco edits: **NO safety check**
- AI chat responses: **NO safety check before execution**
- The `rm -rf /` test would PASS if routed through an ESM plan step, but **FAIL** if typed directly in terminal

**Verdict**: Safety is a plan-step gatekeeper, not a system-wide execution gatekeeper. It protects the ESM execution path but leaves all other action paths unprotected.

---

### 6. GRAPH_SINGULARITY: **CONDITIONAL PASS**

**Claim**: There is ONLY ONE execution graph in memory — `ExecutionStateMachine.graph`.

**Evidence Found**:
- At IPC level: Only `registerStateMachineHandlers(null)` is called; legacy `registerExecutionHandlers()` is commented out
- The ESM has a single `private graph: ExecutionGraph` with `nodes: Map<string, ExecutionNode>`
- No duplicate `ExecutionQueue` graph is active at runtime
- No duplicate `ExecutionEngine` plans Map is active at runtime
- No session-level execution graph exists

**However**:
- `execution-engine.ts` still exists with its own `private plans: Map<string, ExecutionPlan>`
- `execution-queue.ts` still exists with its own `private queue: QueueEntry[]`
- These are NOT instantiated at runtime through IPC, but could be imported directly by other modules
- `ExecutionPersistence` stores legacy `ExecutionPlan` format, not ESM `ExecutionGraph` format

**Verdict**: At the IPC-registered handler level, there IS only one graph. But the legacy state structures exist in code and are one import away from being reactivated.

---

### 7. IPC_COHERENCE: **FAIL**

**Claim**: ALL execution IPC routes go through `state-machine-handlers.ts`.

**Evidence Found**:

| IPC Channel | Goes Through ESM? | Actual Handler |
|---|---|---|
| `sm:createPlan`, `sm:executePlan`, etc. | YES | `state-machine-handlers.ts` |
| `terminal:create`, `terminal:write`, `terminal:kill` | **NO** | `terminal-handlers.ts` |
| `fs:readFile`, `fs:writeFile`, `fs:delete` | **NO** | `fs-handlers.ts` |
| `provider:chat`, `provider:chatStream` | **NO** | `provider-handlers.ts` |
| `proposal:generateFromResponse` | **NO** | `proposal-handlers.ts` |
| `workspace:analyze` | **NO** | `workspace-handlers.ts` |
| `execution:*` (legacy) | **DEPRECATED** | Routes to `sm:*` via preload wrappers |

**Verdict**: Only plan/step management IPC goes through ESM. Terminal, filesystem, AI provider, proposal, and workspace IPC all bypass ESM entirely. The `execution:*` legacy channels are properly routed to `sm:*` via deprecation wrappers in `preload.ts`.

---

### 8. UI_TRUTH: **PARTIAL PASS**

**Claim**: UI is PURELY derived from graph — no local UI memory of execution, no duplication.

**Evidence Found**:

**What works**:
- `ExecutionTimeline.tsx` uses `useExecutionStateMachine()` hook — reads from ESM graph
- `useExecutionStateMachine()` hook loads graph via `sm:getGraph` and subscribes to `sm:event` push events
- No local execution state in Timeline component
- `useExecutionSafety()` is deprecated and delegates to ESM
- `ExecutionPanel.tsx` wraps `ExecutionTimeline` — also graph-derived

**What doesn't work**:
- `TerminalPanel.tsx` has its own tab state, command history, PTY session tracking — **not derived from graph**
- `MonacoAIIntegration.ts` tracks changes independently via `WeakMap<editor, TrackedChange>` — **not derived from graph**
- AI chat panel maintains its own message state — **not derived from graph**
- The "Execution Timeline" IS the single mental model, but it only shows ESM plan nodes — terminal commands, Monaco edits, and AI responses don't appear in it

**Verdict**: The Execution Timeline itself is graph-pure. But the rest of the UI (terminal, editor, chat) operates on its own state, not derived from the graph.

---

### 9. PERSISTENCE: **FAIL**

**Claim**: Execution graph survives restart.

**Evidence Found**:
- The ESM constructs `ExecutionPersistence` in its constructor: `this.persistence = new ExecutionPersistence()`
- **But**: The ESM never calls `this.persistence.savePlan()`, `this.persistence.autoSave()`, or any persistence method
- `createNode()` — no persistence call
- `transitionNode()` — no persistence call  
- `updateNodeData()` — no persistence call
- `executePlan()` — no persistence call
- The `ExecutionPersistence` class stores `ExecutionPlan` objects (legacy type), NOT `ExecutionGraph` or `ExecutionNode` objects
- The ESM has no `saveGraph()` or `restoreGraph()` method
- On app restart, the ESM creates an empty graph: `nodes: new Map()`, `rootIds: []`
- **ALL execution history is lost on restart**

**Verdict**: The execution graph does NOT survive restart. The `ExecutionPersistence` import is a dead dependency — it's constructed but never used for saving ESM state.

---

### 10. END_TO_END_FLOW: **FAIL**

**Claim**: This chain always holds: `AI → ExecutionNode → Monaco → File System → Terminal → Safety → Graph`

**Evidence Found**:

The chain is **broken at every link** except the plan execution path:

1. **AI → ExecutionNode**: AI responses do NOT automatically create `ai_reasoning` nodes. AI chat goes through `provider:chatStream` → renderer state. No bridge to ESM.

2. **ExecutionNode → Monaco**: When ESM executes a `file_edit` or `code_generation` step, it writes to disk but does NOT update Monaco's editor content. Monaco reads from its own model, not from the graph.

3. **Monaco → File System**: Monaco edits update the editor model but do NOT go through ESM to reach the filesystem. Direct `fs:writeFile` calls bypass the graph.

4. **File System → Terminal**: No connection. File changes don't trigger terminal commands through the graph.

5. **Terminal → Safety**: Terminal commands bypass safety entirely. No `terminal_command` nodes are created, no safety scoring applied.

6. **Safety → Graph**: Safety scores are computed and stored on ESM nodes — this link works, but only for ESM-routed execution.

**The ONLY working end-to-end path**: User explicitly creates a plan via `sm:createPlan` → approves via `sm:approvePlan` → executes via `sm:executePlan` → steps execute with safety checks → results stored in graph.

---

## FINAL SCOREBOARD

```
VIBE_CODE_TRUTH_REPORT:

CORE_STATE_MACHINE: FAIL
LEGACY_SYSTEMS:     FAIL
TERMINAL_BINDING:   FAIL
MONACO_BINDING:     FAIL
SAFETY_SYSTEM:      FAIL
GRAPH_SINGULARITY:  CONDITIONAL PASS
IPC_COHERENCE:      FAIL
UI_TRUTH:           PARTIAL PASS
PERSISTENCE:        FAIL
END_TO_END_FLOW:    FAIL

OVERALL_STATUS: NOT_READY
```

---

## ROOT CAUSE ANALYSIS

The fundamental issue is that **ARC 11 and ARC 12 built the ExecutionStateMachine as a plan execution engine, not as a universal execution backbone**. The ESM is excellent at what it does — managing plans, steps, safety scoring, and rollback for explicit plan execution. But it was never wired as the mandatory routing layer for ALL system actions.

### What IS Real:
- **ESM core**: State machine with valid transitions, graph structure, event system — **REAL**
- **ESM executors**: `esm-executors.ts` with file_write, file_read, file_edit, file_delete, command, code_generation, diff_apply — **REAL and functional**
- **Safety rules**: 7 rules in ESM + SafetyGuard class with dangerous command detection — **REAL**
- **Safety gate**: Blocks execution at `safetyScore <= 20`, requires approval at `safetyScore <= 60` — **REAL**
- **IPC routing**: Legacy `execution:*` handlers removed from registration, replaced by `sm:*` — **REAL**
- **Preload deprecation wrappers**: All `execution.*` calls route to `sm:*` — **REAL**
- **ExecutionTimeline UI**: Graph-derived, event-subscribed, no local execution state — **REAL**
- **Terminal**: Real xterm.js + node-pty integration (no longer a placeholder) — **REAL**
- **Monaco**: Real Monaco editor with AI integration (no longer a textarea) — **REAL**
- **Diff engine**: Real LCS algorithm — **REAL**
- **Multi-provider LLM**: Real streaming for OpenAI, Anthropic, Gemini, Ollama, LM Studio — **REAL**

### What IS NOT Real:
- **Monaco → ESM binding**: Edits don't create graph nodes
- **Terminal → ESM binding**: Commands don't create graph nodes
- **AI → ESM binding**: Responses don't create graph nodes
- **FS → ESM binding**: File mutations don't create graph nodes
- **ESM persistence**: Graph doesn't survive restart
- **System-wide safety gatekeeping**: Safety only protects ESM-routed execution
- **Legacy file elimination**: `execution-engine.ts`, `execution-queue.ts` still exist; `execution-persistence.ts` is actively used

### The Gap:
ARC 11 + ARC 12 defined the ESM as "the ONLY execution system allowed" but implemented it as "the plan execution system." The difference is critical:
- **What was built**: ESM = plan lifecycle manager (create → approve → execute → complete/rollback)
- **What was promised**: ESM = universal execution backbone where EVERY action creates a graph node

---

## RECOMMENDED FIX PRIORITIES

1. **Bridge Terminal → ESM**: When user types a command in terminal, create `terminal_command` ExecutionNode with command, stdout, stderr, exitCode
2. **Bridge Monaco → ESM**: When user/AI edits code, create `monaco_edit` ExecutionNode with region, original, diff
3. **Bridge AI → ESM**: When AI responds, create `ai_reasoning` ExecutionNode with provider, model, prompt, response
4. **Bridge FS → ESM**: When file is created/edited/deleted, create `file_mutation` ExecutionNode
5. **Implement ESM persistence**: Save/restore `ExecutionGraph` (not `ExecutionPlan`) to disk
6. **Elevate safety to system gatekeeper**: Intercept ALL actions (terminal, file, AI) through ESM before execution
7. **Remove legacy files**: Delete `execution-engine.ts`, `execution-queue.ts`; refactor `execution-persistence.ts` to work with ESM types
8. **Route ALL IPC through ESM**: Terminal, FS, and AI provider handlers should create graph nodes
