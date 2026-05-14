# Frequently Asked Questions

This document collects the most common questions about VibeCode, organized by topic. If your question is not answered here, check the [Glossary](glossary.md) for terminology or the [Troubleshooting](troubleshooting.md) guide for specific issues.

---

## General

### What is VibeCode?

VibeCode is a desktop AI engineering partner that understands your codebase, proposes structured changes, and executes them only with your explicit approval. It runs locally on your machine, persists memory across sessions, and never modifies your code without your consent. See the [README](../README.md) for the full overview.

### How is VibeCode different from Cursor, GitHub Copilot, or Replit?

VibeCode differs in four key ways: (1) it requires explicit approval before every action — there is no auto-apply mode, (2) it maintains persistent memory of your project across sessions rather than starting from scratch each time, (3) it provides per-step rollback for every execution, not just inline suggestions, and (4) it can run fully offline with Ollama, requiring no internet connection or cloud services. See the comparison table in the [README](../README.md) for a detailed breakdown.

### Is VibeCode free?

VibeCode is in alpha and is available for evaluation. See [LICENSE](../LICENSE) and [EULA.md](../EULA.md) for the current licensing terms. You will need your own AI provider API keys (OpenAI, Anthropic, or Google) or a local Ollama installation.

### What platforms does VibeCode support?

VibeCode runs on macOS 12+, Windows 10+, and Linux (Ubuntu 20.04+). It is built as an Electron desktop application with platform-specific installers for each OS.

---

## Safety & Trust

### Can VibeCode modify files without my permission?

No. VibeCode uses an approval-first execution model. Every AI-proposed action is presented as a structured proposal showing exactly what will change, which files are affected, and what the risk level is. You must explicitly approve the proposal before any code touches the filesystem. There is no auto-apply mode, no background execution, and no way to bypass the approval flow. See [System Philosophy](system-philosophy.md) for the reasoning behind this design.

### What happens if VibeCode makes a mistake?

Every execution step creates a rollback snapshot before making changes. If a step produces unwanted results, you can roll back individual steps or the entire plan. The rollback system is persisted to disk, so you can undo changes even after restarting the application. See the [Architecture Overview](architecture-overview.md) for how the rollback engine works.

### Can VibeCode access files outside my project?

No. The PathSandbox validates every file operation against the project workspace root. It enforces a six-step validation pipeline that blocks access to system directories (`.ssh`, `.aws`, `.gnupg`), blocks dangerous file extensions (`.exe`, `.pem`, `.key`), and prevents any operation outside the configured workspace. See [System Philosophy](system-philosophy.md) for details on the safety model.

### Does VibeCode send my code to the cloud?

VibeCode sends your prompts and relevant code context to your configured AI provider (OpenAI, Anthropic, or Google) for processing. This is how all AI coding tools work. However, your API keys are stored locally and never transmitted to VibeCode servers. You can use Ollama for fully offline operation where no data leaves your machine. See [PRIVACY.md](../PRIVACY.md) for the complete privacy notice.

### Is the diagnostic system safe to run?

Yes. The `npm run status` command and the entire failure intelligence layer are strictly read-only. They observe and interpret system state but never modify it. They never restart processes, never execute fixes, and never change configuration. All diagnostic output consists of suggestions for you to act on manually. See [System Status](system-status.md) for details.

---

## AI Providers

### Do I need an internet connection?

Only if you are using cloud-based AI providers (OpenAI, Anthropic, Google Gemini). If you install [Ollama](https://ollama.ai) and pull a model, VibeCode works fully offline with no internet connection and no API keys required.

### Can I use multiple AI providers at the same time?

Yes. VibeCode supports configuring multiple providers simultaneously. The provider routing algorithm selects the best available provider based on priority, latency, and availability. If one provider fails, VibeCode automatically fails over to the next available provider. See [Configuration](configuration.md) for setup instructions.

### Which Ollama models work best?

Most Ollama models that support chat completions will work. For code understanding and generation, models like `codellama` and `deepseek-coder` tend to produce the best results. Smaller models (7B parameters) work but may produce less accurate proposals. Larger models (34B+) produce better results but require more RAM and slower inference. See [Ollama's model library](https://ollama.ai/library) for available options.

### Are my API keys stored securely?

API keys are stored locally on your device in the VibeCode configuration directory. They are never transmitted to VibeCode servers. The pre-commit hooks block any attempt to commit `.env` files containing real API keys. See [PRIVACY.md](../PRIVACY.md) for details.

---

## Operational Modes

### Which mode should I use?

| Use Case | Mode | Command |
|----------|------|---------|
| Writing code and seeing changes immediately | DEV | `npm run dev` |
| Testing process supervision or health endpoints | PREVIEW | `npm run preview:start` |
| Building an installable package | PRODUCTION | `npm run dist` |

99% of the time, you should use DEV mode. See the [Operational Guide](operational-guide.md) for full details on each mode.

### Why does `npm run health` fail in DEV mode?

The health server only runs in PREVIEW mode. In DEV mode, there is no health endpoint, so `npm run health` will report "not responding." This is expected behavior, not an error. If you need to test health endpoints, switch to PREVIEW mode with `npm run preview:start`.

### Can I run DEV and PREVIEW mode simultaneously?

No. VibeCode uses a single-instance lock that prevents two Electron processes from running at the same time. Stop one mode before starting the other. See [Operational Safety](operational-safety.md) for mode compatibility rules.

### What is the watchdog and should I enable it?

The watchdog is an optional process monitor that automatically restarts VibeCode via PM2 if the health endpoint becomes unresponsive. It is only useful in PREVIEW mode for long-running staging environments. Do not enable it during normal development — it will restart the app and hide crash information you need for debugging. See the [Operational Guide](operational-guide.md) for details.

---

## Memory & Sessions

### What does VibeCode remember?

VibeCode stores structured knowledge about your project: architectural decisions, bug fix histories, code patterns, and user preferences. It does NOT store raw conversation text or file contents — only extracted facts and relationships. See [System Philosophy](system-philosophy.md) for the memory design rationale.

### Can I clear VibeCode's memory?

Yes. You can clear semantic memory through Settings > Memory > Clear, or by deleting the contents of `~/.vibecode/memory/`. The AI will re-learn your project over time. See [Configuration](configuration.md) for data directory locations.

### What happens if VibeCode crashes?

VibeCode detects crashes on next launch and offers a recovery prompt. The recovered session includes the full conversation and execution state. At worst, the last few seconds of conversation may be missing. See [System Philosophy](system-philosophy.md) for the crash recovery design.

### Where is my data stored?

All VibeCode data is stored locally in `~/.vibecode/` (DEV mode) or `~/.vibecode-preview/` (PREVIEW mode). This includes workspaces, memory, sessions, rollbacks, and configuration. No data is transmitted to VibeCode servers. See [Configuration](configuration.md) for the full directory structure.

---

## Development & Contributing

### How do I run the test suite?

```bash
cd vibecode-desktop
npm run test          # Run all tests
npm run ci            # Full CI: typecheck + lint + test + build
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the complete contribution guide.

### How do I diagnose system issues?

Run `npm run status`. This single command tells you the current mode, which processes are active, whether the health endpoint is responding, and grades overall health as GREEN, YELLOW, or RED. If the system is degraded, it automatically provides failure analysis with likely causes and recovery steps. See [System Status](system-status.md) for details.

### Where can I find the source code for a specific feature?

Use the [Repository Map](repository-map.md) as your navigation layer. It lists every directory and file in the codebase with a brief description of its purpose. The map also identifies operationally critical files and optional systems.

---

## Something Not Answered Here

- **Terminology question?** Check the [Glossary](glossary.md)
- **Something broken?** Check [Troubleshooting](troubleshooting.md)
- **Security concern?** Email security@vibecode.dev (see [SECURITY.md](../SECURITY.md))
- **Feature request?** [Open a GitHub issue](https://github.com/Razisafir/vibecode/issues/new?template=feature_request.yml)
- **General support?** Email support@vibecode.dev (see [SUPPORT.md](../SUPPORT.md))
