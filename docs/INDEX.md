# Documentation Index

This is the complete, structured index of all VibeCode documentation. Use this page to find any document by category, audience, or topic.

---

## Start Here

**New to VibeCode?** Follow this path:

1. **[Getting Started](getting-started.md)** — Install, configure, launch (5 min)
2. **[First 30 Minutes](first-30-minutes.md)** — Guided codebase walkthrough (30 min)
3. **[Architecture Overview](architecture-overview.md)** — Understand the system layers (15 min)
4. **[System Philosophy](system-philosophy.md)** — Understand the design decisions (10 min)

---

## By Category

### Onboarding

| Document | Purpose | Time |
|----------|---------|------|
| [Getting Started](getting-started.md) | Installation, first launch, key concepts | 5 min |
| [First 30 Minutes](first-30-minutes.md) | Clone, build, run, diagnose, recover | 30 min |
| [Repository Map](repository-map.md) | Navigate the codebase, find any file | 10 min |
| [Glossary](glossary.md) | Look up unfamiliar terms | Reference |

### Architecture & Design

| Document | Purpose | Time |
|----------|---------|------|
| [Architecture Overview](architecture-overview.md) | System layers, data flow, diagrams | 15 min |
| [System Philosophy](system-philosophy.md) | Design principles and trade-offs | 10 min |

### Operations

| Document | Purpose | Time |
|----------|---------|------|
| [Operational Guide](operational-guide.md) | Complete command and mode reference | Reference |
| [Operational Safety](operational-safety.md) | Guardrails, mode compatibility, safety constraints | 10 min |
| [System Status](system-status.md) | Failure categories, health grades, JSON schema | Reference |
| [Configuration](configuration.md) | Environment variables, AI providers, storage paths | Reference |

### Troubleshooting

| Document | Purpose | Time |
|----------|---------|------|
| [Troubleshooting](troubleshooting.md) | Common issues and decision-tree debugging | Reference |
| [FAQ](faq.md) | Frequently asked questions | Reference |

### Release & Contribution

| Document | Purpose | Time |
|----------|---------|------|
| [Release Process](release-process.md) | Release checklist and alpha channel | Reference |

---

## By Audience

### For Users

If you want to use VibeCode to build software:

1. [Getting Started](getting-started.md)
2. [Configuration](configuration.md)
3. [FAQ](faq.md)
4. [Troubleshooting](troubleshooting.md)

### For Developers

If you want to contribute code or understand the codebase:

1. [First 30 Minutes](first-30-minutes.md)
2. [Repository Map](repository-map.md)
3. [Architecture Overview](architecture-overview.md)
4. [System Philosophy](system-philosophy.md)
5. [Contributing](../CONTRIBUTING.md)

### For Operators

If you are running VibeCode in preview mode or managing deployments:

1. [Operational Guide](operational-guide.md)
2. [Operational Safety](operational-safety.md)
3. [System Status](system-status.md)
4. [Release Process](release-process.md)

---

## Governance Documents

These documents live in the repository root and define project policies:

| Document | Purpose |
|----------|---------|
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community standards and enforcement |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to contribute effectively |
| [MAINTAINERS.md](../MAINTAINERS.md) | Governance, triage, and decision making |
| [SECURITY.md](../SECURITY.md) | Vulnerability reporting and response |
| [SECURITY_MODEL.md](../SECURITY_MODEL.md) | High-level security boundaries |
| [SUPPORT.md](../SUPPORT.md) | Support channels and response expectations |
| [SUPPORT_POLICY.md](../SUPPORT_POLICY.md) | Supported versions, scope, and limitations |
| [VERSIONING_POLICY.md](../VERSIONING_POLICY.md) | Semver rules and breaking change definition |
| [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) | Pre-release verification checklist |
| [RELEASE_CHANNELS.md](../RELEASE_CHANNELS.md) | Alpha, beta, and stable channel definitions |
| [COMPATIBILITY_MATRIX.md](../COMPATIBILITY_MATRIX.md) | Platform and runtime compatibility |
| [EULA.md](../EULA.md) | End user license agreement |
| [PRIVACY.md](../PRIVACY.md) | Privacy and telemetry notice |
| [DISCLAIMER.md](../DISCLAIMER.md) | Warranty and liability disclaimer |
| [LICENSE](../LICENSE) | Proprietary software license |

---

## Document Relationships

```
  getting-started.md          first-30-minutes.md
  (user onboarding)           (developer onboarding)
         |                             |
         +-------------+---------------+
                       |
                       v
          architecture-overview.md
          (how the system is structured)
                       |
         +-------------+---------------+
         |                             |
         v                             v
  system-philosophy.md          repository-map.md
  (why it's designed            (where code lives)
   this way)                             |
         |                             |
         +-------------+---------------+
                       |
                       v
            operational-guide.md
            (how to run everything)
                       |
         +------+------+------+------+
         |      |      |      |      |
         v      v      v      v      v
  oper-   system- config- trouble- faq.md
  ation-  status  uration  shooting
  safety  .md     .md      .md
  .md
```

---

## Contributing to Documentation

Documentation improvements are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) for conventions.
