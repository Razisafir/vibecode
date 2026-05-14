# Changelog

All notable changes to VibeCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Professional README with product landing page
- Repository infrastructure audit and remediation blueprint
- Root .gitignore with comprehensive coverage
- LICENSE (proprietary, all rights reserved)
- EULA.md for distributed application
- PRIVACY.md (telemetry and privacy notice)
- DISCLAIMER.md (warranty and liability disclaimer)
- SECURITY.md (vulnerability reporting policy)
- SUPPORT.md (support channels)
- .editorconfig for consistent editor settings
- .gitattributes for line ending normalization
- .gitleaks.toml for secret scanning configuration
- CODEOWNERS for code ownership definitions
- GitHub issue templates (bug report, feature request, first impressions)
- GitHub pull request template
- /docs/ documentation foundation
  - getting-started.md
  - configuration.md
  - troubleshooting.md
  - release-process.md

### Changed
- .gitignore expanded to cover root-level environment files, session artifacts, and nested repo clones
- package.json license field set to UNLICENSED

### Removed
- Nested vibecode-repo/ duplicate directory (stale copy)
- Committed .env file from git tracking
- Stale download/ directory with session artifacts and screenshots
- Stale agent-ctx/ directory with development context files

## [0.1.0-alpha.1] - 2024-XX-XX

### Added
- Electron desktop application with React + TypeScript + Vite
- AI-native coding workspace with multi-provider support (OpenAI, Anthropic, Google, Ollama)
- Structured change proposal system with approval workflow
- 7 executor types (file_write, file_read, file_edit, command, code_generation, code_edit, diff_apply)
- 9 IPC namespaces for main-renderer communication
- PathSandbox with 6-step validation for file system security
- Semantic memory system with JSONL persistence, inverted index, and LRU cache
- Provider routing with scoring algorithm (priority × 10 + latency / 100 - availability bonus)
- Session persistence and crash recovery
- Rollback snapshot system persisted to ~/.vibecode/rollbacks/
- Two-tier auto-save (30s full state, 10s workspace-only)
- Onboarding flow with provider configuration
- Command palette for quick actions
- Memory panel for browsing semantic memory
- Settings panel for provider and workspace configuration
- File explorer sidebar
- Integrated terminal panel
