# Security Model

This document describes the high-level security boundaries in VibeCode. It explains what the system protects, how protections are enforced, and what remains the user's responsibility. This is a trust boundary reference, not an implementation specification.

---

## Trust Boundaries

VibeCode enforces four independent security boundaries. Each boundary is designed to fail closed — if any boundary is bypassed or disabled, the others remain active.

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    USER APPROVAL LAYER                       │
  │   Nothing executes without explicit user consent.            │
  │   No auto-apply. No background execution.                    │
  └──────────────────────┬──────────────────────────────────────┘
                         │
  ┌──────────────────────▼──────────────────────────────────────┐
  │                   PATH SANDBOX LAYER                         │
  │   All file operations validated against workspace bounds.    │
  │   System directories and sensitive paths always blocked.     │
  └──────────────────────┬──────────────────────────────────────┘
                         │
  ┌──────────────────────▼──────────────────────────────────────┐
  │                 EXECUTION VALIDATION LAYER                   │
  │   All proposals pass risk assessment before presentation.   │
  │   Safety guard validates every action against policy.        │
  └──────────────────────┬──────────────────────────────────────┘
                         │
  ┌──────────────────────▼──────────────────────────────────────┐
  │                  DATA LOCALITY LAYER                         │
  │   All data stored locally by default.                        │
  │   No cloud storage. No telemetry without opt-in.             │
  │   API keys never leave the device.                           │
  └─────────────────────────────────────────────────────────────┘
```

---

## Boundary Details

### User Approval Layer

Every action the AI proposes requires explicit user approval before execution. This is the primary security boundary and cannot be bypassed by the AI, by configuration, or by any automated process. The approval flow is:

1. AI generates a structured proposal listing all affected files and commands
2. User reviews the proposal and sees risk assessment
3. User explicitly approves or rejects — no intermediate state
4. Only after approval does the execution engine begin

**What this prevents:** Any uncontrolled modification to the user's codebase, whether caused by AI errors, prompt injection, or configuration mistakes.

### Path Sandbox Layer

All file operations pass through the PathSandbox, which enforces a six-step validation chain. The sandbox maintains an allowlist of workspace directories and a blocklist of protected system paths. Critical system directories (`~/.ssh`, `~/.gnupg`, `/etc`, `/usr`, and similar) are always blocked regardless of workspace configuration.

**What this prevents:** The AI from accessing or modifying files outside the designated workspace, protecting system configuration, credentials, and unrelated projects.

### Execution Validation Layer

Every proposed action passes through a safety guard that validates the action type, parameters, and risk level before the user sees the proposal. Actions are classified by risk level, and high-risk actions receive additional scrutiny and clearer warnings in the approval UI.

**What this prevents:** Dangerous or malformed operations from being presented to the user without appropriate context and warning.

### Data Locality Layer

VibeCode stores all user data — sessions, memory, workspaces, API keys — locally on the device. No data is transmitted to VibeCode servers. API keys for AI providers are stored with restricted file permissions and are never included in telemetry, crash reports, or network requests to VibeCode infrastructure. Telemetry is disabled by default and requires explicit opt-in.

**What this prevents:** Data exfiltration, unauthorized access to credentials, and unwanted data transmission.

---

## What Is Not Protected

The security model has explicit boundaries. The following are outside VibeCode's protection scope:

- **User-approved actions:** Once a user approves a proposal, VibeCode executes it as requested. If the user approves a destructive action, the system carries it out. Rollback snapshots provide a recovery mechanism but are not a substitute for review.
- **Third-party AI provider behavior:** Prompts sent to AI providers are subject to those providers' privacy policies and terms of service. VibeCode cannot control how providers process, store, or use prompts.
- **Operating system-level attacks:** If the host machine is compromised, local security boundaries may be circumvented. VibeCode relies on OS-level security as a foundation.
- **Malicious workspace contents:** If a user opens a malicious project in VibeCode, the AI may read and reason about files within that workspace. The PathSandbox prevents modifications outside the workspace but does not prevent the AI from analyzing workspace contents.

---

## Crash Safety

VibeCode implements two mechanisms to protect against data corruption during crashes:

1. **Atomic file writes:** All file modifications use a temp-file-then-rename pattern, ensuring that a crash mid-write cannot leave a partially-written file
2. **Rollback snapshots:** Before executing any approved change, the system creates a snapshot of the affected files, enabling per-step or full-plan rollback

These mechanisms protect against data corruption but do not guarantee zero data loss in all scenarios.

---

## Reporting Security Issues

See [SECURITY.md](SECURITY.md) for the vulnerability reporting process, severity classifications, and response timelines.
