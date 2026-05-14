# Changelog

All notable changes to VibeCode Desktop will be documented in this file.

## [0.2.0] — 2026-05-14

### Added
- **Electron Packaging System**: Full electron-builder.yml configuration with cross-platform support (Windows NSIS/portable, macOS DMG/zip, Linux AppImage/deb/snap)
- **Auto Update System**: electron-updater integration with GitHub Releases, stable/beta/nightly channels, update UX modal, download progress, rollback-safe updates
- **App Icon + Branding Pipeline**: SVG icon generation script, ICO/ICNS/PNG variant generation, splash screen, about window, tray icon support
- **E2E Testing System**: Playwright integration with 12 user-flow test suites covering app launch, provider config, workspace ops, execution, proposals, rollback, session restore, file operations, diff engine, auto-update, and settings persistence
- **License + Legal Structure**: EULA template, privacy policy template, terms of service template, security disclosure policy, responsible AI policy, contributor guidelines
- **Licensing Strategy Recommendation**: Comprehensive analysis of proprietary/open-source/open-core/source-available/SaaS models with recommendation for BSL 1.1 source-available model
- **Analytics + Business Telemetry**: Privacy-first opt-in analytics service, consent management, anonymized event tracking, transparent data collection, telemetry settings UI integration
- **Backend Architecture Proposal**: Full API architecture docs covering auth, licensing, updates, analytics, sync, credits services with deployment recommendations
- **GitHub Actions CI/CD**: Build/test/release workflows, multi-platform packaging, automated release creation, artifact uploads
- **Build Scripts**: Production build script with environment separation (dev/staging/prod), release script with semantic versioning and changelog generation
- **macOS Entitlements**: Hardened runtime entitlements for code signing and notarization

### Changed
- Version bumped from 0.1.0 to 0.2.0
- Package.json updated with new scripts, dependencies (electron-updater, sharp, playwright, @electron/notarize)
- IPC system extended with updater and analytics handlers
- Preload API extended with updater, telemetry, and analytics namespaces
- Main process integrated with auto-updater service and analytics initialization

## [0.1.0] — 2026-05-14

### Added
- ARC 5 — Productization, Provider UX, and Full System Validation
- Provider Configuration System with 5 providers (OpenAI, Anthropic, Gemini, Ollama, LM Studio)
- Workspace UX with folder picker, recent workspaces, multi-workspace support
- Diff + Execution UX with proposal card upgrades, diff previews, execution queue
- Stability + Performance monitoring with heap/FPS/IPC telemetry
- Testing Infrastructure with 209 tests passing
- UI/UX Polish with animations, skeleton states, keyboard shortcuts
- Production Hardening with CSP, IPC validation, zod schemas, rate limiting, audit logging

## [0.1.0-alpha] — 2026-05-14

### Added
- ARC 4 — Core Execution Pipeline Stabilization
- Real ExecutionEngine with dependency resolution, rollback, retry
- ProposalCard integration with AI→Proposal→Execution loop
- MemoryStore optimization with inverted index, LRU, compaction
- Filesystem sandboxing with PathSandbox
- Session continuity with crash recovery
