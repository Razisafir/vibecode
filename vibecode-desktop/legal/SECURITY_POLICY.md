# VibeCode Desktop — Security Disclosure Policy

Version: 1.0

---

## Reporting Security Vulnerabilities

We take security seriously. If you discover a security vulnerability in VibeCode Desktop, we encourage you to report it responsibly.

### How to Report

1. **Email**: Send details to security@vibecode.dev
2. **Encrypt**: Use our PGP key (available at https://vibecode.dev/.well-known/pgp-key.txt)
3. **Do NOT** file a public GitHub issue for security vulnerabilities

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Any proof-of-concept code (optional but helpful)

### Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgment | 24 hours |
| Initial Assessment | 72 hours |
| Status Update | 7 days |
| Fix Development | 14-30 days (severity dependent) |
| Disclosure Coordination | 90 days |

### Scope

**In Scope:**
- Remote code execution vulnerabilities
- Privilege escalation
- Path traversal / sandbox bypass
- API key exposure or leakage
- Cross-site scripting in the renderer
- IPC channel abuse
- Update mechanism compromise
- Memory corruption issues

**Out of Scope:**
- Denial of service via resource exhaustion
- Social engineering attacks
- Issues in third-party dependencies (report to upstream)
- Theoretical vulnerabilities without proof of exploitability

### Responsible Disclosure Guidelines

- Do not access or modify user data without explicit permission
- Do not degrade system performance during testing
- Report vulnerabilities before disclosing publicly
- Allow reasonable time for remediation before public disclosure
- We commit to acknowledging your contribution if desired

### Bug Bounty Program

We are exploring a bug bounty program. Details will be announced at https://vibecode.dev/security.

## Security Best Practices for Users

1. **API Keys**: Store API keys securely; rotate them regularly
2. **Workspaces**: Only open workspaces from trusted sources
3. **Proposals**: Review all AI-generated proposals before approving execution
4. **Updates**: Keep VibeCode updated to the latest version
5. **Network**: Use the Software on trusted networks
6. **Permissions**: Grant minimal necessary file system permissions

---

Contact: security@vibecode.dev
