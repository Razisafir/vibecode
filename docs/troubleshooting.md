# Troubleshooting

This guide covers both user-facing and developer-facing issues. If your problem is not listed here, try `npm run status` for automated diagnostics, or check the [FAQ](faq.md) for common questions.

---

## Decision Tree: Where to Start

Follow this flowchart to quickly identify where your problem is and which section to read:

```
START: Something is wrong with VibeCode
  │
  ├─ Is VibeCode not starting at all?
  │   ├─ Yes → "Application Crashes on Startup" (User Issues)
  │   └─ No → Continue below
  │
  ├─ Is the AI not responding or giving errors?
  │   ├─ Yes → "No provider available" Error or "API Key Not Working" (User Issues)
  │   └─ No → Continue below
  │
  ├─ Is VibeCode running but something feels wrong?
  │   ├─ Yes → Run: npm run status
  │   │   ├─ GREEN → Your issue may be in the app itself. Check "Proposals Not Loading"
  │   │   │         or "Workspace Not Indexing Files" (User Issues)
  │   │   ├─ YELLOW → Read the gradeReason. Check the Failure Analysis.
  │   │   │           Follow the suggested action or continue below.
  │   │   └─ RED → Read the Failure Analysis section.
  │   │             Follow the Safe Recovery Path exactly.
  │   └─ No → Continue below
  │
  ├─ Is the problem during development (build/test/lint)?
  │   ├─ TypeScript errors → "TypeScript Compilation Errors" (Developer Issues)
  │   ├─ Build failures → "Build Failures" (Developer Issues)
  │   ├─ Test failures → "Test Failures" (Developer Issues)
  │   ├─ Lint errors → "Lint Errors" (Developer Issues)
  │   └─ npm install fails → "npm install Fails" (Developer Issues)
  │
  ├─ Is the problem with preview mode (PM2, health server)?
  │   ├─ Preview won't start → "npm run status" → check PM2_MISCONFIGURATION
  │   ├─ Health endpoint not responding → "npm run status" → check HEALTH_SERVER_DOWN
  │   ├─ App keeps restarting → "npm run status" → check WATCHDOG_INSTABILITY
  │   └─ Can't stop preview → Run: npm run preview:stop
  │
  └─ Is the problem with git/CI?
      ├─ Pre-commit hooks failing → "Pre-Commit Hooks Failing" (Developer Issues)
      └─ CI failing on GitHub → "CI Pipeline Failing on GitHub" (Developer Issues)
```

**One-command shortcut:** When in doubt, run `npm run status`. It tells you the system's health, identifies the failure category, and provides recovery steps.

---

## User Issues

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
1. Run `npm run status` for automated system diagnostics
2. Search [GitHub Issues](https://github.com/Razisafir/vibecode/issues)
3. Check [FAQ](faq.md) for common questions
4. Check [SECURITY.md](../SECURITY.md) for security-related issues
5. Email support@vibecode.dev

---

## Developer Issues

This section covers issues that developers encounter when building, testing, or contributing to VibeCode.

### TypeScript Compilation Errors

**Symptoms:** `npm run typecheck` or `npm run build` fails with type errors.

**Solutions:**
1. Ensure you are using Node.js 20 (check `.nvmrc`)
2. Run `npm install` to ensure all type definitions are present
3. If you see errors in `.d.ts` files, run `npm run clean && npm install`
4. Check that you have not accidentally modified any `tsconfig*.json` files
5. If errors persist after a clean install, you may have a local type conflict — delete `node_modules` and reinstall

### Build Failures

**Symptoms:** `npm run build` or `npm run ci` fails.

**Solutions:**
1. Run `npm run clean` to remove stale build artifacts
2. Run `npm run build:main && npm run build:preload && npm run build:renderer` to identify which step fails
3. Check that `node-pty` compiled correctly (it has native bindings that can fail on some systems)
4. If Vite build fails, check `vite.config.ts` for path or plugin issues
5. If Electron build fails, ensure you have the required build tools for your platform

### Test Failures

**Symptoms:** `npm run test` reports failing tests.

**Solutions:**
1. Check if the failure is in a specific test file: `npx vitest run tests/path-sandbox.test.ts`
2. Run tests with verbose output: `npx vitest run --reporter=verbose`
3. Some tests depend on environment variables — ensure no stale env vars are set
4. If tests pass locally but fail in CI, check for OS-specific behavior (CI runs on Ubuntu)
5. Check that test fixtures and mocks are not stale

### Lint Errors

**Symptoms:** `npm run lint` reports errors.

**Solutions:**
1. Auto-fix what you can: `npx eslint --fix src/`
2. Review the ESLint config at `eslint.config.js` for the rules being enforced
3. Do not suppress errors with `eslint-disable` without a documented reason
4. If you see warnings about React hooks, check the hooks dependency array

### "npm install" Fails

**Symptoms:** `npm install` exits with errors, especially around `node-pty`.

**Solutions:**
1. Ensure you have build tools installed: `xcode-select --install` (macOS), `npm install -g windows-build-tools` (Windows), or `sudo apt install build-essential` (Linux)
2. Try `npm install --legacy-peer-deps` if there are peer dependency conflicts
3. Clear the npm cache: `npm cache clean --force`
4. Delete `node_modules` and `package-lock.json` and try again
5. Check that you are using npm 9+ and Node.js 20

### Pre-Commit Hooks Failing

**Symptoms:** Git commit is blocked by pre-commit hooks.

**Solutions:**
1. Run `npm run check:all` to see which check is failing
2. `check:env` failing: You have a `.env` file staged for commit. Unstage it: `git reset HEAD .env`
3. `check:secrets` failing: A staged file contains a secret pattern. Remove the secret or use environment variables
4. `check:gitignore` failing: A gitignored file is somehow staged. Unstage it: `git reset HEAD <file>`
5. Do not bypass pre-commit hooks with `--no-verify` without understanding why they are failing

### CI Pipeline Failing on GitHub

**Symptoms:** Push or PR shows failing CI checks on GitHub.

**Solutions:**
1. Reproduce locally: `npm run ci`
2. Check which job is failing (typecheck, lint, test, or build)
3. CI runs on Ubuntu — if your code works locally on macOS/Windows but fails in CI, check for platform-specific assumptions
4. Check that your branch is up to date with `main`: `git rebase origin/main`
5. Review the CI logs on GitHub Actions for specific error messages
