# Contributing to VibeCode

Thank you for your interest in contributing to VibeCode. This document explains how to contribute effectively, what standards we follow, and what to expect during the review process.

---

## Quick Start

If you want to get up and running immediately:

1. Read [First 30 Minutes](docs/first-30-minutes.md) for the guided walkthrough
2. Read [Repository Map](docs/repository-map.md) to understand where things live
3. Read this document for contribution conventions

---

## Code of Conduct

This project follows professional standards of conduct as described in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). We expect all contributors to:

- Be respectful and constructive in all interactions
- Focus on the technical merits of contributions
- Report security vulnerabilities privately (see [SECURITY.md](SECURITY.md))
- Follow the project's licensing terms (see [LICENSE](LICENSE) and [EULA.md](EULA.md))

---

## How to Contribute

### Reporting Bugs

Use the [Bug Report](https://github.com/Razisafir/vibecode/issues/new?template=bug_report.yml) issue template. Include:

- VibeCode version (Help > About or `npm run status`)
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output (sanitized of API keys)

Before filing, search existing issues to avoid duplicates.

### Requesting Features

Use the [Feature Request](https://github.com/Razisafir/vibecode/issues/new?template=feature_request.yml) issue template. Include:

- The problem you are trying to solve
- Your proposed solution
- Alternatives you have considered
- Why this fits VibeCode's design philosophy (see [System Philosophy](docs/system-philosophy.md))

### Submitting Pull Requests

1. **Fork the repository** and create a branch from `main`
2. **Make your changes** following the conventions below
3. **Test your changes** — all CI checks must pass
4. **Submit a PR** using the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md)

---

## Development Setup

### Prerequisites

- **Node.js 20.x** (see `.nvmrc` for exact version)
- **npm 9+** (included with Node.js 20)
- **Git** with signed commits enabled (recommended)

### Install and Run

```bash
git clone https://github.com/Razisafir/vibecode.git
cd vibecode/vibecode-desktop
npm install
npm run dev
```

### Verify Your Environment

```bash
npm run ci          # typecheck + lint + test + build
npm run status      # system health check
```

All must pass before submitting a PR.

---

## Branch Conventions

| Branch Type | Naming | Example |
|-------------|--------|---------|
| Feature | `feat/<short-description>` | `feat/memory-search-api` |
| Bug fix | `fix/<short-description>` | `fix/sandbox-path-resolution` |
| Documentation | `docs/<short-description>` | `docs/faq-page` |
| Infrastructure | `infra/<short-description>` | `infra/ci-node-20` |
| Security | `security/<short-description>` | `security/api-key-validation` |

Branch from `main`. Keep branches short-lived and focused on a single concern.

---

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) with a few project-specific additions:

### Format

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `refactor` | Code restructuring without behavior change |
| `test` | Adding or updating tests |
| `chore` | Build, CI, tooling, or dependency changes |
| `perf` | Performance improvements |
| `security` | Security-related changes |

### Scopes

| Scope | Covers |
|-------|--------|
| `executor` | Execution engine and executor types |
| `memory` | Memory store, indexing, LRU cache |
| `sandbox` | PathSandbox and file validation |
| `proposal` | Proposal generation and approval flow |
| `session` | Session persistence and crash recovery |
| `provider` | AI provider management and routing |
| `status` | Status provider, failure intelligence |
| `ipc` | IPC handlers and preload bridge |
| `ui` | Renderer components and styles |
| `infra` | PM2, health server, watchdog, CI |

### Examples

```
feat(memory): add semantic search with relevance ranking
fix(sandbox): resolve symlink escape on macOS
docs(status): document failure intelligence JSON schema
chore(deps): update electron to v28.1.0
security(provider): validate API key format before storage
```

---

## Code Standards

### TypeScript

- Strict mode is enabled across all three tsconfig files
- No `any` types without an explicit comment explaining why
- All new functions must have return type annotations
- Prefer `interface` over `type` for object shapes

### Linting

ESLint is configured with zero-error policy. All code must pass `npm run lint` with no errors.

```bash
npm run lint        # Check all files
```

Warnings are acceptable during development but must be resolved before merge.

### Testing

- All new features must include corresponding tests
- All bug fixes must include a regression test
- Test files go in `vibecode-desktop/tests/`
- Use the existing vitest configuration (node environment)

```bash
npm run test        # Run all 82+ tests
```

### Safety-Critical Code

If your PR touches any of these files, it requires extra scrutiny:

| File | Why Critical |
|------|-------------|
| `src/main/services/path-sandbox.ts` | Filesystem security boundary |
| `src/main/services/execution-engine.ts` | AI action execution |
| `src/main/services/provider-manager.ts` | API key handling |
| `src/main/ipc/` | IPC communication |
| `src/preload/preload.ts` | Renderer-to-main bridge |

For safety-critical changes, explicitly address in your PR description:
- What safety invariant is preserved
- How you verified the boundary still holds
- What additional testing you performed

---

## PR Review Process

### What Reviewers Check

1. **Correctness** — Does the code do what it claims?
2. **Safety** — Does it maintain all security boundaries?
3. **Consistency** — Does it follow project conventions?
4. **Testing** — Are there adequate tests?
5. **Documentation** — Are docs updated if behavior changed?

### CI Requirements

All PRs must pass:

| Check | Command | Requirement |
|-------|---------|-------------|
| Type checking | `npm run typecheck` | Zero errors |
| Linting | `npm run lint` | Zero errors |
| Tests | `npm run test` | All tests pass |
| Build | `npm run build` | Successful build |
| Pre-commit | `npm run check:all` | No secrets, valid .gitignore |

### Review Timeline

| PR Type | Expected Review Time |
|---------|---------------------|
| Documentation | 1-2 business days |
| Bug fix | 1-3 business days |
| Feature | 3-5 business days |
| Security fix | 24-48 hours |
| Safety-critical code | 3-5 business days + extra reviewer |

---

## Documentation Contributions

Documentation is a first-class contribution. We maintain high documentation standards because VibeCode is a complex system that new developers must be able to understand quickly.

### Documentation Structure

The complete documentation index is at [docs/INDEX.md](docs/INDEX.md). Key documents:

| Document | Audience | Purpose |
|----------|----------|---------|
| [Getting Started](docs/getting-started.md) | End users | Installation and first-launch |
| [First 30 Minutes](docs/first-30-minutes.md) | New developers | Codebase onboarding |
| [Architecture Overview](docs/architecture-overview.md) | All technical | System layers and data flow |
| [System Philosophy](docs/system-philosophy.md) | All technical | Design principles and trade-offs |
| [Repository Map](docs/repository-map.md) | New developers | Codebase navigation |
| [Operational Guide](docs/operational-guide.md) | Operators | Complete command reference |
| [Operational Safety](docs/operational-safety.md) | Operators | Guardrails and mode compatibility |
| [System Status](docs/system-status.md) | Operators | Failure categories and JSON schema |
| [Configuration](docs/configuration.md) | All | Environment variables and provider setup |
| [Troubleshooting](docs/troubleshooting.md) | All | Common issues and solutions |
| [Glossary](docs/glossary.md) | All | Terminology reference |
| [FAQ](docs/faq.md) | All | Frequently asked questions |

For governance and policy documents, see [README.md](README.md#governance--policy) or [docs/INDEX.md](docs/INDEX.md#governance-documents).

### Writing Standards

- Every section must contain substantive content (minimum 150 words)
- Use tables and diagrams to break up text-heavy sections
- Cross-reference related documents using relative links
- Use conservative language for diagnostic content ("likely", "may", not "definitely")
- Test all code examples before committing

---

## Security Reporting

**Do NOT file public issues for security vulnerabilities.**

Report security issues to security@vibecode.dev. See [SECURITY.md](SECURITY.md) for the full vulnerability reporting policy.

---

## License

By contributing to VibeCode, you agree that your contributions will be licensed under the same proprietary license as the project. See [LICENSE](LICENSE) for details.
