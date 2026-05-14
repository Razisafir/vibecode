# VibeCode Desktop — Responsible AI Policy

Version: 1.0

---

## Our Commitment

VibeCode is committed to the responsible development and deployment of AI-powered features. We believe AI should augment human capabilities, not replace human judgment.

## Principles

### 1. Human-in-the-Loop

All AI-generated code changes require explicit human approval before execution. VibeCode never automatically applies code changes without user consent. Our proposal system ensures that:

- Every AI suggestion is presented as a proposal card
- Users can review, modify, or reject any proposal
- Risk levels are clearly indicated
- Diff previews show exactly what will change
- Rollback is always available

### 2. Transparency

- AI-generated content is clearly marked as such
- The AI provider and model used are visible in the interface
- Users can see the reasoning behind AI suggestions when available
- Telemetry data collection is opt-in and transparent

### 3. Privacy

- User code and conversations are never used to train AI models without consent
- API keys are stored locally and encrypted
- Workspace content is never transmitted to our servers
- Telemetry is anonymized and opt-in
- Users can delete all locally stored data at any time

### 4. Safety

- High-risk operations (file deletion, system commands) require explicit approval
- Path sandboxing prevents unauthorized file system access
- Command execution is limited and auditable
- Content Security Policy prevents unauthorized code execution
- Rate limiting prevents abuse

### 5. Fairness

- We strive to ensure AI features work equally well across programming languages and frameworks
- We do not discriminate based on user identity or project type
- We actively work to reduce bias in AI-generated outputs

### 6. Accountability

- All executions are logged with audit trails
- Users can review execution history at any time
- Crash dumps capture context for debugging
- We respond promptly to security and safety concerns

## AI Provider Guidelines

When integrating AI providers, we require:

1. **Clear terms of service** that protect user data
2. **Data retention policies** that minimize storage of user inputs
3. **Opt-out mechanisms** for data usage in training
4. **Reliability** in service availability
5. **Transparency** about model capabilities and limitations

## User Responsibilities

Users of VibeCode's AI features should:

1. **Review all AI-generated code** before use
2. **Test thoroughly** before deploying to production
3. **Understand limitations** of AI-generated outputs
4. **Report issues** with harmful or biased outputs
5. **Respect licenses** of AI-generated code
6. **Not use AI features** for malicious purposes

## Continuous Improvement

We are committed to:

- Regularly auditing our AI features for safety and fairness
- Incorporating user feedback to improve AI interactions
- Staying current with AI safety research and best practices
- Being transparent about known limitations
- Updating this policy as our understanding evolves

## Contact

For questions about our AI practices:
Email: ai-ethics@vibecode.dev
