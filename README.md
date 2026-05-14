<div align="center">

# VibeCode

**The AI copilot that remembers your codebase.**

VibeCode is a desktop workspace where an AI assistant understands your project, proposes changes, and executes them — with your approval — while remembering everything across sessions.

*Because your AI should know what you built yesterday.*

[![Download](https://img.shields.io/badge/Download-Alpha-orange.svg)]()
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-47848f.svg)]()

</div>

---

## What is VibeCode?

VibeCode is an AI-native desktop application for software engineers. It gives you an AI assistant that lives inside your codebase — one that understands the full project, proposes structured changes, executes them safely with your approval, and remembers what it learned the next time you open it.

Traditional IDEs were built for humans writing code. AI plugins were bolted on after the fact. Neither was designed for an AI that actually *works* on your project — making changes, running commands, and building long-term understanding of your code.

VibeCode was.

### The gap in today's AI tools

Most AI coding tools fall into one of two categories:

**Chat assistants** — they answer questions and suggest code, but they forget everything when you close the window. Every session starts from scratch. You spend time re-explaining your project, re-uploading context, and re-establishing what the AI should already know.

**Inline autocomplete** — they complete your next line or suggest a function, but they can't plan a multi-file refactor, run a build command, or understand why a previous approach failed. They're fast, but shallow.

VibeCode sits in a different category: a **persistent AI engineering partner** that doesn't just suggest — it acts, with your permission, and carries forward everything it learns.

---

## How it works

VibeCode follows a simple, controlled workflow:

**1. You ask.** Describe what you need — a feature, a bug fix, a refactor, an explanation. The AI has full context of your project because it's been working in it.

**2. The AI plans.** Instead of jumping straight to code, VibeCode presents a structured proposal: what files will change, what commands will run, what the impact looks like, and whether it can be undone.

**3. You approve.** Review the plan. Approve it, reject it, or modify it. Nothing happens without your explicit consent.

**4. The system executes.** VibeCode applies the changes step by step — creating files, editing code, running commands. If something fails, it retries. If you change your mind, it rolls back.

**5. Results are saved.** Every action is recorded. Files are updated. Terminal output is captured. Your project is in a known state.

**6. Memory is updated.** The AI remembers what it did, what worked, what didn't, and why. Next session, it picks up where it left off — no re-explaining required.

---

## Key Features

### Safe AI-Driven Code Changes

VibeCode doesn't just suggest edits — it makes them, safely. The AI proposes multi-step execution plans that can include creating files, editing existing code, running terminal commands, and applying diffs. Each step is executed in order with automatic retry on failure, and every action can be undone with rollback. You see the plan before anything touches your code.

### Persistent Memory That Grows With Your Project

The AI remembers your project across sessions. It stores architectural decisions, bug fix histories, code patterns, and your preferences — then uses that knowledge automatically the next time you work together. It doesn't just recall past conversations; it prioritizes what matters based on importance, recency, and relevance, and prunes what no longer matters. The longer you use VibeCode, the more effective it becomes.

### Session Recovery — Never Lose Progress

Crash. Power loss. Accidental quit. It doesn't matter. VibeCode auto-saves your full session state continuously — conversation, execution plans, open files, scroll positions — and detects unsafe shutdowns on next launch. You get a recovery prompt, and everything is exactly where you left it.

### Full Control Through Approvals

The AI never runs anything without your say-so. Every proposed change comes with a risk assessment (low, medium, or high), a list of affected files, an impact summary, and a rollback indicator. You approve, reject, or modify before anything executes. For high-risk operations — like editing config files or running destructive commands — the approval requirement is automatic.

### Secure Sandbox — Your System Stays Safe

VibeCode restricts all AI actions to your project directory. The AI cannot access files outside your workspace, cannot read your SSH keys or cloud credentials, and cannot execute binaries or modify system files. Every file path and command is validated against safety rules before execution. Your system boundaries are enforced, always.

### Choose Your AI Provider

Use the model that fits your needs and budget. VibeCode supports OpenAI (GPT-4o, o1), Anthropic (Claude Sonnet 4), Google (Gemini 2.5 Pro), and local providers like Ollama for fully offline use. Switch between them freely — the AI's capabilities stay the same regardless of which model is running.

---

## Why VibeCode is different

| | VibeCode | Cursor | Replit AI | VS Code Extensions |
|---|---|---|---|---|
| **Persistent memory across sessions** | Yes — remembers decisions, patterns, and context | No — resets per conversation | Limited — workspace-aware but not persistent | No — stateless per session |
| **Execution, not just suggestions** | Proposes and executes multi-step plans with rollback | Inline edits only | Cloud-only execution | Suggestions only |
| **Approval before action** | Every change requires explicit approval | Auto-applies inline edits | Auto-applies in cloud editor | Auto-completes inline |
| **Works on your local machine** | Yes — full local filesystem access | Yes | No — cloud-only editor | Yes — but limited capabilities |
| **Crash recovery** | Full session restoration | Basic tab restore | N/A (cloud) | Basic tab restore |
| **Rollback support** | Every action is reversible | Undo stack only | Manual undo | Manual undo |
| **Offline capability** | Yes — via Ollama or local providers | No — requires cloud AI | No — cloud platform | No — requires cloud AI |
| **Long-term project understanding** | Yes — memory accumulates over time | Per-session only | Per-session only | Per-session only |

The core difference: VibeCode treats your AI assistant as a **long-term engineering partner**, not a one-off chat. It remembers. It executes. It respects your boundaries. And it gets better the more you use it.

---

## Get Started

```bash
# Clone and enter the project
git clone https://github.com/Razisafir/vibecode.git
cd vibecode/vibecode-desktop

# Install dependencies
npm install

# Launch VibeCode
npm run dev
```

On first launch, VibeCode walks you through a quick setup: choose your AI provider, select your workspace, and start coding. That's it.

Want to go fully offline? Install [Ollama](https://ollama.ai), pull a model, and select it in settings. No API keys needed.

---

## Safety & Control

Trust is non-negotiable when an AI is modifying your code. VibeCode is designed so that you remain in control at every step.

**Nothing runs without your approval.** Every file edit, every terminal command, every multi-step plan — you see it first, you decide if it happens. High-risk operations are automatically flagged and always require explicit consent.

**Your project stays contained.** The AI operates within your project directory and cannot access files outside of it. Credential directories like `.ssh` and `.aws` are blocked entirely. Binary files, executables, and archives are off-limits by default.

**Every action is reversible.** Before the AI modifies a file, it captures the original state. If a step fails or you change your mind, you can roll back individual steps or entire execution plans.

**Your data stays on your machine.** VibeCode runs locally. Your code, your conversations, and your memories are stored on your device — not in the cloud. When you use a local AI provider, nothing ever leaves your computer.

---

## Product Roadmap

### Now — Available in Alpha

- AI chat with streaming responses and multi-provider support
- Structured proposals with risk assessment and approval flow
- Safe execution of file operations and terminal commands
- Persistent memory across sessions with intelligent search and pruning
- Crash recovery with full session restoration
- Secure sandbox with project-scoped filesystem boundaries
- Local AI support via Ollama and compatible providers
- Built-in file explorer, terminal, and memory browser

### Next — Coming Soon

- Visual provider management with health status and model selection
- Monaco editor integration for in-app code editing and diff review
- Multi-root workspace support with independent memory contexts
- Enhanced memory with project-scoped timelines and automatic conversation summarization

### Future — On the Horizon

- Parallel execution for independent operations
- Plugin system for custom actions, memory backends, and AI providers
- Autonomous iteration loops — plan, execute, validate, revise — with approval only at risk boundaries
- Workspace knowledge graph with dependency mapping and architecture visualization
- Auto-update system and cross-platform installers

---

<div align="center">

**VibeCode — the AI engineering copilot that combines intelligence with control.**

It doesn't just suggest. It remembers. It executes. It respects your boundaries.

And it's ready when you are.

</div>
