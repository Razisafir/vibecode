# Repository Map

This document explains where everything lives in the VibeCode repository, what each directory is responsible for, and which files are operationally critical versus optional.

Use this as your navigation layer when exploring the codebase for the first time.

---

## Top-Level Structure

```
vibecode/
├── vibecode-desktop/       The application (Electron + React + Vite)
├── docs/                   Documentation hub
├── .github/                CI workflows, issue templates, PR templates
├── CONTRIBUTING.md         How to contribute to VibeCode
├── MAINTAINERS.md          Maintainer responsibilities and governance
├── LICENSE                 Dual proprietary license
├── EULA.md                 End User License Agreement
├── README.md               Public-facing entry point
├── .nvmrc                  Node.js version pinning
└── [root configs]          .gitignore, .gitleaks.toml, .editorconfig, etc.
```

---

## vibecode-desktop/ — The Application

This is the entire application. Everything that ships to users lives here.

### Source Code

```
vibecode-desktop/src/
├── main/                   Electron main process (Node.js runtime)
│   ├── main.ts             Entry point — window creation, IPC registration, lifecycle
│   ├── config/
│   │   └── release-channels.ts    Alpha/beta/stable channel definitions
│   ├── utils/
│   │   ├── id.ts           UUID generation
│   │   ├── store.ts        Persistent key-value store
│   │   ├── paths.ts        Platform-specific path resolution
│   │   ├── logger.ts       Structured logging
│   │   └── foundation-stabilization.ts  Early-stage safety checks
│   ├── ipc/                IPC handlers (9 namespaces)
│   │   ├── index.ts        Handler registration hub
│   │   ├── app-handlers.ts        App version, quit, window control
│   │   ├── execution-handlers.ts  Plan execution, step control, rollback
│   │   ├── fs-handlers.ts         File read/write/edit within sandbox
│   │   ├── memory-handlers.ts     Memory store/retrieve/search/rank
│   │   ├── provider-handlers.ts   AI provider config, routing, chat
│   │   ├── proposal-handlers.ts   Proposal generation, approval, rejection
│   │   ├── session-handlers.ts    Session save/restore, crash detection
│   │   ├── terminal-handlers.ts   PTY creation, I/O, resize
│   │   └── workspace-handlers.ts  Workspace analysis, open/close
│   ├── services/           Core business logic
│   │   ├── execution-engine.ts       Ordered multi-step execution with retry
│   │   ├── execution-persistence.ts  Plan/step state persistence
│   │   ├── health-server.ts          HTTP health endpoints (optional)
│   │   ├── llm-response-parser.ts    Parse raw LLM output into proposals
│   │   ├── memory-store.ts           JSONL + inverted index + LRU cache
│   │   ├── path-sandbox.ts           6-step filesystem validation
│   │   ├── proposal-generator.ts     Create structured proposals from AI output
│   │   ├── provider-manager.ts       Multi-provider routing and failover
│   │   ├── session-manager.ts        Session lifecycle and crash recovery
│   │   ├── executors/                7 execution step types
│   │   │   ├── index.ts              Executor registry
│   │   │   ├── code-generation-executor.ts
│   │   │   ├── command-executor.ts
│   │   │   ├── diff-apply-executor.ts
│   │   │   ├── file-edit-executor.ts
│   │   │   ├── file-read-executor.ts
│   │   │   └── file-write-executor.ts
│   │   ├── regression/
│   │   │   └── regression-protection.ts  Baseline regression detection
│   │   └── safety/
│   │       └── runtime-safety-guard.ts   Execution safety validation
│   └── system/             Operational intelligence
│       ├── status-provider.ts  Mode detection, health grading, failure analysis
│       └── failure-map.ts      Static failure knowledge catalog (reference only)
│
├── renderer/               Electron renderer process (browser runtime)
│   ├── index.html          HTML entry point
│   ├── main.tsx            React root
│   ├── App.tsx             Root component with layout
│   ├── tailwind.config.js  Tailwind CSS configuration
│   ├── components/         UI components
│   │   ├── AIPanel.tsx         Chat interface with streaming
│   │   ├── CommandPalette.tsx  Keyboard-driven command palette
│   │   ├── CrashRecoveryModal.tsx  Session recovery prompt
│   │   ├── Onboarding.tsx     First-launch setup wizard
│   │   ├── ProposalCard.tsx   AI proposal display and approval
│   │   ├── Sidebar.tsx        Navigation sidebar
│   │   ├── TitleBar.tsx       Custom window title bar
│   │   ├── Workspace.tsx      Main workspace container
│   │   └── sidebar/           Sidebar sub-panels
│   │       ├── FileExplorer.tsx   Project file tree
│   │       ├── MemoryPanel.tsx    AI memory browser
│   │       ├── SettingsPanel.tsx  Provider and workspace settings
│   │       └── TerminalPanel.tsx  Embedded terminal with ANSI support
│   ├── hooks/              React hooks for state management
│   │   ├── useAIChat.ts        Chat state, streaming, provider switching
│   │   ├── useProposals.ts     Proposal lifecycle management
│   │   ├── useSession.ts       Session auto-save and restore
│   │   ├── useSessionRestore.ts Crash recovery logic
│   │   └── useWorkspace.ts     Workspace state and analysis
│   ├── styles/             CSS
│   │   ├── index.css           Global styles and Tailwind imports
│   │   └── components.css      Component-specific styles
│   └── types/
│       └── index.ts        TypeScript type definitions
│
└── preload/                Electron preload (bridge between main and renderer)
    └── preload.ts          Exposes 9 IPC namespaces via contextBridge
```

### Configuration & Build

```
vibecode-desktop/
├── package.json            Dependencies, scripts, electron-builder config
├── tsconfig.json           Renderer TypeScript config (ESNext + bundler)
├── tsconfig.main.json      Main process TypeScript config (CommonJS + node)
├── tsconfig.preload.json   Preload TypeScript config (CommonJS + node)
├── vite.config.ts          Vite dev server and build configuration
├── eslint.config.js        ESLint 9 flat config (TypeScript + React + Hooks)
├── vitest.config.ts        Test configuration (node environment)
└── electron-builder.env    Build-time environment (if present)
```

### Operational Files

```
vibecode-desktop/
├── ecosystem.config.js     PM2 process configuration (3 env presets)
├── watchdog.js             Process monitor (disabled by default)
├── Caddyfile               Reverse proxy configuration (manual only)
├── .env.dev                Dev mode environment template (tracked)
├── .env.preview            Preview mode environment template (tracked)
├── .env.prod               Production environment template (tracked)
└── scripts/                CLI utilities
    ├── status.cjs          Unified status command with failure analysis
    ├── check-no-env-staged.sh     Pre-commit: block .env files
    ├── check-no-secrets-staged.sh Pre-commit: block secret patterns
    └── verify-gitignore.sh        Pre-commit: verify .gitignore patterns
```

### Tests

```
vibecode-desktop/tests/
├── status-provider.test.ts     42 tests: mode detection, grading, failure intelligence
├── health-server.test.ts       9 tests: startup, endpoints, shutdown
├── path-sandbox.test.ts        10 tests: validation, blocking, extension checks
├── safety-guard.test.ts        14 tests: risk levels, approval flow
└── regression-protection.test.ts 7 tests: baseline loading, regression detection
```

---

## docs/ — Documentation Hub

```
docs/
├── README.md               Documentation hub and navigation index
├── getting-started.md      Installation, first launch, key concepts
├── first-30-minutes.md     Guided onboarding for new developers
├── architecture-overview.md System layers, data flow, diagrams
├── system-philosophy.md    Engineering philosophy and design trade-offs
├── repository-map.md       This file — codebase navigation
├── operational-guide.md    Complete command reference and mode guide
├── operational-safety.md   Guardrails, mode compatibility, safety constraints
├── system-status.md        Status command reference, failure categories, JSON schema
├── troubleshooting.md      Common issues and solutions (users + developers)
├── configuration.md        Environment variables, AI providers, storage paths
├── glossary.md             Terminology reference
├── faq.md                  Frequently asked questions
└── release-process.md      Release checklist, hotfix process, alpha channel
```

---

## .github/ — CI & Community

```
.github/
├── workflows/
│   ├── ci.yml              typecheck + lint + test + build
│   ├── security.yml        gitleaks + npm audit + CodeQL placeholder
│   └── build.yml           OS matrix build (macOS, Windows, Linux)
├── ISSUE_TEMPLATE/
│   ├── bug_report.yml      Structured bug report form
│   ├── feature_request.yml Feature request form
│   ├── first_impressions.yml First impressions feedback form
│   └── config.yml          Issue template configuration
├── PULL_REQUEST_TEMPLATE.md PR checklist and description template
└── release-notes-template.md Release notes structure for GitHub Releases
```

---

## Operationally Critical Files

These files are essential for the application to function correctly. Modifying them without understanding the impact can break the system.

| File | Role | Impact if modified |
|------|------|--------------------|
| `src/main/main.ts` | Entry point, lifecycle | App won't start or won't shut down cleanly |
| `src/preload/preload.ts` | IPC bridge | Renderer loses all main process access |
| `src/main/services/path-sandbox.ts` | Filesystem security | Safety boundaries may be bypassed |
| `src/main/services/execution-engine.ts` | AI action execution | Proposals won't execute correctly |
| `src/main/services/memory-store.ts` | Persistent memory | Memory corruption or data loss |
| `src/main/services/session-manager.ts` | Session persistence | Crash recovery may fail |
| `src/main/system/status-provider.ts` | System observability | Status and failure analysis break |
| `src/main/ipc/index.ts` | IPC handler registration | Communication channels break |
| `ecosystem.config.js` | PM2 process config | Preview mode won't start correctly |
| `package.json` | Dependencies, scripts, build config | Everything |

---

## Optional Systems

These systems enhance VibeCode but are not required for basic operation. They are dormant by default and activate only when explicitly enabled.

| System | File | Activation | Purpose |
|--------|------|-----------|---------|
| Health server | `src/main/services/health-server.ts` | `VIBECODE_HEALTH_PORT` env var | HTTP endpoints for process supervision |
| PM2 supervision | `ecosystem.config.js` | `npm run preview:start` | Process management, auto-restart |
| Watchdog | `watchdog.js` | `npm run watchdog:start` | Health endpoint monitoring |
| Caddy proxy | `Caddyfile` | Manual Caddy installation | Reverse proxy for production |
| Failure map | `src/main/system/failure-map.ts` | Referenced by status provider | Static failure knowledge catalog |

In DEV mode, none of these systems are active. The app runs as a plain Electron + Vite development server with no process management, no health endpoints, and no monitoring.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Architecture Overview](architecture-overview.md) | How the system layers fit together |
| [System Philosophy](system-philosophy.md) | Why the system is designed this way |
| [First 30 Minutes](first-30-minutes.md) | Guided onboarding walkthrough |
| [Operational Guide](operational-guide.md) | How to run VibeCode in every mode |
| [Glossary](glossary.md) | Terminology reference |
| [FAQ](faq.md) | Frequently asked questions |
| [Documentation Hub](README.md) | Documentation index and navigation |
