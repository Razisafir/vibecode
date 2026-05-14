# Compatibility Matrix

This document specifies the platforms, runtimes, and dependencies that VibeCode supports. It is the authoritative reference for determining whether a given environment can run VibeCode.

---

## Platform Support

| Operating System | Architecture | Support Level | CI Tested | Notes |
|-----------------|-------------|---------------|-----------|-------|
| macOS 14+ (Sonoma) | Apple Silicon (M1/M2/M3) | **Primary** | Yes | Primary development platform |
| macOS 12+ (Monterey) | Intel (x64) | Supported | Yes | CI builds and manual testing |
| Windows 11 | x64 | Supported | Yes | CI builds, community-tested |
| Windows 10 (1903+) | x64 | Supported | Yes | Minimum Windows version |
| Ubuntu 22.04+ | x64 | Supported | Yes | CI runs on Ubuntu |
| Ubuntu 20.04+ | x64 | Best-effort | No | glibc 2.31 minimum |
| Other Linux (glibc 2.31+) | x64 | Best-effort | No | AppImage format, no distribution-specific testing |

### Platform Support Levels

| Level | Meaning |
|-------|---------|
| **Primary** | Actively developed and tested on every push. Issues here receive highest priority. |
| **Supported** | CI builds and periodic manual testing. Issues are addressed in normal priority. |
| **Best-effort** | No automated testing. Issues may be investigated but fixes are not guaranteed. |

---

## Runtime Requirements

| Component | Minimum Version | Recommended Version | Notes |
|-----------|----------------|--------------------|-------|
| Node.js | 20.0.0 | 20.x LTS | Pinned in `.nvmrc` |
| Electron | 33.0.0 | 33.4.0+ | Specified in `package.json` |
| npm | 9.0.0 | 10.x | Included with Node.js 20 |

### Why Node.js 20?

Node.js 20 is the active LTS release. VibeCode uses features from the Node.js 20 API surface and has not been tested with earlier versions. The `.nvmrc` file pins the exact version for reproducibility.

### Why Electron 33?

Electron 33 includes Chromium 130, which provides the rendering engine and Node.js integration used by VibeCode. The package.json dependency range (`^33.4.0`) allows patch updates within the major version.

---

## Build Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| TypeScript | 5.3+ | Source compilation |
| Vite | 5.0+ | Renderer build and dev server |
| vitest | 4.1+ | Test framework |
| electron-builder | 24.9+ | Distribution packaging |
| ESLint | 9.0+ | Code quality enforcement |

---

## Distribution Formats

| Platform | Format | Extension | Auto-Update |
|----------|--------|-----------|-------------|
| macOS | Disk image | `.dmg` | Yes |
| macOS | ZIP archive | `.zip` | Yes |
| Windows | NSIS installer | `.exe` | Yes |
| Windows | Portable | `.exe` | No |
| Linux | AppImage | `.AppImage` | Yes |
| Linux | Debian package | `.deb` | No |

---

## Dependency Compatibility

### Core Dependencies

| Package | Version Range | Purpose |
|---------|--------------|---------|
| React | ^18.2.0 | UI framework |
| React DOM | ^18.2.0 | DOM rendering |
| Tailwind CSS | ^3.4.0 | Utility-first styling |
| uuid | ^9.0.0 | Unique identifier generation |
| node-pty | ^1.0.0 | Terminal emulation (optional) |

### Native Dependencies

| Package | Notes |
|---------|-------|
| `node-pty` | Optional dependency with native bindings. May require build tools (`xcode-select --install` on macOS, `build-essential` on Linux, `windows-build-tools` on Windows). Installation failure does not block the build — terminal features will be disabled. |

---

## Known Incompatibilities

| Issue | Platform | Status | Workaround |
|-------|----------|--------|------------|
| `node-pty` build failure on Alpine Linux | Linux (musl) | Known | Use glibc-based distributions (Ubuntu, Debian, Fedora) |
| Electron sandbox on older SELinux configurations | Linux | Known | Set `--no-sandbox` flag or update SELinux policies |
| Code signing requires Apple Developer certificate | macOS | Expected | Unsigned builds work locally but trigger Gatekeeper warnings |
| Windows SmartScreen warning on unsigned builds | Windows | Expected | Code signing certificate required for production distribution |

---

## Testing Matrix

The CI pipeline tests the following combinations on every push:

| OS | Node.js | Test Scope |
|----|---------|------------|
| Ubuntu 22.04 | 20.x | typecheck + lint + test + build |
| macOS 13 | 20.x | build + dist (macOS artifacts) |
| Windows 2022 | 20.x | build + dist (Windows artifacts) |

The primary CI job (Ubuntu) runs the full validation suite. Platform-specific jobs build distribution artifacts.
