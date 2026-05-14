# VibeCode Privacy Notice

**Effective Date: May 14, 2026**

## Data We Collect

### Telemetry Data
VibeCode may collect the following telemetry data to improve the product:

- **Usage metrics**: Feature usage frequency, session duration, workspace count
- **Performance data**: Startup time, memory usage, response latency
- **Error and crash data**: Exception reports, stack traces, system information
- **System information**: Operating system, application version, screen resolution

### Data We Do NOT Collect
- Your source code or file contents
- Your AI provider API keys
- Your project-specific configurations
- Personal identification information (name, email, address)

## How We Store Data

- Telemetry data is transmitted over encrypted connections (TLS 1.2+)
- Data is stored on secure servers with access controls
- Crash reports may include anonymized stack traces but not source code
- Data retention period: 90 days for telemetry, 30 days for crash reports

## Third-Party Services

VibeCode integrates with the following third-party services:

| Service | Purpose | Data Shared | Privacy Policy |
|---------|---------|-------------|----------------|
| Sentry | Crash reporting | Anonymized stack traces, OS info, app version | sentry.io/privacy |
| OpenAI | AI completions | Prompts you send (subject to OpenAI's policy) | openai.com/privacy |
| Anthropic | AI completions | Prompts you send (subject to Anthropic's policy) | anthropic.com/privacy |
| Google | AI completions | Prompts you send (subject to Google's policy) | policies.google.com/privacy |

AI provider API keys are stored locally on your device and never transmitted to
VibeCode servers.

## Your Rights

- **Opt-out**: You can disable telemetry in Settings > Privacy > Telemetry
- **Access**: Request a copy of your data by contacting privacy@vibecode.dev
- **Deletion**: Request deletion of your data by contacting privacy@vibecode.dev
- **Export**: Export your local data from ~/.vibecode/ at any time

## Data for Minors

VibeCode is not intended for use by individuals under the age of 13. We do not
knowingly collect data from children.

## Changes to This Notice

We may update this Privacy Notice periodically. Changes will be posted in the
application and on the repository. Continued use after changes constitutes
acceptance.

## Contact

For privacy-related inquiries:
privacy@vibecode.dev
