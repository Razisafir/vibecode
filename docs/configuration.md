# Configuration Reference

## Environment Variables

VibeCode uses environment variables for provider configuration and system
settings. These can be set in the `.env` file or configured through the
Settings panel.

### AI Provider API Keys

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | No* | OpenAI API key (sk-...) |
| `ANTHROPIC_API_KEY` | No* | Anthropic API key |
| `GOOGLE_API_KEY` | No* | Google AI (Gemini) API key |

\* At least one provider key is required for VibeCode to function.

### Custom API Endpoints

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Custom OpenAI-compatible endpoint |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Custom Anthropic endpoint |

Use these to connect to proxy servers, Azure OpenAI, or other
OpenAI-compatible APIs.

### Workspace and Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBECODE_WORKSPACE_DIR` | `~/.vibecode/workspaces` | Workspace metadata storage |
| `VIBECODE_MEMORY_DIR` | `~/.vibecode/memory` | Semantic memory storage |

### .env File Location

The `.env` file should be placed in the `vibecode-desktop/` directory:

```
vibecode-desktop/
├── .env          ← Your API keys go here
├── .env.example  ← Template (never commit actual .env)
├── src/
└── ...
```

**Never commit your `.env` file to version control.** It is excluded by
`.gitignore`.

## Settings Panel

Access settings via the sidebar gear icon or Cmd/Ctrl+,.

### Providers

Configure and test AI provider connections:
- Add, remove, or update API keys
- Set default provider and model
- Configure custom endpoints
- Set provider priority for routing

### Workspace

Manage workspace-specific settings:
- Workspace root directory
- Allowed file extensions
- Excluded directories (node_modules, .git, dist)
- Memory retention settings

### Appearance

- Theme (dark/light)
- Font size and family
- Panel layout preferences

### Privacy

- Telemetry on/off toggle
- Crash reporting on/off toggle
- Data export

### Updates

- Current version
- Update channel (stable/beta/alpha)
- Check for updates
- Auto-update toggle

## Provider Routing

VibeCode routes requests to the best available provider using a scoring
algorithm:

```
score = (priority × 10) + (latency / 100) - availability_bonus
```

You can set provider priority in Settings > Providers. Higher priority
providers are preferred when multiple providers are available.

## File Structure

VibeCode stores all user data in `~/.vibecode/`:

```
~/.vibecode/
├── workspaces/          # Workspace metadata
├── memory/              # Semantic memory store
├── rollbacks/           # Pre-change snapshots
├── sessions/            # Session persistence
├── config.json          # Application configuration
└── backups/             # (future) Automatic backups
```
