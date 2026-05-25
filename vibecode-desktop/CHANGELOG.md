# VibeCode Desktop — Changelog

## [0.8.0] — Phase 10: Integration & Release Readiness

### Added
- Integration tests for Plugin + Window, Telemetry + Plugin, Safety + Plugin, IPC end-to-end, State Consistency, and Boot Sequence
- CI/CD pipelines: ci.yml, release.yml, smoke-test.yml
- Build configuration: electron-builder.yml with macOS, Windows, Linux targets
- macOS entitlements.plist for hardenedRuntime
- Release readiness script (check-release-readiness.ts)
- Brand audit script (audit-brand.ts)
- Dependency audit script (audit-deps.ts)
- README.md with project overview and setup instructions
- CHANGELOG.md covering all 10 phases

## [0.7.0] — Phase 9: Multi-Window Architecture

### Added
- WindowManager with state machine for window lifecycle
- WindowHandle with indirect window references (no BrowserWindow)
- IPCRouter with per-window routing, broadcast, and message enrichment
- WindowSession with debounced auto-save and crash recovery
- 77 Phase 9 tests across 3 test files

### Fixed
- IPC rate-limit test missing handlers
- Debounced save now stores in memory immediately
- Active windows filter excludes closed windows
- PluginAPI dynamic import for ESM compatibility
- WindowHandle callback types use WindowState

## [0.6.0] — Phase 8: Plugin Architecture

### Added
- PluginManager with state machine (unloaded→loaded→activated→deactivated→error)
- PluginSandbox with console redirection, timer tracking, memory monitoring, IPC rate limiting, prototype pollution prevention
- PluginAPI with capability-based proxy, fs scoping, command registration, telemetry prefix
- PluginRegistry with manifest validation, dependency resolution, conflict detection, file watching
- 97 Phase 8 tests across 5 test files

### Fixed
- Plugin reactivation bug: deactivate() now uses softReset() instead of dispose()
- Missing StateManager implementation in state.ts
- Missing clearLifecycleHooks export
- Missing HealthCheckResult/TelemetryEvent types
- Test import fixes and state transition fixes

## [0.5.0] — Phase 7: Performance Verification

### Added
- Lazy initialization: watchdog (10s delay), health-server (on request), audit-log (on entry)
- Telemetry sampling: 100% for first 60s, then 10% default
- Ring buffer sizes configurable and reduced
- IPC batch processing for high-frequency channels
- 37 Phase 7 tests

## [0.4.0] — Phase 6: Type Safety

### Added
- TypeScript compilation verified with 0 new errors in src/system/
- Branding extraction complete
- Runtime safety guard stub created

## [0.3.0] — Phase 5: Brand Consistency

### Fixed
- Circular type references resolved (failure-map.ts as canonical source)
- Added PM2_MISCONFIGURATION to FailureCategory
- Removed 18 stale files
- Brand violations in documentation corrected

## [0.2.0] — Phase 4: Supervision Layer

### Added
- Watchdog with lazy initialization (10s delay)
- Crash recovery pipeline: detect → dump → restore
- Session recovery restores previous workspace state
- Crash dump generation for post-mortem analysis

## [0.1.0] — Phase 3: Runtime Contracts

### Added
- Lifecycle hooks registered and execute in order
- CSP enforcement blocks inline scripts
- Safe mode disables non-essential services

## [0.0.2] — Phase 2: Kernel Contracts

### Added
- ServiceRegistry interface properly defined
- State machine transitions for ServiceState
- FailureCategory covers all known failure modes

## [0.0.1] — Phase 1: Foundation Audit

### Added
- Architecture audit confirmed clean layer separation
- Import wall verified: src/system/ → src/main/ prohibited except lifecycle.ts
- 6 service layers functional: kernel, runtime, supervision, observability, main, renderer
