# Changelog

All notable changes to VibeCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CODE_OF_CONDUCT.md — community standards and enforcement process
- SECURITY_MODEL.md — high-level security boundaries and trust model
- SUPPORT_POLICY.md — supported versions, scope, response expectations
- VERSIONING_POLICY.md — semantic versioning rules and breaking change definition
- RELEASE_CHECKLIST.md — step-by-step pre-release verification
- RELEASE_CHANNELS.md — alpha, beta, and stable channel definitions
- COMPATIBILITY_MATRIX.md — OS × Node × Electron compatibility table
- docs/INDEX.md — fully structured documentation index with grouping
- Non-technical interpretation guide for GREEN/YELLOW/RED health grades (system-status.md)
- Decision-tree debugging flowchart (troubleshooting.md)
- Clarified .env file loading behavior in dev mode (operational-guide.md)

### Changed
- docs/README.md updated with link to docs/INDEX.md
- CONTRIBUTING.md now links to CODE_OF_CONDUCT.md and docs/INDEX.md
- SUPPORT.md now links to SUPPORT_POLICY.md for full policy details
- SECURITY.md now links to SECURITY_MODEL.md for architectural trust boundaries
- MAINTAINERS.md now links to RELEASE_CHECKLIST.md
- docs/release-process.md now links to RELEASE_CHECKLIST.md and VERSIONING_POLICY.md
- README.md: added badges (Tests, Node.js, Version), Production Readiness table, Stability Guarantees section, Architecture Stability Promise, Governance & Policy docs section
- README.md: Quick Start now distinguishes developer vs user paths
- README.md: fixed "Hardened safety" alignment in Operational Modes diagram

### Fixed
- Node.js version requirement corrected from "18+" to "20.x" in first-30-minutes.md

## [0.1.0-alpha.1] - 2026-05-14

### Added — Application Core
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

### Added — User Interface
- Onboarding flow with provider configuration
- Command palette for quick actions
- Memory panel for browsing semantic memory
- Settings panel for provider and workspace configuration
- File explorer sidebar
- Integrated terminal panel

### Added — Operational Intelligence
- Failure intelligence layer (7 failure categories with root cause inference)
- Status provider with health grading (GREEN/YELLOW/RED) and failure analysis
- Failure map static knowledge catalog
- Health check HTTP server (env-var gated, preview mode)
- Watchdog process monitor (opt-in, requires PM2)
- PM2 process supervision (opt-in, preview mode)

### Added — Repository Infrastructure
- Professional README with product landing page
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
- .nvmrc for Node.js version pinning
- GitHub issue templates (bug report, feature request, first impressions)
- GitHub pull request template
- Release notes template (.github/release-notes-template.md)
- CONTRIBUTING.md with commit conventions and PR process
- MAINTAINERS.md with governance and triage process

### Added — Documentation
- docs/getting-started.md — installation, first launch, key concepts
- docs/configuration.md — environment variables and provider setup
- docs/troubleshooting.md — common issues and solutions
- docs/release-process.md — release checklist and alpha channel
- docs/architecture-overview.md — system layers, data flow, diagrams
- docs/system-philosophy.md — design principles and trade-offs
- docs/repository-map.md — codebase navigation and file guide
- docs/first-30-minutes.md — guided onboarding walkthrough
- docs/operational-guide.md — complete command and mode reference
- docs/operational-safety.md — guardrails and mode compatibility
- docs/system-status.md — failure categories and JSON schema
- docs/glossary.md — terminology reference
- docs/faq.md — frequently asked questions
- docs/README.md — documentation hub with reading paths

### Changed
- .gitignore expanded to cover root-level environment files, session artifacts, and nested repo clones
- package.json license field set to UNLICENSED
- README badges now link to actual CI workflow status
- Documentation cross-references updated across all docs
- Troubleshooting guide expanded with developer-specific issues

### Removed
- Nested vibecode-repo/ duplicate directory (stale copy)
- Committed .env file from git tracking
- Stale download/ directory with session artifacts and screenshots
- Stale agent-ctx/ directory with development context files
