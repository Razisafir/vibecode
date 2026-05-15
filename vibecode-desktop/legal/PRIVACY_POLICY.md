# VibeCode Desktop — Privacy Policy

**DRAFT TEMPLATE — Requires Legal Review**

Version: 1.0-DRAFT
Effective Date: [DATE]

---

## 1. Introduction

VibeCode ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use VibeCode Desktop ("Software"). Please read this policy carefully. By using the Software, you consent to the practices described herein.

## 2. Information We Collect

### 2.1 Information You Provide

- **Account Information**: Email address, name, and payment information when you create an account or subscribe.
- **Provider API Keys**: API keys for AI providers (OpenAI, Anthropic, Google, etc.) that you voluntarily provide. These keys are stored locally on your device using platform-native secure storage mechanisms and are encrypted at rest. We never transmit your API keys to our servers.
- **Workspace Files**: File paths and content within workspaces you explicitly open. This data remains on your local device and is never transmitted to our servers unless you explicitly opt into cloud sync features.

### 2.2 Information Collected Automatically (Opt-In Telemetry)

When you opt in to telemetry, we may collect:

- **Usage Metrics**: Feature usage, session duration, execution success rates, provider popularity.
- **Performance Data**: Memory usage, IPC latency, crash frequency, application startup time.
- **Device Information**: Operating system version, screen resolution, installed memory.
- **Error Reports**: Crash dumps, error messages, and stack traces (anonymized).

**All telemetry is opt-in.** You can disable telemetry at any time in Settings > Telemetry.

### 2.3 Information We Do NOT Collect

- We do not read, scan, or transmit the content of your source code files.
- We do not record AI conversations or prompts beyond what is needed for the current session.
- We do not collect browsing history or track websites you visit.
- We do not access your file system beyond the workspaces you explicitly open.
- We do not sell personal data to third parties.

## 3. How We Use Your Information

We use collected information to:

- Provide, maintain, and improve the Software
- Process subscriptions and payments
- Send important notifications about updates and security issues
- Analyze usage patterns to improve product features
- Detect and prevent fraud, abuse, and security issues
- Comply with legal obligations

## 4. Data Storage and Security

### 4.1 Local Storage

The following data is stored locally on your device:

- Provider API keys (encrypted using platform-native keychain/credential manager)
- Workspace preferences and recent workspaces
- Session state for crash recovery
- Execution history and proposals
- Memory store entries

### 4.2 Encryption

- API keys are encrypted at rest using AES-256 or platform-native encryption
- All network communications use TLS 1.2 or higher
- Crash dumps are encrypted before storage

### 4.3 Security Measures

- Content Security Policy prevents unauthorized script execution
- Context isolation prevents renderer process from accessing Node.js APIs
- Path sandboxing prevents unauthorized file system access
- Rate limiting prevents IPC abuse

## 5. Third-Party Services

The Software communicates with the following third-party services when you configure them:

| Service | Purpose | Data Sent | Privacy Policy |
|---------|---------|-----------|----------------|
| OpenAI | AI chat completions | Your prompts and messages | https://openai.com/privacy |
| Anthropic | AI chat completions | Your prompts and messages | https://www.anthropic.com/privacy |
| Google Gemini | AI chat completions | Your prompts and messages | https://policies.google.com/privacy |
| Ollama (local) | Local AI inference | Remains on your device | N/A (local) |
| GitHub | Auto-updates | Version info only | https://docs.github.com/en/site-policy |

We are not responsible for the privacy practices of these third-party services. We encourage you to review their privacy policies.

## 6. Data Retention

- **Telemetry Data**: Retained for 90 days, then aggregated and anonymized.
- **Crash Dumps**: Retained locally for 30 days, then automatically deleted.
- **Session Data**: Retained locally until you delete it or clear application data.
- **Account Data**: Retained for the duration of your account plus 30 days after deletion.

## 7. Your Rights

You have the right to:

- **Access**: Request a copy of your personal data.
- **Correction**: Request correction of inaccurate data.
- **Deletion**: Request deletion of your personal data.
- **Portability**: Request your data in a machine-readable format.
- **Opt-Out**: Disable telemetry at any time.
- **Restriction**: Request restriction of processing.

To exercise these rights, contact privacy@vibecode.dev.

## 8. Children's Privacy

The Software is not intended for use by children under 13. We do not knowingly collect personal information from children under 13.

## 9. International Data Transfers

If you are using the Software from outside the United States, your data may be transferred to and processed in the United States. By using the Software, you consent to such transfers.

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes via the Software or by email. Your continued use of the Software after changes constitutes acceptance of the updated policy.

## 11. Contact Us

For privacy-related questions or concerns:

VibeCode Privacy Team
Email: privacy@vibecode.dev
Website: https://vibecode.dev/privacy

---

**THIS IS A DRAFT TEMPLATE. Consult a qualified attorney before using this document as a binding privacy policy. Ensure compliance with GDPR, CCPA, and other applicable privacy regulations.**
