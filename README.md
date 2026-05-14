<div align="center">

# VibeCode

**A persistent AI engineering workspace**

*Your codebase. Your AI copilot. Always in context.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-33-47848f.svg)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()

</div>

---

VibeCode is a desktop coding workspace where an AI copilot understands your full codebase, proposes structured changes, and executes approved actions — all while maintaining memory across sessions and recovering gracefully from crashes.

Unlike chat-based coding assistants that forget everything between conversations, VibeCode is built for **continuity**: the AI remembers what it learned, what it did, and where it left off. It doesn't just suggest code — it operates inside your project with full awareness of context, constraints, and history.

---

## The Problem

Current AI coding tools share a common set of limitations:

- **No persistence.** Every session starts from zero. The AI re-reads files, re-learns patterns, and re-asks questions you already answered.
- **Weak execution.** Most tools can suggest edits, but few can safely apply them, run terminal commands, or manage diffs end-to-end with rollback support.
- **No memory continuity.** There's no mechanism for the AI to carry forward knowledge, decisions, or confidence from one session to the next.
- **Fragile sessions.** A crash or disconnect means starting over — no recovery, no rollback, no state preservation.

VibeCode addresses each of these with a purpose-built execution engine, a semantic memory system with inverted-index search, session persistence with crash recovery, and a proposal-based approval flow that keeps the human in control.

---

## Features

### ⚙️ Execution Engine

VibeCode doesn't just suggest — it acts. The execution engine manages a full plan lifecycle: **draft → approved → running → completed**, with support for dependency-ordered step execution via topological sort, automatic retry on failure (configurable per step), cancellation via `AbortController`, and full rollback support with disk-persisted snapshots.

Seven real executor types handle the work:

| Executor | What it does |
|----------|-------------|
| `file_write` | Creates new files with directory scaffolding |
| `file_read` | Reads file contents for analysis |
| `file_edit` | Applies targeted edits to existing files |
| `command` | Executes terminal commands with timeout enforcement |
| `code_generation` | Generates code from AI-produced specifications |
| `code_edit` | Applies code-level modifications |
| `diff_apply` | Applies unified diffs to files |

Every step captures a rollback snapshot before execution — original file content, file existence status, and command metadata — so any step or entire plan can be reversed.

### 🧠 Persistent Memory System

The AI maintains a semantic memory store that carries context across sessions. Memories are stored as typed entries (`decision`, `error`, `success`, `preference`, `fact`, `context`, `conversation`) with importance scores (0–1), access tracking, and tagging. The store uses:

- **JSONL persistence** with append-only writes for performance and full rewrites for compaction
- **Inverted index** with stop-word filtering for fast term-based search across projects
- **LRU cache eviction** when project count exceeds the configurable limit (default: 10 projects)
- **Relevance ranking** combining term matching, type weights, importance, recency decay (7-day half-life), and access frequency
- **Automatic pruning** of low-importance, rarely-accessed entries older than 90 days
- **Memory-aware compaction** that rewrites project files when the tombstone ratio exceeds 30% or append count exceeds 50

This means the AI gets smarter about your project over time — it remembers architectural decisions, code patterns, and past debugging sessions without growing unbounded.

### 🔄 Session Continuity

Sessions are persisted to disk in real time with two tiers of auto-save:

- **Full state auto-save** every 30 seconds — conversation messages, execution plans, layout state, workspace context
- **Workspace-only save** every 10 seconds — open files, scroll positions, expanded folders, recent files

All writes use **atomic file operations** (write to temp, then rename) to prevent corruption. Session state includes enhanced recovery metadata: crash count, last crash reason, and safe-shutdown tracking. If VibeCode crashes, loses power, or is force-quit, it detects the unsafe shutdown on next launch and offers full session recovery.

### ✅ Proposal Approval Flow

The AI never executes without your consent. Every proposed change — whether a file edit, terminal command, or multi-step operation — is presented as a structured **proposal card** with:

- A description of the intended change and affected files
- Risk level assessment (`low` / `medium` / `high`) with automatic escalation for config files, destructive commands, and file deletions
- Estimated impact statement
- Rollback availability indicator

The `ProposalGenerator` parses LLM responses, extracts file operations and commands, groups them into execution intents, assesses risk, and creates structured plans ready for your review. You can **approve**, **reject**, or **modify** each proposal before execution begins.

### 🔒 Secure Sandbox Execution

The `PathSandbox` service enforces filesystem access boundaries with a six-step validation pipeline:

1. **Normalize and resolve** to an absolute path
2. **Resolve symlinks** via `fs.realpathSync()` to prevent escape through symbolic links
3. **Workspace containment check** — verify the resolved path starts with the workspace root
4. **Path traversal detection** — reject paths containing `..` components that escape the workspace
5. **Blocked directory check** — forbid access to `.ssh`, `.gnupg`, `.aws`, `.kube`, `.docker`, and other credential directories
6. **File extension validation** — separate allowlists for read and write operations, with a global blocklist for binaries, executables, archives, certificates, and database files

The renderer process never touches the filesystem directly — all I/O routes through the IPC layer, which validates every path through the sandbox before performing operations.

### 🤖 Multi-Model AI Support

VibeCode works with the AI provider that fits your workflow, with native streaming support for all providers:

| Provider | Type | Default Models | Streaming |
|----------|------|---------------|-----------|
| OpenAI | Cloud | GPT-4o, GPT-4o Mini, o1 | SSE |
| Anthropic | Cloud | Claude Sonnet 4, Claude 3.5 Haiku | SSE |
| Google | Cloud | Gemini 2.0 Flash, Gemini 2.5 Pro | Chunked |
| Ollama | Local | Llama 3.1 8B, Code Llama 13B | NDJSON |
| Custom | Any | OpenAI-compatible API | SSE |

The `ProviderManager` includes automatic health checks with latency measurement, priority-based routing that considers streaming/tool/vision requirements and minimum context windows, and intelligent provider selection scoring based on priority, latency, and availability.

---

## Architecture

VibeCode is built as an Electron application with strict process isolation. The main process owns all system access, the renderer never touches the filesystem directly, and the preload script exposes a typed API via `contextBridge`.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VibeCode Desktop v0.1.0                      │
│                    AI-Native Desktop Operating Environment           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Electron Main Process                      │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │   │
│  │  │   main.ts    │  │  IPC Bridge  │  │   Services        │   │   │
│  │  │  - Window    │  │  - fs:*      │  │  - MemoryStore    │   │   │
│  │  │  - Lifecycle │  │  - terminal:*│  │  - SessionManager │   │   │
│  │  │  - Crash     │  │  - provider:*│  │  - ExecutionEngine│   │   │
│  │  │  - Single     │  │  - memory:*  │  │  - ProviderManager│   │   │
│  │  │    Instance   │  │  - session:* │  │  - ProposalGen    │   │   │
│  │  │              │  │  - execution:*│  │  - PathSandbox    │   │   │
│  │  │              │  │  - workspace:*│  │                   │   │   │
│  │  │              │  │  - proposal:* │  │  Data:            │   │   │
│  │  │              │  │  - app:*     │  │  ~/.vibecode/     │   │   │
│  │  └─────────────┘  └──────────────┘  │  ├── memory/      │   │   │
│  │                                      │  ├── sessions/    │   │   │
│  │                                      │  ├── rollbacks/   │   │   │
│  │                                      │  └── providers.json│   │   │
│  │                                      └───────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↕ IPC                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                Preload (contextBridge)                         │   │
│  │         window.vibecode = { fs, terminal, provider,            │   │
│  │            memory, session, execution, workspace,              │   │
│  │            proposal, app }                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↕ window.vibecode                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    React Renderer (Vite)                       │   │
│  │                                                                │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │  TitleBar — Traffic Lights | VIBECODE | Controls       │   │   │
│  │  ├──────────┬────────────────────────────┬───────────────┤   │   │
│  │  │ Sidebar  │      Workspace             │   AI Panel    │   │   │
│  │  │          │                            │               │   │   │
│  │  │ Activity │  Tab Bar                   │  Provider/    │   │   │
│  │  │ Bar      │  ┌────────────────────┐    │  Model Select │   │   │
│  │  │ (60px)   │  │                    │    │               │   │   │
│  │  │          │  │  Code Editor /     │    │  Messages     │   │   │
│  │  │ ┌──────┐ │  │  Welcome Screen    │    │  (user/ai/    │   │   │
│  │  │ │Files │ │  │                    │    │   system)     │   │   │
│  │  │ │Term  │ │  │                    │    │               │   │   │
│  │  │ │Mem   │ │  │                    │    │  Proposal     │   │   │
│  │  │ │Set   │ │  └────────────────────┘    │  Cards        │   │   │
│  │  │ └──────┘ │  Status Bar                │               │   │   │
│  │  │          │                            │  ─────────── │   │   │
│  │  │ Panel    │                            │  Input +     │   │   │
│  │  │ (280px)  │                            │  Send Button │   │   │
│  │  │          │                            │  (400px)     │   │   │
│  │  ├──────────┴────────────────────────────┴───────────────┤   │   │
│  │  │  Onboarding (4 steps) │ Crash Recovery │ Cmd+K Palette│   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Main process owns all system access.** File operations, terminal execution, and memory storage live in the main process, isolated from the renderer by Electron's context isolation.
- **IPC is the single communication channel.** Nine typed IPC namespaces (`fs`, `terminal`, `provider`, `memory`, `session`, `execution`, `workspace`, `proposal`, `app`) provide a structured API. The renderer never bypasses this layer.
- **AI providers are abstracted behind a unified interface.** Switching models requires zero changes to the execution or memory systems. The `ProviderManager` handles routing, health checks, and streaming protocol differences transparently.
- **Memory is decoupled from session state.** Memory persists independently of any single session, enabling cross-session knowledge transfer. Memory files are stored per-project in JSONL format.
- **Execution state is independently persisted.** The execution engine auto-saves plans and rollback snapshots to disk, ensuring crash recovery extends to in-progress operations.

---

## Installation

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/Razisafir/vibecode.git
cd vibecode/vibecode-desktop

# Install dependencies
npm install

# Start development mode (Vite + Electron)
npm run dev

# Build for production
npm run build

# Package as distributable
npm run dist          # Current platform
npm run dist:mac      # macOS (DMG + ZIP)
npm run dist:win      # Windows (NSIS + Portable)
npm run dist:linux    # Linux (AppImage + DEB)
```

### Environment Variables

Create a `.env` file in the `vibecode-desktop` directory. VibeCode needs at least one AI provider configured to operate:

```env
# At least one provider is required

# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
GEMINI_API_KEY=...

# Local providers (no API key needed)
# Ollama runs on http://localhost:11434 by default
# Custom providers can be configured in-app via Settings
```

No cloud provider is mandatory — you can use VibeCode entirely offline with Ollama or any OpenAI-compatible local provider (LM Studio, etc.).

---

## Usage

### Starting a Session

Launch VibeCode and open a project directory. The onboarding flow guides you through provider setup and workspace selection. Once configured, the AI begins indexing your codebase to build initial context. This happens once; subsequent sessions reuse cached knowledge from the memory store.

### Proposing Changes

When you ask the AI to implement a feature, fix a bug, or refactor code, it responds with a **structured proposal** rather than executing immediately. A proposal includes:

- A description of the intended change and affected files
- Risk level (`low`, `medium`, or `high`) automatically assessed based on file type, operation type, and command danger
- Estimated impact (files created, lines modified, commands run)
- Whether the change can be rolled back automatically

The `ProposalGenerator` parses LLM responses, extracts code blocks, file operations, and shell commands, then groups them into execution intents with dependency-ordered steps.

### Approving Execution

Review the proposal card in the AI panel. You can:

- **Approve** — the execution engine applies all changes in dependency order with rollback snapshots
- **Reject** — nothing happens; the AI registers the rejection
- **Modify** — edit the proposal before approval, adjusting scope or approach

Once approved, the execution engine applies changes step by step. Each step captures a rollback snapshot before execution. If anything fails mid-operation, the engine retries up to the configured limit (default: 3). You can also cancel a running plan at any time.

### Memory Across Sessions

Every interaction contributes to VibeCode's persistent memory. The AI remembers:

- Architectural decisions and their rationale (stored as `decision` entries with high importance)
- Code patterns specific to your project (`fact` and `context` entries)
- Past bugs, fixes, and debugging strategies (`error` and `success` entries)
- Your preferences for code style and structure (`preference` entries)

When you start a new session, relevant memories are loaded automatically — no need to re-explain your project. Stale or low-confidence memories are pruned over time to keep the knowledge store accurate and efficient. You can also browse, search, and manage memories directly from the Memory Panel in the sidebar.

### Crash Recovery

If VibeCode crashes or is terminated unexpectedly, it detects the unsafe shutdown on next launch. The `SessionManager` checks the `safeShutdown` flag in session state — if it's `false`, a crash recovery modal offers to restore your full session: conversation, proposals, execution logs, and all. No work is lost.

---

## Security Model

VibeCode is designed so the AI cannot operate outside the boundaries you define.

### Sandbox Boundaries

- All file operations are restricted to the **project root directory** and its subdirectories
- The AI **cannot** read, write, or modify files outside the project boundary — symlink escapes are detected and blocked
- Sensitive system paths are explicitly blocked: `.ssh`, `.gnupg`, `.aws`, `.kube`, `.docker`, `.npmrc`, `.netrc`, `.pgpass`, and more
- Binary files, executables, archives, certificates, and database files are blocked by extension — both for reading and writing

### Execution Approval

- No action is executed without explicit user approval
- Proposals are displayed with full risk assessment before execution
- Terminal commands are previewed and require approval
- High-risk operations (deleting files, editing configs, destructive commands) are automatically flagged
- Multi-step operations can be approved step-by-step or in bulk

### Safe Execution

- File edits are applied atomically — session state uses temp-file-then-rename writes to prevent corruption
- Terminal commands run with timeout enforcement (default: 60 seconds)
- The execution engine validates every operation against sandbox boundaries before proceeding
- Rollback snapshots are persisted to `~/.vibecode/rollbacks/` so recovery survives crashes

---

## Roadmap

VibeCode follows an ARC-based development roadmap. Current progress covers ARC 1–4 (core engine, memory, session persistence, proposal system). Upcoming milestones:

| ARC | Focus | Description |
|-----|-------|-------------|
| **5** | Provider UI | In-app provider configuration, model selection, and API key management with visual health status |
| **6** | Multi-root workspaces | Support for multiple project roots with independent memory contexts and session isolation |
| **7** | Testing infrastructure | Automated test suites for execution engine, memory system, IPC layer, and provider integrations |
| **8** | Concurrent execution engine | Parallel proposal execution with dependency resolution, conflict detection, and resource locking |
| **9** | Plugin ecosystem | Extensible plugin API for custom execution actions, memory backends, AI providers, and UI panels |
| **10** | Production hardening | Performance optimization, auto-update system, error reporting, and stability for daily production use |

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Desktop shell | Electron 33 | Frameless window, single-instance lock, crash recovery |
| UI framework | React 18 | Three-panel layout with sidebar, workspace, AI panel |
| Type system | TypeScript 5.3 | Strict mode, composite project references |
| Build system | Vite 5 | HMR for renderer, TypeScript compilation for main/preload |
| Runtime | Node.js 20+ | Main process services |
| Styling | Tailwind CSS 3.4 + custom CSS | Dark theme with premium visual polish |
| Communication | IPC (contextBridge) | 9 typed namespaces, streaming support |
| AI providers | OpenAI, Anthropic, Google, Ollama, Custom | Unified streaming interface |
| Persistence | JSONL (memory), JSON (sessions), filesystem (rollbacks) | Atomic writes, append-only optimization |
| Validation | Zod | Runtime type checking |
| Packaging | electron-builder | macOS, Windows, Linux targets |

---

## Project Structure

```
vibecode-desktop/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── main.ts                    # Window creation, lifecycle, crash recovery
│   │   ├── ipc/                       # IPC handler registration
│   │   │   ├── index.ts               # Registration entry point (9 namespaces)
│   │   │   ├── fs-handlers.ts         # Filesystem operations (PathSandbox-validated)
│   │   │   ├── terminal-handlers.ts   # Terminal/PTY management
│   │   │   ├── provider-handlers.ts   # AI provider configuration & chat
│   │   │   ├── memory-handlers.ts     # Memory store operations
│   │   │   ├── session-handlers.ts    # Session persistence & recovery
│   │   │   ├── execution-handlers.ts  # Execution engine (plans, steps, approvals)
│   │   │   ├── workspace-handlers.ts  # Workspace analysis & management
│   │   │   ├── proposal-handlers.ts   # Proposal generation from AI responses
│   │   │   └── app-handlers.ts        # App lifecycle (quit, minimize, maximize)
│   │   ├── services/                  # Core business logic
│   │   │   ├── execution-engine.ts    # Plan lifecycle, dependency sort, rollback
│   │   │   ├── execution-persistence.ts # Plan persistence layer
│   │   │   ├── memory-store.ts        # JSONL-backed memory with inverted index
│   │   │   ├── session-manager.ts     # Auto-save, crash recovery, atomic writes
│   │   │   ├── provider-manager.ts    # Multi-provider routing & streaming
│   │   │   ├── proposal-generator.ts  # LLM response → structured intents
│   │   │   ├── llm-response-parser.ts # Code block & action extraction
│   │   │   ├── path-sandbox.ts        # 6-step filesystem validation
│   │   │   └── executors/             # Step-type-specific executors
│   │   │       ├── index.ts           # Registry mapping step types to executors
│   │   │       ├── file-write-executor.ts
│   │   │       ├── file-read-executor.ts
│   │   │       ├── file-edit-executor.ts
│   │   │       ├── command-executor.ts
│   │   │       ├── code-generation-executor.ts
│   │   │       └── diff-apply-executor.ts
│   │   └── utils/                     # Shared utilities
│   │       ├── id.ts                  # UUID generation
│   │       ├── logger.ts              # Structured logging
│   │       ├── paths.ts              # Path resolution
│   │       ├── store.ts              # Electron-store wrapper
│   │       └── foundation-stabilization.ts
│   ├── preload/
│   │   └── preload.ts                 # contextBridge API (window.vibecode)
│   └── renderer/                      # React UI
│       ├── main.tsx                   # React entry point
│       ├── App.tsx                    # Root component
│       ├── index.html                 # HTML entry
│       ├── types/
│       │   └── index.ts              # TypeScript type definitions
│       ├── hooks/                     # React hooks
│       │   ├── useAIChat.ts          # AI chat state & streaming
│       │   ├── useSession.ts         # Session management
│       │   ├── useSessionRestore.ts  # Crash recovery logic
│       │   ├── useWorkspace.ts       # Workspace operations
│       │   └── useProposals.ts       # Proposal state management
│       ├── components/                # UI components
│       │   ├── TitleBar.tsx          # Custom frameless titlebar
│       │   ├── Sidebar.tsx           # Activity bar + panel
│       │   ├── Workspace.tsx         # Center workspace area
│       │   ├── AIPanel.tsx           # AI chat interface
│       │   ├── ProposalCard.tsx      # Proposal approval UI
│       │   ├── Onboarding.tsx        # 4-step setup flow
│       │   ├── CrashRecoveryModal.tsx # Crash recovery dialog
│       │   ├── CommandPalette.tsx     # Cmd/Ctrl+K command palette
│       │   └── sidebar/              # Sidebar panel components
│       │       ├── FileExplorer.tsx  # File tree with type icons
│       │       ├── MemoryPanel.tsx   # Memory browser & search
│       │       ├── TerminalPanel.tsx  # Multi-tab terminal
│       │       └── SettingsPanel.tsx  # Provider & workspace config
│       └── styles/                    # CSS (custom + Tailwind)
│           ├── index.css             # Global styles
│           └── components.css        # Component styles
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.preload.json
├── tailwind.config.js
└── postcss.config.js
```

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes with clear, descriptive commits
4. Ensure TypeScript compiles without errors (`npm run typecheck`)
5. Open a pull request against the `main` branch

Please follow the project's TypeScript conventions (strict mode, composite project references) and maintain the IPC handler pattern for any new renderer ↔ main communication. Bug reports and feature requests can be filed via GitHub Issues.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
