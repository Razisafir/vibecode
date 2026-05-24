# Versioning Policy

This document defines how VibeCode uses version numbers, what constitutes a breaking change, and what stability guarantees apply at each version level.

---

## Semantic Versioning

VibeCode follows [Semantic Versioning 2.0.0](https://semver.org/) with the conventions described below.

Version format: `MAJOR.MINOR.PATCH[-PRERELEASE]`

| Component | Incremented When | Example |
|-----------|-----------------|---------|
| `MAJOR` | Breaking changes that require user action to upgrade | 1.0.0, 2.0.0 |
| `MINOR` | New features or significant changes that are backward compatible | 0.2.0, 1.1.0 |
| `PATCH` | Bug fixes, documentation updates, and minor improvements | 0.1.1, 1.0.1 |
| `PRERELEASE` | Pre-release versions for testing before stable release | 0.2.0-alpha.1, 1.1.0-beta.2 |

---

## Pre-Release Conventions

During the alpha phase (before 1.0.0), all releases carry a pre-release identifier:

| Identifier | Meaning | Stability |
|------------|---------|-----------|
| `-alpha.N` | Early development. Features may be incomplete. Breaking changes may occur. | Low |
| `-beta.N` | Feature-complete for the upcoming release. No new features added. Breaking changes unlikely but possible. | Medium |
| `-rc.N` | Release candidate. No changes except bug fixes. Intended to become the stable release. | High |

### Alpha Phase Special Rules

While `MAJOR` is `0` (the alpha phase), the following relaxations apply:

- `MINOR` version bumps may include breaking changes without incrementing `MAJOR`
- Breaking changes will be documented in CHANGELOG.md but will not follow the full deprecation process
- The architecture stability promises (see README) apply regardless of version — these are structural invariants, not version-dependent

---

## Breaking Change Definition

A change is **breaking** if any of the following are true:

1. **API surface change:** A previously documented function, method, or IPC channel is removed or its signature changes incompatibly
2. **Configuration change:** A previously documented environment variable or configuration key is removed, renamed, or its accepted values change incompatibly
3. **Data format change:** The schema of persisted data (sessions, memory, configuration) changes in a way that is not backward-compatible and requires migration
4. **Behavioral change:** The runtime behavior of an existing feature changes in a way that would cause previously working workflows to fail without user intervention
5. **Dependency change:** The minimum supported version of Node.js, Electron, or an operating system is raised

### Not Breaking

The following are explicitly **not** considered breaking changes:

- Adding new functions, methods, IPC channels, or configuration keys
- Adding new values to an existing enum or union type
- Changing internal implementation details that do not affect the documented API surface
- Changing the output format of diagnostic commands (`npm run status`, `npm run status:json`)
- Adding new warnings or more restrictive validation that catches previously undetected errors

---

## Deprecation Process

After version 1.0.0, features will be deprecated before removal:

| Stage | Duration | Meaning |
|-------|----------|---------|
| **Active** | Indefinite | Feature is fully supported and recommended |
| **Deprecated** | Minimum 2 minor releases | Feature still works but will be removed. Alternatives documented. |
| **Removed** | Next major release | Feature is no longer available |

During the alpha phase, the deprecation process is advisory only. Breaking changes may be made without a deprecation period, but will always be documented in CHANGELOG.md.

---

## Version Lifecycle

```
  0.x.0-alpha.N ──> 0.x.0-beta.N ──> 0.x.0-rc.N ──> 0.x.0 (stable)
                                                        │
                                           Next minor: 0.(x+1).0-alpha.1
                                           Next major: 1.0.0-alpha.1
```

Once version 1.0.0 is reached:

```
  1.0.0 ──> 1.0.1 ──> 1.1.0 ──> 1.2.0 ──> ... ──> 2.0.0
  (patch)   (patch)   (minor)    (minor)           (major)
```

---

## Release Channels

VibeCode uses three release channels that map to operational modes:

| Channel | Version Pattern | Audience | Update Frequency |
|---------|----------------|----------|------------------|
| `alpha` | `0.x.0-alpha.N` | Developers and contributors | Frequent |
| `beta` | `0.x.0-beta.N` | Early adopters and testers | Moderate |
| `stable` | `x.y.0` (no prerelease tag) | All users | Conservative |

See [RELEASE_CHANNELS.md](RELEASE_CHANNELS.md) for detailed channel definitions.

---

## Compatibility Commitments

### Architecture Stability Promise

The following architectural invariants will not change across any version (including pre-1.0):

1. **Approval-first execution** — the AI will never auto-apply changes without user consent
2. **PathSandbox enforcement** — file operations will always be validated against workspace bounds
3. **Data locality** — user data will always be stored locally by default
4. **Opt-in infrastructure** — PM2, health server, and watchdog will never activate without explicit user action
5. **Read-only diagnostics** — the status and failure intelligence system will never modify system state

These are structural commitments, not version-dependent features.

### Minimum Compatibility

| Dependency | Minimum Version | Last Bumped |
|------------|----------------|-------------|
| Node.js | 20.x | 0.1.0-alpha.1 |
| Electron | 33.x | 0.1.0-alpha.1 |
| macOS | 12+ (Monterey) | 0.1.0-alpha.1 |
| Windows | 10+ | 0.1.0-alpha.1 |
| Linux | glibc 2.31+ (Ubuntu 20.04+) | 0.1.0-alpha.1 |

Changes to minimum requirements will follow the breaking change definition above.
