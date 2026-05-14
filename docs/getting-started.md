# Getting Started with VibeCode

## Installation

### Prerequisites
- macOS 12+, Windows 10+, or Linux (Ubuntu 20.04+)
- Internet connection for AI provider access
- At least one AI provider API key

### Download
Download the latest release from [GitHub Releases](https://github.com/Razisafir/vibecode/releases).

| Platform | File |
|----------|------|
| macOS | `VibeCode-{version}-mac.dmg` |
| Windows | `VibeCode-Setup-{version}.exe` |
| Linux | `VibeCode-{version}.AppImage` |

### Install

**macOS:**
1. Open the DMG file
2. Drag VibeCode to Applications folder
3. Launch from Applications (first launch may require right-click > Open due to Gatekeeper)

**Windows:**
1. Run the NSIS installer
2. Accept the EULA
3. Choose install location
4. Launch from Start Menu

**Linux:**
1. `chmod +x VibeCode-{version}.AppImage`
2. `./VibeCode-{version}.AppImage`

## First Launch

### Onboarding

When you first launch VibeCode, the onboarding flow will guide you through:

1. **Welcome screen** — Overview of VibeCode capabilities
2. **Provider setup** — Configure your AI provider API keys
3. **Workspace creation** — Create or open your first project

### Configuring AI Providers

VibeCode requires at least one AI provider to function. During onboarding
(or later in Settings), configure one or more providers:

| Provider | Required Key | Get Key |
|----------|-------------|---------|
| OpenAI | `OPENAI_API_KEY` | platform.openai.com/api-keys |
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com |
| Google Gemini | `GOOGLE_API_KEY` | aistudio.google.com/apikey |
| Ollama | No key needed | ollama.com (run locally) |

Enter your API key in Settings > Providers. Keys are stored locally on your
device and never transmitted to VibeCode servers.

## Your First Project

1. **Create a workspace**: Click "New Workspace" or use the command palette (Cmd/Ctrl+K)
2. **Select a directory**: Choose the project folder you want VibeCode to understand
3. **Start a conversation**: Type a question or request in the AI panel
4. **Review proposals**: VibeCode will analyze your codebase and propose changes
5. **Approve or reject**: Each proposed change requires your explicit approval
6. **Execute**: Approved changes are applied to your files

## Key Concepts

### Proposals
VibeCode never makes changes without your approval. When you ask for a change,
VibeCode creates a **proposal** — a structured diff showing exactly what will be
modified. You review each proposal and choose to approve, modify, or reject it.

### Memory
VibeCode builds persistent memory of your project across sessions. This memory
includes architectural decisions, file relationships, and patterns. The more you
use VibeCode with a project, the better it understands your codebase.

### Sandbox
All file operations are validated through PathSandbox, which restricts access
to allowed directories and blocks access to system paths. VibeCode cannot
modify files outside your workspace without explicit configuration.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + K | Open command palette |
| Cmd/Ctrl + Enter | Send message to AI |
| Cmd/Ctrl + Shift + P | Toggle AI panel |
| Cmd/Ctrl + B | Toggle sidebar |

## Getting Help

- [Configuration Guide](configuration.md)
- [Troubleshooting](troubleshooting.md)
- [GitHub Issues](https://github.com/Razisafir/vibecode/issues)
