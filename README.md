<div align="center">

# VibeCode

**A desktop AI engineering partner that remembers your codebase, proposes changes, and executes them with your approval.**

[![CI](https://github.com/Razisafir/vibecode/actions/workflows/ci.yml/badge.svg)](https://github.com/Razisafir/vibecode/actions/workflows/ci.yml)
[![Security](https://github.com/Razisafir/vibecode/actions/workflows/security.yml/badge.svg)](https://github.com/Razisafir/vibecode/actions/workflows/security.yml)
[![Tests](https://img.shields.io/badge/Tests-82%20passing-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-47848f.svg)]()
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933.svg)]()
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)]()
[![Version](https://img.shields.io/badge/Version-0.1.0--alpha-orange.svg)]()

[Getting Started](docs/getting-started.md) · [First 30 Minutes](docs/first-30-minutes.md) · [Architecture](docs/architecture-overview.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## Table of Contents

- [What VibeCode Does](#what-vibecode-does)
- [Architecture](#architecture)
- [Operational Modes](#operational-modes)
- [Safety Model](#safety-model)
- [Observability](#observability)
- [Quick Start](#quick-start)
- [Comparison](#comparison)
- [Command Reference](#command-reference)
- [Documentation](#documentation)
- [Project Status](#project-status)
- [Production Readiness](#production-readiness)
- [Stability Guarantees](#stability-guarantees)
- [Contributing](#contributing)
- [License](#license)

---

## What VibeCode Does

VibeCode is a desktop application where an AI assistant works inside your codebase. It understands your project, proposes structured changes, executes them with your approval, and remembers what it learned across sessions.

The core workflow:

```
  You ask           AI plans           You approve        System executes
  ───────────────>  ───────────────>  ───────────────>  ───────────────>
  "Add error        Structured        Review risk,       File edits,
   handling to      proposal:         affected files,    command runs,
   auth.ts"         3 files, 5 steps  rollback plan      diff applications
```

Every action requires your approval. Nothing runs without your consent.

---

## Architecture

VibeCode is structured in five layers with clear responsibility boundaries:

```
+===================================================================+
|                        DESKTOP RUNTIME                            |
|   Electron (main + renderer + preload) + Vite + React             |
+===================================================================+
              |                                      |
              v                                      v
+===========================+       +===========================+
|   AI EXECUTION LAYER     |       |   SESSION & MEMORY LAYER  |
|   7 executor types        |       |   JSONL persistence       |
|   Proposal/approval flow  |       |   Crash recovery          |
|   Safety guard + rollback |       |   LRU cache + index       |
+===========================+       +===========================+
              |                                      |
              +------------------+-------------------+
                                 |
                                 v
+===================================================================+
|                    OPERATIONAL INTELLIGENCE LAYER                  |
|   Health grading (GREEN/YELLOW/RED) · Failure analysis            |
|   Root cause inference · Safe recovery paths                      |
+===================================================================+
                                 |
                                 v
+===================================================================+
|                      INFRASTRUCTURE LAYER                         |
|   PM2 (optional) · Health server (optional) · Watchdog (optional) |
+===================================================================+
```

See [Architecture Overview](docs/architecture-overview.md) for detailed diagrams and data flow.

---

## Operational Modes

```
  DEV                     PREVIEW                    PRODUCTION
  (default)               (optional)                 (distribution)

  npm run dev             npm run preview:start      npm run dist

  Vite hot-reload         PM2 supervision            Signed packages
  DevTools open           Health endpoint (9876)     Auto-update ready
  No infrastructure       Watchdog available          Hardened safety
  Fast iteration          Isolated environment        No dev dependencies
```

Infrastructure is **opt-in, never opt-out**. Nothing activates without you explicitly requesting it. In DEV mode, there is no process manager, no health server, no monitoring — just the app and your code.

---

## Safety Model

Trust is structural, not aspirational. VibeCode enforces safety through four independent mechanisms:

```
  +-------------------+    +-------------------+    +-------------------+
  |   PathSandbox     |    |   Safety Guard    |    |  Runtime Safety   |
  |                   |    |                   |    |  Guard            |
  | Filesystem bounds |    | Execution validation|  | Regression check  |
  | Blocked dirs      |    | Risk assessment   |    | Baseline compare  |
  | Blocked extensions|    | Approval enforcement|   | Change validation |
  +-------------------+    +-------------------+    +-------------------+
             |                        |                        |
             +------------------------+------------------------+
                                      |
                                      v
                           +-------------------+
                           |  Approval Flow    |
                           |                   |
                           |  Nothing executes |
                           |  without your     |
                           |  explicit consent |
                           +-------------------+
```

**Key guarantees:**
- Nothing runs without your approval — no auto-apply, no background execution
- Your project stays contained — the AI cannot access files outside the workspace
- Every action is reversible — per-step rollback and full plan rollback
- Your data stays local — no cloud storage, no telemetry by default

See [System Philosophy](docs/system-philosophy.md) for the reasoning behind these decisions.

---

## Observability

One command explains the entire running system:

```bash
npm run status
```

When the system is healthy:

```
  Overall:   GREEN  All systems nominal
  Mode:      DEV
```

When something is wrong, the status command provides failure intelligence:

```
  Overall:   RED  Preview mode detected but health endpoint is unreachable

  Failure Analysis
  ────────────────────────────────────────────────
  Category:    HEALTH_SERVER_DOWN
  Confidence:  HIGH

  Likely Causes:
  - The Electron process has not finished starting up yet
  - The app under PM2 has crashed and is in a restart loop

  Recommended Actions:
  - npm run preview:logs      Check for crash traces      Risk: LOW
  - npm run preview:restart   Restart the process          Risk: LOW

  Safe Recovery Path:
  1. npm run preview:stop
  2. npm run preview:start
  3. npm run status
```

The diagnostic system is **strictly read-only** — it observes and suggests, but never modifies state.

See [System Status Reference](docs/system-status.md) for the complete failure category catalog and JSON schema.

---

## Quick Start

**Developers** — build from source:

```bash
# Clone and install
git clone https://github.com/Razisafir/vibecode.git
cd vibecode/vibecode-desktop
npm install

# Start development
npm run dev

# Verify system health
npm run status

# Run the test suite
npm run test

# Full CI check
npm run ci
```

**Users** — download and install:

1. Download the latest release from [GitHub Releases](https://github.com/Razisafir/vibecode/releases)
2. Install VibeCode for your platform (DMG, EXE, or AppImage)
3. Launch and follow the onboarding flow

See [Getting Started](docs/getting-started.md) for detailed setup instructions, or [First 30 Minutes](docs/first-30-minutes.md) for a guided walkthrough.

Going offline? Install [Ollama](https://ollama.ai), pull a model, and select it in settings. No API keys needed.

---

## Comparison

| | VibeCode | Cursor | Replit AI | VS Code Extensions |
|---|---|---|---|---|
| Persistent memory across sessions | Yes | No | Limited | No |
| Execution with rollback | Yes | Inline only | Cloud-only | Suggestions only |
| Approval before every action | Yes | Auto-applies | Auto-applies | Auto-completes |
| Local filesystem access | Yes | Yes | No (cloud) | Limited |
| Crash recovery | Full session | Basic | N/A | Basic |
| Offline capability | Yes (Ollama) | No | No | No |

---

## Command Reference

| Category | Command | Purpose |
|----------|---------|---------|
| **Core** | `npm run dev` | Start Vite + Electron with hot-reload |
| | `npm run build` | Compile TypeScript + build renderer |
| | `npm run test` | Run all tests (82 tests) |
| | `npm run lint` | ESLint with zero-error policy |
| **Preview** | `npm run preview:start` | Build + start under PM2 with health server |
| | `npm run preview:stop` | Stop PM2 process |
| | `npm run preview:logs` | Tail PM2 logs |
| **System** | `npm run health` | Check health endpoint |
| | `npm run watchdog:start` | Start process monitor |
| | `npm run status` | Full system status + failure analysis |
| | `npm run status:json` | Same in JSON format |
| **Diagnostics** | `npm run ci` | typecheck + lint + test + build |
| | `npm run typecheck` | TypeScript compiler checks |
| | `npm run check:all` | Pre-commit integrity checks |
| **Distribution** | `npm run dist` | Build installable package |
| | `npm run dist:mac` | macOS (DMG + ZIP) |
| | `npm run dist:win` | Windows (NSIS + Portable) |
| | `npm run dist:linux` | Linux (AppImage + DEB) |

Full reference: [Operational Guide](docs/operational-guide.md)

---

## Documentation

### Recommended Reading Path

If you are new to VibeCode, start here:

1. **[Getting Started](docs/getting-started.md)** — Install and configure (5 min)
2. **[First 30 Minutes](docs/first-30-minutes.md)** — Clone, build, run, diagnose (30 min)
3. **[Architecture Overview](docs/architecture-overview.md)** — Understand the system layers (15 min)
4. **[System Philosophy](docs/system-philosophy.md)** — Understand the design decisions (10 min)

### Core Documents

| Document | Audience | Purpose |
|----------|----------|--------|
| [Getting Started](docs/getting-started.md) | Users | Installation, first launch, key concepts |
| [First 30 Minutes](docs/first-30-minutes.md) | Developers | Guided codebase onboarding |
| [Architecture Overview](docs/architecture-overview.md) | All technical | System layers, data flow, diagrams |
| [System Philosophy](docs/system-philosophy.md) | All technical | Design principles and trade-offs |
| [Repository Map](docs/repository-map.md) | Developers | Codebase navigation and file guide |
| [Operational Guide](docs/operational-guide.md) | Operators | Complete command and mode reference |
| [Operational Safety](docs/operational-safety.md) | Operators | Guardrails and mode compatibility |
| [System Status](docs/system-status.md) | Operators | Failure categories and JSON schema |
| [Configuration](docs/configuration.md) | All | Environment variables and provider setup |
| [Troubleshooting](docs/troubleshooting.md) | All | Common issues and solutions |
| [Glossary](docs/glossary.md) | All | Terminology reference |
| [FAQ](docs/faq.md) | All | Frequently asked questions |

### Governance & Policy

| Document | Purpose |
|----------|--------|
| [Contributing](CONTRIBUTING.md) | How to contribute effectively |
| [Code of Conduct](CODE_OF_CONDUCT.md) | Community standards and enforcement |
| [Security Policy](SECURITY.md) | Vulnerability reporting and response |
| [Security Model](SECURITY_MODEL.md) | High-level security boundaries |
| [Support Policy](SUPPORT_POLICY.md) | Supported versions, scope, and limitations |
| [Versioning Policy](VERSIONING_POLICY.md) | Semver rules and breaking change definition |
| [Release Process](docs/release-process.md) | Release checklist and alpha channel |
| [Release Checklist](RELEASE_CHECKLIST.md) | Pre-release verification steps |
| [Release Channels](RELEASE_CHANNELS.md) | Alpha, beta, and stable channel definitions |
| [Compatibility Matrix](COMPATIBILITY_MATRIX.md) | OS and runtime compatibility table |
| [Maintainers](MAINTAINERS.md) | Governance and triage process |

For the complete documentation index, see [docs/INDEX.md](docs/INDEX.md).

---

## Project Status

VibeCode is in **alpha** (`0.1.0-alpha`). The core systems — AI execution, persistent memory, session recovery, secure sandbox, operational intelligence — are functional and tested. The architecture is stable. The API surface may change before version 1.0.

| Metric | Status |
|--------|--------|
| Test suite | 82 tests across 5 files — all passing |
| CI pipeline | typecheck (3 configs) + lint (zero errors) + test + build |
| Security scanning | gitleaks + npm audit on every push |
| Platform support | macOS (Apple Silicon + Intel), Windows 10/11, Linux (x64) |
| Minimum runtime | Node.js 20.x, Electron 33.x |
| Release channel | Alpha |

---

## Production Readiness

VibeCode is in alpha and not yet recommended for production-critical workflows. The following table tracks readiness across key dimensions:

| Dimension | Status | Notes |
|-----------|--------|-------|
| Core functionality | Ready | AI execution, proposals, memory, sandbox all functional |
| Crash recovery | Ready | Session persistence + atomic file writes + rollback snapshots |
| Security boundaries | Ready | PathSandbox + approval flow + safety guard |
| Observability | Ready | Health grading + failure intelligence + status CLI |
| Test coverage | Alpha | 82 tests covering core paths; more coverage needed for 1.0 |
| Documentation | Ready | 14 operational docs + 7 governance docs + glossary + FAQ |
| API stability | Not ready | API surface may change before 1.0 (see [VERSIONING_POLICY.md](VERSIONING_POLICY.md)) |
| Distribution | Alpha | Build pipeline works; code signing not yet configured |
| Performance | Alpha | Not yet benchmarked or optimized |

---

## Stability Guarantees

The following architectural invariants are guaranteed across all versions, including pre-1.0. These are structural commitments, not version-dependent features — they will not be removed or weakened.

### Architecture Stability Promise

1. **Approval-first execution** — The AI will never auto-apply changes without explicit user consent. No configuration option, environment variable, or future feature will bypass the approval flow.

2. **PathSandbox enforcement** — All file operations will always be validated against workspace bounds. System directories will always be blocked. The sandbox cannot be disabled by user configuration.

3. **Data locality** — User data (sessions, memory, configuration, API keys) will always be stored locally by default. No data will be transmitted to VibeCode servers without explicit user opt-in. API keys will never leave the device.

4. **Opt-in infrastructure** — PM2, health server, and watchdog will never activate without explicit user action. No infrastructure component will auto-activate in any future version.

5. **Read-only diagnostics** — The status system and failure intelligence will never modify system state. Diagnostic commands will observe and suggest, but never execute fixes, restart processes, or alter configuration.

### What Will Not Break Across Updates

The following will remain backward-compatible within the alpha phase:
- The `npm run status` and `npm run status:json` command interface
- The PathSandbox validation rules (existing blocked paths will not be unblocked)
- The health endpoint schema (`/api/health`, `/api/health/ready`, `/api/health/live`)
- The session data format (existing sessions will remain readable)
- The rollback snapshot format

See [VERSIONING_POLICY.md](VERSIONING_POLICY.md) for the complete versioning rules and breaking change definition.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, commit conventions, code standards, and the PR review process. All contributions are subject to the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

VibeCode is proprietary software. See [LICENSE](LICENSE) and [EULA.md](EULA.md) for terms.
