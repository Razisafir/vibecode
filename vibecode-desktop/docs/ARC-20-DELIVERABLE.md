# ARC 20 — AI IDE PRODUCTIZATION + USER EXPERIENCE LAYER

## Deliverable Document

**Date**: 2026-05-16  
**ARC**: 20 — System Consolidation → Productization  
**Status**: IMPLEMENTATION IN PROGRESS  

---

## 1. PRODUCT ARCHITECTURE MAP

### Before Consolidation (ARC 13-19)

```
User → AI Panel → ExecutionGateway → ESM → Kernel → FS/Terminal/Process
                ↘ IPC Layer (24+ channels)
                ↘ Audit System (separate)
                ↘ Safety System (separate)
                ↘ Session Manager (disconnected)
                ↘ Memory Store (disconnected)
                ↘ Workspace Analyzer (one-shot)

Problems:
- AI flow is request/response, not collaborative
- Workspace context requires manual prompting
- Terminal is "tracked" but not "intelligent"
- No session continuity across restarts
- Internal architecture exposed to users
- No competitive differentiation features
```

### After Productization (ARC 20)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER EXPERIENCE LAYER                        │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ AI Panel │  │ Monaco AI    │  │ Terminal AI  │  │ Timeline   │ │
│  │ (Agent)  │  │ (Streaming)  │  │ (Intelligent)│  │ (Replay)   │ │
│  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│       │               │                  │                │        │
│  ┌────┴───────────────┴──────────────────┴────────────────┴──────┐ │
│  │                    PRODUCT API SURFACE                         │ │
│  │   "Ask AI" | "Edit Code" | "Run Task" | "Go Back"           │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────┴─────────────────────────────────────┐ │
│  │                  INTELLIGENCE LAYER                           │ │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │ │
│  │  │ Agent Runtime    │  │ Workspace Context │                 │ │
│  │  │ (lifecycle mgmt) │  │ (live awareness)  │                 │ │
│  │  └────────┬─────────┘  └────────┬──────────┘                 │ │
│  │  ┌────────┴──────────┐  ┌───────┴──────────┐                 │ │
│  │  │ Terminal Intel    │  │ Session Memory    │                 │ │
│  │  │ (diagnosis/fix)   │  │ (cross-session)   │                 │ │
│  │  └───────────────────┘  └──────────────────┘                  │ │
│  └────────────────────────┬─────────────────────────────────────┘ │
│                           │                                         │
│  ┌────────────────────────┴─────────────────────────────────────┐ │
│  │              EXECUTION FOUNDATION (ARC 13-19)                 │ │
│  │  ExecutionGateway → ESM → Kernel → FS/Terminal/Process       │ │
│  │  (ONE pipeline, ONE graph, ONE authority)                     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              COMPETITIVE DIFFERENTIATION                      │ │
│  │  Execution Replay | Branching | Deterministic Rollback       │ │
│  │  Autonomous Debug Loop | Workspace Reasoning Graph            │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. AI RUNTIME ARCHITECTURE

### Agent Lifecycle States

```
idle → thinking → planning → executing → validating → completed
                 ↘           ↘ retrying ↗             ↘ failed
                  ↘           ↘ blocked ↗
                   ↘ reflecting ↗
```

| State | User-Facing Label | What Happens |
|-------|-------------------|--------------|
| `idle` | Ready | No active task |
| `thinking` | Thinking... | AI analyzes request, forms strategy |
| `planning` | Making a plan | Multi-step execution plan created |
| `executing` | Working on it | Steps executed through ESM pipeline |
| `validating` | Checking results | Each step result verified |
| `retrying` | Trying a different approach | Failed step retried with adapted params |
| `reflecting` | Reviewing work | Self-evaluation after completion |
| `completed` | Done | Task finished successfully |
| `blocked` | Needs your input | Awaiting user approval |
| `failed` | Something went wrong | Task couldn't be completed |

### Workspace Context Pipeline

```
Editor Events ──────┐
Terminal Events ────┤
Execution Events ───┤──→ WorkspaceContextService ──→ Compressed Context ──→ AI System Prompt
Git State ──────────┤     (live state)               (token-efficient)      (auto-injected)
Memory Events ──────┘
```

The AI automatically knows:
- Which files matter (relevance ranking)
- What changed recently (edit tracking)
- Where bugs likely originate (error correlation)
- What the user is trying to do (intent detection)

---

## 3. WORKSPACE CONTEXT PIPELINE

### Relevance Scoring Formula

```
score = (isActive ? 0.4 : 0) +
        (isOpen ? 0.25 : 0) +
        (isDirty ? 0.15 : 0) +
        min(editCount / 20, 0.2) +
        decay(lastModified, halfLife=10min) * 0.15 +
        (isSourceFile ? 0.05 : 0) +
        (isDependencyOfActive ? 0.1 : 0)
```

### Token Budget

| Context Section | Max Tokens | Priority |
|----------------|------------|----------|
| Project summary | 50 | Always |
| Active file context | 500 | Always |
| Key files (top 10) | 300 | High |
| Recent activity | 200 | High |
| Error context | 300 | Conditional (errors exist) |
| User intent | 100 | Conditional (detected) |
| Active objectives | 150 | Conditional (exist) |
| **Total** | **~1,600** | Fits in system prompt |

---

## 4. UX REDESIGN PLAN

### Terminology Map (Hide Internals → Show Products)

| Internal Term | User-Facing Term | Where |
|--------------|------------------|-------|
| ExecutionNode | Task / Action | UI labels |
| ExecutionStateMachine | (hidden) | Never shown |
| ExecutionGateway | (hidden) | Never shown |
| Kernel | (hidden) | Never shown |
| ESM Graph | Timeline / History | Timeline panel |
| Safety Score | Risk Level | Proposal cards |
| NodeState | Status | Status indicators |
| Plan | Task | Agent status |
| Step | Step | Progress list |
| `sm:*` IPC | (hidden) | Never shown |
| `ai_reasoning` | AI Response | Chat panel |
| `terminal_command` | Command | Terminal |
| `file_mutation` | File Change | File explorer |
| `monaco_edit` | Edit | Editor |

### What to REMOVE from Current UI

1. **Execution Panel** (`ExecutionPanel.tsx`) — Replace with AgentStatus component
2. **Safety Indicator** (`SafetyIndicator.tsx`) — Merge into ProposalCard as simple risk badge
3. **Execution Timeline** (`ExecutionTimeline.tsx`) — Replace with Replay Timeline (P0-8)
4. **Memory Panel** (`MemoryPanel.tsx`) — Redesign as "Context & History" panel
5. **"Execution State Machine"** references in any user-visible text
6. **"Gateway"** references in any user-visible text
7. **"Kernel"** references in any user-visible text

### What to ADD

1. **AgentStatus component** — Shows current AI lifecycle state with product-friendly labels
2. **TerminalIntelligenceOverlay** — Command analysis, risk warnings, fix suggestions
3. **Streaming AI Editor** — Ghost edits appear character-by-character in Monaco
4. **Replay Timeline** — Execution timeline with branching and rollback controls
5. **Context Indicator** — Small indicator showing what workspace context the AI has

---

## 5. COMPETITIVE ANALYSIS

### VibeCode vs Cursor vs Windsurf vs Cline

| Feature | VibeCode | Cursor | Windsurf | Cline |
|---------|----------|--------|----------|-------|
| **Execution Graph** | ✅ Full graph with causal links | ❌ No execution graph | ❌ No execution graph | ❌ No execution graph |
| **Deterministic Rollback** | ✅ Via execution graph + snapshots | ⚠️ Undo (basic) | ⚠️ Undo (basic) | ⚠️ Undo (basic) |
| **Execution Branching** | ✅ Branch from any checkpoint | ❌ Not available | ❌ Not available | ❌ Not available |
| **Timeline Replay** | ✅ Step-by-step replay | ❌ Not available | ❌ Not available | ❌ Not available |
| **Autonomous Agent Loop** | ✅ With lifecycle states | ⚠️ Agent mode (basic) | ✅ Cascade (basic) | ⚠️ Agent mode |
| **Workspace Context Engine** | ✅ Live awareness, auto-injected | ⚠️ @codebase (manual) | ⚠️ Context (basic) | ⚠️ Context (manual) |
| **Terminal Intelligence** | ✅ Pre/post command analysis | ❌ Integrated terminal only | ❌ Integrated terminal only | ⚠️ Basic command execution |
| **Session Memory** | ✅ Cross-session objectives/patterns | ❌ Per-session only | ❌ Per-session only | ❌ Per-session only |
| **Streaming AI Edits** | ✅ Character-by-character | ⚠️ Diff-based | ⚠️ Diff-based | ⚠️ Diff-based |
| **Inline Reasoning** | ✅ Per-region reasoning annotations | ❌ Not available | ❌ Not available | ❌ Not available |
| **Bring Your Own AI** | ✅ 9 providers | ⚠️ Limited | ⚠️ Limited | ⚠️ Limited |
| **Multi-step Retry** | ✅ Adapt strategy on retry | ❌ Not available | ❌ Not available | ❌ Not available |
| **Command Risk Assessment** | ✅ Pre-execution intervention | ❌ Not available | ❌ Not available | ❌ Not available |
| **Failure Auto-Diagnosis** | ✅ Category + fix + auto-fix | ❌ Not available | ❌ Not available | ❌ Not available |

### Defensible Capabilities (What Others CANNOT Easily Copy)

1. **Execution Graph + Branching** — Requires fundamental architecture redesign; competitors lack causal execution tracking
2. **Deterministic Rollback** — Requires snapshot-based execution, not just undo; competitors use linear history
3. **Workspace Context Engine** — Requires live state tracking integrated with execution graph; competitors bolt on context as afterthought
4. **Session Memory** — Requires persistent cross-session intelligence; competitors reset on restart

---

## 6. FEATURE PRIORITIZATION MATRIX

| Feature | Impact | Effort | Priority | Status |
|---------|--------|--------|----------|--------|
| P0-1: Workspace Context Engine | HIGH | MEDIUM | **P0** | ✅ Implemented |
| P0-2: Agent Runtime | HIGH | HIGH | **P0** | ✅ Implemented |
| P0-3: Streaming AI Edits | HIGH | MEDIUM | **P0** | ✅ Implemented |
| P0-4: Terminal Intelligence | MEDIUM | MEDIUM | **P0** | ✅ Implemented |
| P0-5: Session Memory | HIGH | MEDIUM | **P0** | ✅ Implemented |
| P0-6: UX Cleanup | MEDIUM | LOW | **P0** | ✅ Implemented |
| P0-7: Performance Mode | MEDIUM | LOW | **P1** | Partial (debouncing exists) |
| P0-8: Execution Replay | HIGH | HIGH | **P0** | ✅ Implemented |

### Phase 1: Foundation (Current — ARC 20)
- All P0 services implemented
- IPC handlers registered
- UI components created
- Core architecture in place

### Phase 2: Integration (Next ARC)
- Wire services into main.ts initialization
- Connect WorkspaceContext to AI system prompt
- Connect AgentRuntime to proposal execution
- Connect TerminalIntelligence to terminal panel
- Connect SessionMemory to app lifecycle

### Phase 3: Polish
- Performance optimization (P0-7 targets)
- UX refinement based on testing
- Streaming edit latency tuning
- Context token budget optimization
- Replay timeline animation polish

---

## 7. TECHNICAL DEBT RISKS

### What Breaks During Simplification

| Risk | Severity | Mitigation |
|------|----------|------------|
| WorkspaceContextService not initialized before AI requests | HIGH | Lazy initialization with fallback to empty context |
| AgentRuntime conflicts with existing proposal flow | MEDIUM | AgentRuntime wraps ProposalGenerator; both coexist |
| Streaming edits conflict with existing diff system | MEDIUM | Streaming is additive; existing diff system still works |
| TerminalIntelligence adds latency before command execution | LOW | Analysis is async; command not blocked unless destructive |
| SessionMemory persistence fails on crash | MEDIUM | Auto-save with 3s debounce; crash dumps as fallback |
| ExecutionReplay branching complicates ESM graph | HIGH | Branches are metadata overlays; ESM graph is append-only |
| New IPC channels increase attack surface | MEDIUM | All new channels go through existing rate limiter |
| UI components reference non-existent IPC in current preload | HIGH | Must update preload.ts with new API surface |

### Critical Path Items

1. **Update `preload.ts`** — Add new IPC channels for all ARC 20 services
2. **Wire initialization in `main.ts`** — Create service instances on app startup
3. **Register `arc20-handlers.ts`** — Call `registerARC20Handlers()` in IPC setup
4. **Connect events** — Wire service events to IPC push notifications for renderer

---

## 8. NEW FILES CREATED

| File | Lines | Purpose |
|------|-------|---------|
| `src/main/services/workspace-context-service.ts` | ~500 | P0-1: Live workspace context engine |
| `src/main/services/agent-runtime.ts` | ~450 | P0-2: Autonomous agent with lifecycle states |
| `src/main/services/terminal-intelligence.ts` | ~450 | P0-4: Command analysis + failure diagnosis |
| `src/main/services/session-memory.ts` | ~450 | P0-5: Cross-session memory persistence |
| `src/main/services/execution-replay.ts` | ~450 | P0-8: Checkpoints, branching, timeline replay |
| `src/renderer/components/editor/StreamingAIEditor.ts` | ~350 | P0-3: Streaming edits + inline reasoning |
| `src/renderer/components/AgentStatus.tsx` | ~200 | P0-2/P0-6: Agent lifecycle status UI |
| `src/renderer/components/TerminalIntelligenceOverlay.tsx` | ~200 | P0-4: Terminal intelligence overlay UI |
| `src/main/ipc/arc20-handlers.ts` | ~280 | IPC handlers for all new services |

**Total new code**: ~3,330 lines  
**Total project**: ~44,000+ lines (up from ~41,000)

---

## 9. WHAT USERS SEE vs WHAT EXISTS

| User Sees | What Actually Exists |
|-----------|---------------------|
| "AI is thinking..." | AgentRuntime state: `thinking` |
| "AI is working on it" | AgentRuntime executing steps through ESM |
| "AI suggests: refactor this" | MonacoAIIntegration streaming edit |
| "This command might be dangerous" | TerminalIntelligence pre-execution analysis |
| "Fix available: npm install X" | TerminalIntelligence auto-diagnosis |
| "Pick up where you left off" | SessionMemoryService resume context |
| "Go back to before this change" | ExecutionReplayService rollback |
| "Try a different approach" | AgentRuntime retry with adapted params |
| "Your recent work" | WorkspaceContextService relevance ranking |
| "AI understands your project" | WorkspaceContext + Memory + ESM graph |

**The user should NEVER see**: kernels, gateways, execution state machines, IPC channels, safety scores, node IDs, graph mutations, or any internal terminology.

---

END ARC 20 DELIVERABLE
