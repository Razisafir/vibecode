# VibeCode Desktop

**AI-Native Desktop Operating Environment**

VibeCode is a next-generation desktop environment built from the ground up for AI-assisted development workflows. It is not a fork of VS Code or a simple Electron wrapper — it is a purpose-built operating environment that puts AI at the center of the developer experience.

## Architecture

VibeCode is organized in a clean layered architecture with strict dependency boundaries:

```
src/system/kernel/       → Core types, state management, providers
src/system/runtime/      → Plugin system, window management, lifecycle, CSP
src/system/supervision/  → Watchdog, crash recovery, session recovery, auto-update
src/system/observability/→ Telemetry, health server, audit log, status
src/main/                → Electron main process (entry point)
```

### Import Wall

The `src/system/` layer is strictly isolated from `src/main/`. The only exception is `lifecycle.ts`, which may import from `src/main/` to register Electron-specific lifecycle hooks. This boundary is enforced programmatically.

## Getting Started

### Prerequisites

- Node.js 18+ (20 recommended)
- npm 9+

### Installation

```bash
git clone https://github.com/Razisafir/vibecode-desktop.git
cd vibecode-desktop
npm install
```

### Development

```bash
npm run dev          # Start development mode
npm run build        # Build for production
npm test             # Run all tests
npm run test:system  # Run system-layer tests only
npm run typecheck    # TypeScript type checking
npm run lint         # Lint code
```

## Project Structure

```
vibecode-desktop/
├── .github/workflows/    # CI/CD pipelines
│   ├── ci.yml            # Continuous integration
│   ├── release.yml       # Release automation
│   └── smoke-test.yml    # Post-release smoke tests
├── build/                # Build resources (icons, entitlements)
├── scripts/              # Release readiness and audit scripts
├── src/
│   ├── main/             # Electron main process
│   ├── system/           # Core system layer (import-isolated)
│   │   ├── kernel/       # Types, state, providers
│   │   ├── runtime/      # Plugins, windows, IPC, lifecycle
│   │   ├── supervision/  # Watchdog, crash recovery
│   │   └── observability/# Telemetry, health, audit
│   └── tests/            # Test files
│       ├── runtime/      # Runtime unit tests
│       ├── supervision/  # Supervision unit tests
│       ├── integration/  # Integration tests
│       └── security/     # Security tests
├── electron-builder.yml  # Build configuration
├── vitest.config.ts      # Test configuration
├── tsconfig.json         # TypeScript configuration
├── VERIFICATION_REPORT.md# Phase-by-phase verification results
└── CHANGELOG.md          # Version history
```

## Testing

VibeCode has comprehensive test coverage across all system layers:

- **Unit tests**: Each module has dedicated test coverage
- **Integration tests**: Cross-module interaction verification
- **Security tests**: Plugin sandboxing, capability enforcement
- **System tests**: Full boot sequence and state consistency

```bash
npm test                    # Run all 250+ tests
npm run test:system         # Run system-layer tests only
```

## Verification

Every phase of VibeCode development has been verified by Agent Charlie (Verifier). See `VERIFICATION_REPORT.md` for the complete verification history.

## License

MIT
