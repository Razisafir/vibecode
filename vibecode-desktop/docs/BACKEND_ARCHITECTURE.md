# VibeCode — Backend Architecture Proposal

Version: 1.0
Date: 2026-05-14

---

## Overview

This document outlines the backend architecture for VibeCode's cloud services, including authentication, licensing, updates, and future features like cloud sync and team collaboration.

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  VibeCode   │────▶│  API Gateway │────▶│  Microservices│
│  Desktop    │◀────│  (Kong/AWS)  │◀────│              │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │   Services   │
                    ├─────────────┤
                    │ Auth        │
                    │ Licensing   │
                    │ Updates     │
                    │ Analytics   │
                    │ Sync        │
                    │ Credits     │
                    └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   Storage    │
                    ├─────────────┤
                    │ PostgreSQL   │
                    │ Redis        │
                    │ S3           │
                    └─────────────┘
```

---

## Service Breakdown

### 1. Authentication Service

**Purpose**: User identity management, OAuth, API key management.

**Technology**: Auth0 or custom JWT-based auth

**Endpoints**:
- `POST /auth/register` — Create account
- `POST /auth/login` — Authenticate
- `POST /auth/refresh` — Refresh JWT
- `POST /auth/logout` — Invalidate session
- `GET /auth/me` — Current user info
- `POST /auth/device` — Device activation flow

**Device Activation Flow** (for desktop):
1. Desktop app shows a short-lived code
2. User visits vibecode.dev/activate on their phone/browser
3. User enters code and confirms
4. Desktop app receives authentication token
5. No passwords entered on the desktop

### 2. Licensing Service

**Purpose**: Subscription management, license validation, feature gating.

**Technology**: Custom service with Stripe integration

**Endpoints**:
- `GET /license/status` — Current license status
- `POST /license/activate` — Activate license key
- `POST /license/deactivate` — Deactivate license
- `POST /license/validate` — Validate license (offline-capable)
- `GET /license/features` — Available features for current tier
- `POST /license/checkout` — Create Stripe checkout session
- `POST /license/webhook` — Stripe webhook handler

**License Validation Architecture**:
```
Desktop App                    License Server
    │                               │
    ├─ Periodic check (every 24h) ──▶│
    │                               ├─ Validate subscription
    │◀─ License token + features ───┤
    │                               │
    ├─ Offline grace (7 days)       │
    │  (cached license valid)       │
    │                               │
    ├─ Hard expiry (after 7 days)   │
    │  (must reconnect)             │
```

### 3. Update Service

**Purpose**: Serve update manifests, delta updates, and release artifacts.

**Technology**: GitHub Releases (primary) + Custom update server (future)

**Endpoints**:
- `GET /updates/:platform/:channel` — Check for updates
- `GET /updates/:platform/:channel/latest` — Latest version info
- `GET /updates/:platform/:channel/:version` — Specific version
- `POST /updates/crash-report` — Submit crash report

**Update Channels**:
| Channel | Audience | Frequency |
|---------|----------|-----------|
| stable | All users | Tested releases only |
| beta | Beta testers | Pre-release builds |
| nightly | Developers | Every build |

### 4. Analytics Service

**Purpose**: Aggregate anonymized usage metrics (opt-in only).

**Technology**: ClickHouse + custom ingestion

**Endpoints**:
- `POST /analytics/events` — Batch event submission
- `POST /analytics/crash` — Crash report submission
- `GET /analytics/status` — Analytics collection status

**Privacy Requirements**:
- All data is anonymized before submission
- No personally identifiable information
- Users can view and delete their data
- Opt-in only, can be disabled anytime

### 5. Sync Service (Future)

**Purpose**: Cloud sync for settings, memory, and sessions.

**Technology**: CRDT-based sync (Automerge or Yjs)

**Endpoints**:
- `GET /sync/status` — Sync status
- `POST /sync/push` — Push local changes
- `GET /sync/pull` — Pull remote changes
- `GET /sync/history` — Change history
- `POST /sync/resolve` — Resolve conflicts

### 6. Credits Service (Future)

**Purpose**: AI credit management, usage tracking, billing.

**Technology**: Custom service with Stripe

**Endpoints**:
- `GET /credits/balance` — Current balance
- `POST /credits/use` — Deduct credits
- `GET /credits/history` — Usage history
- `POST /credits/purchase` — Buy credits

---

## Pricing Tiers

### Free Tier
- 1 workspace
- 100 AI messages/month
- Local providers only (Ollama, LM Studio)
- Community support
- Basic execution engine

### Pro Tier — $19/month
- Unlimited workspaces
- 2,000 AI messages/month
- All providers
- Cloud sync for settings
- Priority support
- Full execution engine
- Custom keyboard shortcuts

### Enterprise Tier — Custom Pricing
- Everything in Pro
- Unlimited AI messages
- Team collaboration
- SSO/SAML
- Dedicated support
- SLA guarantees
- Custom integrations
- Audit logs export
- Volume licensing

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| API Gateway | Kong / AWS API Gateway |
| Auth | Auth0 or custom JWT |
| License Server | Node.js + Stripe |
| Update Server | GitHub Releases → Custom |
| Database | PostgreSQL + Redis |
| Analytics | ClickHouse |
| Object Storage | AWS S3 |
| CDN | CloudFront |
| CI/CD | GitHub Actions |
| Monitoring | Datadog / Grafana |
| Hosting | AWS (ECS Fargate) |

---

## Deployment Architecture

```
Production:
  - AWS ECS Fargate (containerized microservices)
  - RDS PostgreSQL (multi-AZ)
  - ElastiCache Redis (clustered)
  - S3 (artifacts, backups)
  - CloudFront (CDN for updates)
  - Route53 (DNS)

Staging:
  - Same architecture, smaller instances
  - Single-AZ for cost savings

Development:
  - Docker Compose (local)
  - SQLite (local DB)
```

---

## Security Architecture

1. **TLS 1.3** for all API communications
2. **JWT with RS256** for authentication
3. **API key hashing** (bcrypt) for stored keys
4. **Rate limiting** per endpoint and per user
5. **CORS** with strict origin allowlist
6. **Input validation** with Zod schemas
7. **SQL injection prevention** via parameterized queries
8. **OWASP Top 10** compliance
9. **SOC 2 Type II** (target within 18 months)
10. **GDPR/CCPA** compliance

---

## Migration Path

### Phase 1 (Current — ARC 6)
- Desktop app with local-only features
- GitHub Releases for updates
- No backend required

### Phase 2 (ARC 7)
- Launch authentication service
- Launch licensing service
- Launch update server
- Accept payments

### Phase 3 (ARC 8)
- Launch analytics service
- Launch sync service
- Launch credits system
- Team collaboration beta

### Phase 4 (ARC 9+)
- Enterprise features
- SSO/SAML
- Custom AI model hosting
- Marketplace for providers
