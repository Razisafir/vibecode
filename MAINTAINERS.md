# VibeCode Maintainers

This document describes the maintainer structure, responsibilities, and processes for the VibeCode project.

---

## Current Maintainers

| Maintainer | GitHub | Areas |
|-----------|--------|-------|
| Razisafir | [@Razisafir](https://github.com/Razisafir) | All areas (sole maintainer) |

---

## Maintainer Responsibilities

### Code Review

- Review pull requests within the expected timeline (see [CONTRIBUTING.md](CONTRIBUTING.md))
- Verify that safety-critical changes receive extra scrutiny
- Ensure all CI checks pass before merging
- Check that documentation is updated when behavior changes

### Release Management

- Follow the [Release Process](docs/release-process.md) checklist and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- Verify CI is green on `main` before creating a release tag
- Update CHANGELOG.md before each release
- Test release artifacts on all supported platforms

### Security

- Respond to security reports within 24 hours (see [SECURITY.md](SECURITY.md))
- Evaluate security implications of all PRs touching safety-critical code
- Keep dependencies updated and monitor for vulnerability advisories

### Repository Health

- Triage new issues within 7 days
- Keep documentation current and consistent
- Maintain CI pipeline health
- Enforce contribution standards

---

## Safety-Critical Code Review

The following files require extra review attention because they enforce security boundaries:

| File | Boundary |
|------|----------|
| `src/main/services/path-sandbox.ts` | Filesystem access control |
| `src/main/services/execution-engine.ts` | AI action execution |
| `src/main/services/provider-manager.ts` | API key handling |
| `src/main/ipc/` | IPC communication |
| `src/preload/preload.ts` | Renderer-to-main bridge |
| `src/main/system/status-provider.ts` | System observability |
| `src/main/system/failure-map.ts` | Failure knowledge catalog |

Changes to these files must:
1. Include a safety impact statement in the PR description
2. Verify that existing safety invariants are preserved
3. Include tests that validate the boundary still holds
4. Receive review from the designated CODEOWNERS

---

## Decision Making

### Technical Decisions

Technical decisions should align with the principles documented in [System Philosophy](docs/system-philosophy.md):

- Approval-first execution (never auto-apply)
- Explicit control over automation
- Conservative diagnosis (tentative language)
- Opt-in infrastructure (nothing auto-activates)
- Read-only observability (never auto-fix)

When a PR conflicts with these principles, the burden of justification is on the contributor to explain why the exception is warranted.

### Breaking Changes

Breaking changes require:
1. A clear explanation of what breaks and why
2. A migration path for existing users
3. A major version bump (following semver)
4. Updates to all affected documentation

---

## Issue Triage

### Priority Levels

| Label | Meaning | Response Target |
|-------|---------|----------------|
| `security` | Security vulnerability | 24 hours |
| `bug: critical` | Application crash or data loss | 3 business days |
| `bug` | Feature not working correctly | 5 business days |
| `enhancement` | Feature request | Acknowledged within 7 days |
| `documentation` | Doc improvement | 7 business days |
| `question` | Usage question | 7 business days |

### Triage Process

1. Apply appropriate labels
2. Verify the issue has all required information (use issue templates)
3. Link related issues and PRs
4. Assign to the appropriate area owner
5. Respond within the timeline above

---

## CI Pipeline

The CI pipeline enforces these gates on every push and PR:

| Gate | Command | Requirement |
|------|---------|-------------|
| Type checking | `npm run typecheck` | Zero errors across 3 tsconfig files |
| Linting | `npm run lint` | Zero errors |
| Testing | `npm run test` | All tests pass |
| Build | `npm run build` | Successful compilation |
| Secret scanning | gitleaks + npm audit | No secrets in code or build output |

No PR may be merged with a failing CI gate. See `.github/workflows/ci.yml` for the full pipeline definition.
