# VibeCode Documentation

This directory contains all documentation for VibeCode. Documents are organized by audience and purpose, with cross-references between related topics.

> **Looking for the full documentation index?** See [INDEX.md](INDEX.md) for a complete, categorized listing of every document.

---

## Start Here

If you are new to VibeCode, follow this reading path:

| Step | Document | Time | What You Will Learn |
|------|----------|------|---------------------|
| 1 | [Getting Started](getting-started.md) | 5 min | Installation, first launch, key concepts |
| 2 | [First 30 Minutes](first-30-minutes.md) | 30 min | Clone, build, run, diagnose, recover |
| 3 | [Architecture Overview](architecture-overview.md) | 15 min | System layers, data flow, diagrams |
| 4 | [System Philosophy](system-philosophy.md) | 10 min | Why VibeCode is designed this way |

After these four documents, you will understand how VibeCode works and why.

---

## All Documents

### For Developers

| Document | Purpose | When to Read |
|----------|---------|-------------|
| [Getting Started](getting-started.md) | Installation, first launch, key concepts | First time using VibeCode |
| [First 30 Minutes](first-30-minutes.md) | Guided onboarding walkthrough | First day with the codebase |
| [Architecture Overview](architecture-overview.md) | System layers, data flow, diagrams | Understanding how the system fits together |
| [System Philosophy](system-philosophy.md) | Design principles and trade-offs | Understanding why decisions were made |
| [Repository Map](repository-map.md) | Codebase navigation and file guide | Finding where things live |
| [Glossary](glossary.md) | Terminology reference | Encountering an unfamiliar term |

### For Operators

| Document | Purpose | When to Read |
|----------|---------|-------------|
| [Operational Guide](operational-guide.md) | Complete command and mode reference | Running VibeCode in any mode |
| [Operational Safety](operational-safety.md) | Guardrails, mode compatibility, safety constraints | Configuring or operating VibeCode |
| [System Status](system-status.md) | Status command reference, failure categories, JSON schema | Diagnosing issues or integrating monitoring |
| [Configuration](configuration.md) | Environment variables, AI providers, storage paths | Setting up providers or customizing paths |
| [Troubleshooting](troubleshooting.md) | Common issues and solutions | Something is not working |

### For Everyone

| Document | Purpose | When to Read |
|----------|---------|-------------|
| [FAQ](faq.md) | Frequently asked questions | Quick answers to common questions |
| [Glossary](glossary.md) | Terminology reference | Looking up a specific term |
| [Release Process](release-process.md) | Release checklist and alpha channel | Preparing or reviewing a release |

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
         +-------------+-------------+-------------+
         |             |             |             |
         v             v             v             v
  operational-    system-      configuration  troubleshooting
  safety.md       status.md    .md            .md
  (what's safe)   (diagnosis)  (settings)     (fix issues)
```

---

## Contributing to Documentation

Documentation improvements are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) for conventions.

**Key rules:**
- Every section must contain substantive content (minimum 150 words)
- Cross-reference related documents using relative links
- Use conservative language for diagnostic content
- Test all code examples before committing
