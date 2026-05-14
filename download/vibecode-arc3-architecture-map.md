# VibeCode Desktop — Updated Architecture Map

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
│  │  │    Instance   │  │  - session:* │  │                   │   │   │
│  │  │              │  │  - execution:*│  │  Data:            │   │   │
│  │  │              │  │  - workspace:*│  │  ~/.vibecode/     │   │   │
│  │  │              │  │  - app:*     │  │  ├── memory/      │   │   │
│  │  └─────────────┘  └──────────────┘  │  ├── sessions/    │   │   │
│  │                                      │  ├── workspaces/  │   │   │
│  │                                      │  └── providers.json│   │   │
│  │                                      └───────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↕ IPC                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Preload (contextBridge)                     │   │
│  │              window.vibecode = { fs, terminal, provider,       │   │
│  │                 memory, session, execution, workspace, app }   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↕ window.vibecode                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    React Renderer (Vite)                       │   │
│  │                                                                │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │  TitleBar (32px) — Traffic Lights | VIBECODE | Controls│   │   │
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
│  │  │  Onboarding Overlay (4 steps)  │  Command Palette (Cmd+K) │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Hooks: useAIChat, useSession, useWorkspace                          │
│  Types: VibeCodeAPI, ChatMessage, MemoryEntry, Provider, etc.       │
│  Styles: Custom CSS system (btn, input, card, badge, tooltip)        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Data Flow:
  User Input → AI Panel → Provider Manager → API → Streaming Response → Chat Messages
  Chat Messages → Memory Store → JSONL Persistence → Search/Rank → Context Retrieval
  Execution Plan → Step Queue → Dependency Sort → Execute → Proposal Card → User Approve → File Ops
  App State → Session Manager → Auto-Save (30s) → JSON Persistence → Restore on Start
```
