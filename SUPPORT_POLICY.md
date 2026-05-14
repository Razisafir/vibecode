# Support Policy

This document defines what VibeCode supports, the scope of support commitments, and response expectations. It is intended to set clear boundaries so that users and contributors understand what they can rely on.

---

## Supported Versions

| Version | Status | Support Level |
|---------|--------|---------------|
| `0.1.0-alpha` | Current release | Best-effort |
| Pre-release builds | Experimental | No guarantee |

VibeCode is in alpha. Until version 1.0 is released, support is provided on a best-effort basis. There are no long-term support commitments for alpha versions.

---

## What Is Supported

### Core Functionality

The following features are considered supported and receive priority attention for bug fixes:

- AI proposal generation and approval workflow
- File read, write, and edit execution via the PathSandbox
- Session persistence and crash recovery
- Semantic memory store and retrieval
- Provider configuration (OpenAI, Anthropic, Google, Ollama)
- System status and failure intelligence (`npm run status`)

### Platforms

| Platform | Support Level | Notes |
|----------|---------------|-------|
| macOS (Apple Silicon) | Tested | Primary development platform |
| macOS (Intel) | Supported | CI builds and manual testing |
| Windows 10/11 | Supported | CI builds, community-tested |
| Linux (x64) | Supported | CI runs on Ubuntu |

### Runtime Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20.x | Pinned in `.nvmrc` |
| Electron | 33.x | Specified in `package.json` |
| npm | 9+ | Included with Node.js 20 |

---

## What Is Not Supported

### Preview Mode Infrastructure

Preview mode (PM2 supervision, health server, watchdog) is provided as operational tooling for testing and staging. It is functional and tested, but:

- PM2 is invoked via `npx` and is not bundled with VibeCode
- The health server is env-var gated and intended for local monitoring only
- The watchdog is a standalone script with no built-in persistence
- These components may change significantly before version 1.0

### Third-Party Integrations

- Caddy reverse proxy configuration is documented but not supported — it is a manual, user-managed integration
- AI provider APIs are subject to their own terms and availability — VibeCode cannot guarantee provider uptime or behavior
- Ollama support depends on the Ollama service running correctly on the user's machine

### Experimental Features

Any feature documented as "experimental," "optional," or "not recommended for production" is not covered by support commitments. These features may be removed or changed without a deprecation period.

---

## Support Channels

| Channel | Scope | Response Target |
|---------|-------|-----------------|
| GitHub Issues | Bug reports, feature requests | Acknowledged within 7 days |
| security@vibecode.dev | Security vulnerabilities | Within 24 hours (see [SECURITY.md](SECURITY.md)) |
| support@vibecode.dev | General support questions | 3-5 business days |
| privacy@vibecode.dev | Privacy and data inquiries | 5 business days |

Before filing an issue, please:

1. Verify you are running the latest version
2. Search existing GitHub issues for duplicates
3. Run `npm run status` and include the output
4. Review [Troubleshooting](docs/troubleshooting.md) and [FAQ](docs/faq.md)

---

## Breaking Changes

During the alpha phase (pre-1.0), breaking changes may occur without a major version bump. However, the following commitments apply:

- Breaking changes will be documented in [CHANGELOG.md](CHANGELOG.md)
- When possible, a migration path will be provided
- The architecture stability promises (see README) will be honored regardless of version

After version 1.0, VibeCode will follow semantic versioning strictly. See [VERSIONING_POLICY.md](VERSIONING_POLICY.md) for details.

---

## Support Limitations

- VibeCode is maintained by a small team. Response times are targets, not guarantees.
- Support is provided in English only.
- Issues that cannot be reproduced may be closed after 30 days of inactivity.
- Feature requests are acknowledged but not guaranteed to be implemented.
- Support does not include assistance with the user's own codebase or development environment beyond what directly relates to VibeCode functionality.
