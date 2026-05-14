# Troubleshooting

## Common Issues

### "No provider available" Error

**Cause:** No AI provider API key is configured, or all configured providers
are unreachable.

**Solutions:**
1. Open Settings > Providers and add at least one API key
2. Verify your API key is valid and has available credits
3. Check your internet connection
4. If using Ollama, verify the Ollama service is running locally

### API Key Not Working

**Symptoms:** "Authentication error", "Invalid API key", or "Rate limit exceeded"

**Solutions:**
1. Verify the key is correct (no trailing spaces or line breaks)
2. Check that the key has not expired or been revoked
3. For OpenAI: Verify at platform.openai.com/api-keys
4. For Anthropic: Verify at console.anthropic.com
5. Check your account balance and usage limits
6. If using a custom base URL, verify it is correct

### Application Crashes on Startup

**Solutions:**
1. Delete the configuration file: `rm ~/.vibecode/config.json`
2. Clear session data: `rm -rf ~/.vibecode/sessions/`
3. Verify Node.js/Electron requirements are met
4. Check for conflicting software (antivirus may block Electron apps)

### Proposals Not Loading

**Symptoms:** AI panel shows loading spinner indefinitely, or proposals never appear.

**Solutions:**
1. Check your internet connection
2. Verify your API key and provider status
3. Try switching to a different provider in Settings
4. Check the developer console (Cmd/Ctrl+Shift+I) for errors
5. Restart VibeCode

### Workspace Not Indexing Files

**Symptoms:** VibeCode does not seem to understand your project files.

**Solutions:**
1. Verify the workspace root directory is correct
2. Check that file extensions are not excluded in Settings > Workspace
3. Large projects may take time to index — wait for the indexing indicator
4. Restart the workspace via command palette > "Reload Workspace"

### Memory Not Persisting Across Sessions

**Solutions:**
1. Verify VIBECODE_MEMORY_DIR is set correctly
2. Check disk space on the volume containing ~/.vibecode/
3. Ensure the memory directory has write permissions
4. Do not manually modify files in ~/.vibecode/memory/

### PathSandbox Blocking Legitimate Access

**Symptoms:** "PathSandbox: Access denied" errors for files you want VibeCode
to modify.

**Solutions:**
1. Verify the file is within your workspace root directory
2. Check that the file extension is not in the blocked list
3. Add the directory to allowed paths in Settings > Workspace
4. System directories (~/.ssh, ~/.gnupg, /etc, /usr) are always blocked

### High Memory Usage

**Solutions:**
1. Large workspaces consume more memory — consider excluding node_modules,
   dist, and build directories
2. Reduce memory retention period in Settings > Workspace
3. Clear semantic memory via Settings > Memory > Clear
4. Restart VibeCode to release accumulated memory

### Auto-Update Not Working

**Solutions:**
1. Check your internet connection
2. Verify the update channel is set correctly in Settings > Updates
3. GitHub Releases must be accessible from your network
4. Manual update: Download the latest version from GitHub Releases

## Getting More Help

If your issue is not listed here:
1. Search [GitHub Issues](https://github.com/Razisafir/vibecode/issues)
2. Check [SECURITY.md](../SECURITY.md) for security-related issues
3. Email support@vibecode.dev
