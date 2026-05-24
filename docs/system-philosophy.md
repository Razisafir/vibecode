# How VibeCode Thinks

This document explains the engineering philosophy behind VibeCode's design decisions. It is not marketing copy. It is a technical document describing why the system works the way it does, what principles govern its behavior, and what trade-offs were chosen.

---

## Approval-First Execution

VibeCode never executes anything without explicit user consent. This is not a limitation — it is the core design constraint.

Every AI-proposed action passes through a structured approval pipeline:

1. **Proposal generation** — The AI produces a structured plan showing what will change, which files are affected, what commands will run, and what the risk level is.
2. **Risk assessment** — Each step is classified as LOW, MEDIUM, or HIGH risk. High-risk operations (editing config files, running destructive commands) always require explicit approval regardless of user settings.
3. **User review** — The developer sees the full plan before any code touches the filesystem. They can approve, modify, or reject the entire plan.
4. **Sequential execution** — Only after approval does the execution engine begin, step by step, with safety validation at each stage.

This design means VibeCode can never silently modify your project. There is no "auto-apply" mode. There is no background execution. Every change is the result of a deliberate, informed decision by the developer.

The trade-off is speed: VibeCode is slower than auto-applying tools. The benefit is trust: you always know what happened to your code and why.

---

## Persistent Context

Most AI coding tools are stateless — they forget everything when you close the window. VibeCode is designed around the principle that an AI engineering partner should accumulate knowledge about your project over time.

**Memory store architecture:**
- Facts are stored as append-only JSONL entries (crash-safe via atomic temp + rename writes)
- An inverted index provides fast text search across all stored memories
- An LRU cache with configurable size limits handles eviction of low-value entries
- Memory entries are ranked by a composite score of importance, recency, and relevance
- The system automatically prunes entries that fall below the relevance threshold

**What gets remembered:**
- Architectural decisions and the reasoning behind them
- Bug fix histories and what approaches worked or failed
- Code patterns and conventions specific to the project
- User preferences and correction feedback

**What does NOT get remembered:**
- Raw conversation text (only extracted facts and decisions)
- File contents (only relationships and patterns)
- Anything outside the project scope

The memory system is intentionally conservative. It stores structured knowledge, not conversation logs. The goal is to make the AI more effective over time without creating an unbounded storage problem.

---

## Operational Safety

VibeCode is designed with a safety-first model at every layer. The system has multiple independent safety mechanisms, none of which depend on the others.

**PathSandbox (filesystem boundary):**
- All file operations are validated against the project workspace root
- 6-step validation: resolve, check within workspace, check not in blocked directory, check not blocked extension, check operation allowed, execute
- Blocked directories: `.ssh`, `.aws`, `.gnupg`, `.config/credentials`, and similar
- Blocked extensions for reads: `.exe`, `.dll`, `.so`, `.bin`, `.pem`, `.key`
- Blocked extensions for writes: same as reads, plus `.sh`, `.bat`, `.cmd` outside safe paths

**Safety Guard (execution boundary):**
- Validates every execution step before it runs
- Checks risk levels against user-configured thresholds
- Blocks high-risk operations without explicit approval
- Tracks execution state to prevent duplicate or out-of-order execution

**Runtime Safety Guard (regression boundary):**
- Maintains baseline measurements of system behavior
- Detects regressions by comparing current behavior against established baselines
- Blocks changes that would degrade known-good behavior

**Approval flow (human boundary):**
- No AI action reaches the filesystem without human review
- Proposals include risk assessment, affected files, and rollback indicators
- The developer has final authority on every change

These four layers are independent. If one fails, the others still provide protection. The system does not rely on any single mechanism for safety.

---

## Memory Continuity

Session persistence and crash recovery are designed to ensure that no work is ever lost, even in the worst case.

**Auto-save mechanism:**
- Session state (conversation, execution plans, open files, scroll positions) is auto-saved continuously during normal operation
- Saves use atomic writes (temp file + rename) to prevent corruption from partial writes

**Crash detection:**
- On startup, the system checks for a crash marker from the previous session
- If a crash marker exists, the user is offered a recovery prompt
- The recovered session includes the full conversation and execution state

**Safe shutdown:**
- On clean exit, the crash marker is cleared
- All pending data is flushed to disk
- The memory store completes any in-progress writes

This design means that even a power loss or hard crash does not result in data loss. At worst, the last few seconds of conversation may be missing. The project state is always recoverable.

---

## Observability Philosophy

VibeCode follows the principle that a running system should be explainable from a single command.

**The one command:** `npm run status`

This command tells you:
- What mode the system is running in and how it was detected
- Which processes are active (Vite, Electron, PM2, Watchdog)
- Whether the health endpoint is reachable and what it reports
- Which infrastructure layers are expected for the current mode
- Which ports are in use
- The overall health grade (GREEN / YELLOW / RED)

**When things go wrong:**
- The status command provides failure analysis, not just error messages
- Failure categories classify the type of problem
- Likely causes offer best-effort root cause inference
- Recommended actions include specific commands with risk levels
- Safe recovery paths provide deterministic, non-destructive recovery sequences

**Critical constraint:** The observability layer is strictly read-only. It observes, grades, and suggests — but never acts. All recovery steps are recommendations for the developer to follow manually.

This principle ensures that the diagnostic system itself can never make a problem worse.

---

## Explicit Control Over Automation

VibeCode chooses explicit control over convenience in every case where the two conflict.

**Examples of this principle in action:**

| Automation | VibeCode's Choice | Reason |
|-----------|-------------------|--------|
| Auto-apply AI suggestions | Explicit approval required | Developer must understand and consent to every change |
| Auto-restart on crash | PM2 restarts in preview mode only, with budget limits | Prevents silent crash loops from hiding real problems |
| Auto-enable infrastructure | Everything is dormant by default | No surprises — infrastructure activates only when you ask for it |
| Auto-fix detected failures | Diagnosis only, no auto-repair | The system explains the problem but never modifies state to fix it |
| Auto-update in dev mode | Manual updates only | Developer controls when and how updates happen |

The consistent pattern: VibeCode gives you the information and the tools to act on it, but does not act for you. This makes the system predictable, debuggable, and trustworthy.

---

## Design Trade-offs

Every design decision involves trade-offs. Here are the ones VibeCode has explicitly chosen:

**Slower but safer:** Approval-first execution adds a review step to every AI action. This is slower than auto-apply but prevents unintended changes.

**More state but more context:** Persistent memory requires storage and management overhead. The benefit is that the AI becomes more effective over time rather than starting from scratch each session.

**More code but more safety:** Multiple independent safety mechanisms (PathSandbox, Safety Guard, Runtime Safety Guard, Approval Flow) create redundancy. This is more code to maintain but ensures that no single point of failure can bypass safety.

**Less magic but more trust:** Infrastructure that doesn't auto-start, diagnostics that don't auto-fix, and processes that don't auto-restart without limits. Less convenience, more predictability.

**Conservative diagnosis:** Failure intelligence uses "likely cause" instead of "cause", "may indicate" instead of "indicates". This reduces false confidence in diagnostic output and encourages developers to verify before acting.

These trade-offs reflect a single priority: the developer must remain in control of their own system at all times.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Architecture Overview](architecture-overview.md) | How the system is structured and data flows |
| [Operational Safety](operational-safety.md) | Guardrails, mode compatibility, safety constraints |
| [System Status](system-status.md) | Health grading and failure category reference |
| [Repository Map](repository-map.md) | Where everything lives in the codebase |
| [Glossary](glossary.md) | Terminology reference |
| [FAQ](faq.md) | Frequently asked questions |
| [Documentation Hub](README.md) | Documentation index and navigation |
