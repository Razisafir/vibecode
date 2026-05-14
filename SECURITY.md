# Security Policy

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in
VibeCode, please report it responsibly.

### How to Report

**Preferred method:** Email security@vibecode.dev

Include the following:
- Description of the vulnerability
- Steps to reproduce
- Affected version (found in Help > About)
- Your operating system and version
- Potential impact assessment

### Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgment | Within 24 hours |
| Initial assessment | Within 72 hours |
| Status update | Every 7 days until resolved |
| Fix delivery | Depends on severity (see below) |

### Severity and Fix Timeline

| Severity | Description | Target Fix |
|----------|-------------|------------|
| Critical | Remote code execution, data exfiltration, sandbox bypass | 48 hours |
| High | Privilege escalation, credential exposure | 7 days |
| Medium | Denial of service, information disclosure | 30 days |
| Low | Minor information leaks, UI spoofing | Next release |

## Scope

### In Scope
- VibeCode desktop application (vibecode-desktop/)
- Electron IPC handlers and main process code
- PathSandbox security boundaries
- Session and memory persistence systems
- Provider API key storage and handling
- Auto-update mechanism

### Out of Scope
- Third-party AI provider APIs (report to the provider)
- Operating system-level vulnerabilities
- Social engineering attacks
- Denial of service against our infrastructure

## Responsible Disclosure Guidelines

- Do not access, modify, or delete other users' data
- Do not degrade system performance or availability
- Do not publicly disclose the vulnerability before a fix is available
- Provide reasonable time for remediation before public disclosure
- We will credit researchers who report vulnerabilities responsibly

## Security Features

VibeCode implements the following security measures:

- **PathSandbox**: All file operations are validated against a whitelist of
  allowed directories and a blacklist of protected system paths
- **Proposal-Approval Workflow**: All code changes require explicit user
  approval before execution
- **Atomic File Writes**: File modifications use temp+rename to prevent
  corruption on crash
- **Rollback Snapshots**: Automatic snapshots before changes enable rollback
- **API Key Isolation**: Provider API keys are stored locally and never
  transmitted to VibeCode servers
- **Session Encryption**: Sensitive session data is stored with restricted
  file permissions

## Security Updates

Security updates are delivered through the auto-update system. We strongly
recommend keeping VibeCode updated to the latest version.

---

*This policy may be updated. Last revised: May 14, 2026*
