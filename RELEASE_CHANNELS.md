# Release Channels

This document defines the three release channels for VibeCode, their purposes, stability expectations, and how users move between them.

---

## Channel Overview

| Channel | Version Pattern | Stability | Audience | Update Frequency |
|---------|----------------|-----------|----------|------------------|
| **Alpha** | `0.x.0-alpha.N` | Experimental | Developers, contributors | Days to weeks |
| **Beta** | `0.x.0-beta.N` | Feature-complete | Early adopters, testers | Weeks |
| **Stable** | `x.y.z` (no prerelease) | Production-ready | All users | Conservative |

---

## Alpha Channel

### Purpose

The alpha channel is the primary development track. It contains the latest features, fixes, and infrastructure changes. Alpha releases are the first place new code reaches users.

### What to Expect

- Features may be incomplete or change before the next alpha
- Breaking changes may occur between alpha releases (documented in CHANGELOG.md)
- Configuration formats and CLI output may change
- The architecture stability promises (see README) always hold, even in alpha

### Who Should Use It

- Contributors testing their own changes
- Developers who need the latest features and accept the risk of instability
- Anyone filing bug reports — please verify against the latest alpha first

### How to Get It

- Build from source: `git clone && npm install && npm run dev`
- Download pre-release artifacts from GitHub Releases (when available)
- Set update channel to "alpha" in Settings > Updates

---

## Beta Channel

### Purpose

The beta channel represents feature-complete releases that are approaching stability. No new features are added during the beta phase — only bug fixes and documentation improvements.

### What to Expect

- No new features — only fixes to existing functionality
- Breaking changes are unlikely but possible if critical issues are discovered
- The API surface and configuration format are frozen during beta
- All features are tested and documented before entering beta

### Who Should Use It

- Early adopters who want newer features than stable but prefer less risk than alpha
- Testers validating that the upcoming release is ready
- Teams evaluating VibeCode for adoption who want near-production stability

### How to Get It

- Download pre-release artifacts from GitHub Releases
- Set update channel to "beta" in Settings > Updates

---

## Stable Channel

### Purpose

The stable channel contains releases that are ready for general use. They have passed full verification (see [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)) and are supported under the [Support Policy](SUPPORT_POLICY.md).

### What to Expect

- No breaking changes within a major version
- Bug fixes delivered as patch releases
- New features delivered as minor releases
- Full backward compatibility guaranteed
- Security patches prioritized

### Who Should Use It

- All users who want a reliable, supported experience
- Production environments and critical workflows
- Anyone who does not need cutting-edge features

### How to Get It

- Download from GitHub Releases (latest, not pre-release)
- Auto-update from within VibeCode (stable channel is default)

---

## Channel Transitions

```
  alpha ──────────────────────> beta ──────────────────> stable
  (development)                (validation)             (production)

  Features added here          No new features           Only fixes
  Breaking changes possible    API surface frozen        Fully supported
  Frequent releases            Moderate releases         Conservative releases
```

A release moves from alpha to beta when:
- All planned features for the version are implemented
- All CI checks pass
- Documentation is complete
- Manual smoke testing on all platforms succeeds

A release moves from beta to stable when:
- No critical or high-severity bugs remain open
- All reported beta issues are resolved or documented
- Full release checklist is satisfied
- Auto-update verification passes

---

## Operational Mode Mapping

Release channels correspond to operational modes:

| Mode | Default Channel | Environment Variable |
|------|----------------|---------------------|
| DEV | `alpha` | `VIBECODE_CHANNEL=alpha` |
| PREVIEW | `beta` | `VIBECODE_CHANNEL=beta` |
| PRODUCTION | `stable` | `VIBECODE_CHANNEL=stable` |

The channel is informational — it determines which auto-update versions are offered. It does not change runtime behavior or feature availability.

---

## Downgrading

Moving from a higher channel to a lower one is supported:

- **Stable to Beta:** Change update channel in Settings. You will be offered beta updates when available.
- **Beta to Alpha:** Change update channel in Settings. You will be offered alpha updates immediately.
- **Any channel to a specific version:** Download the desired version's artifact from GitHub Releases and install manually.

Note: Downgrading to an earlier version within the same channel requires manual installation. Data format changes between versions may require clearing session data (`~/.vibecode/sessions/`).
