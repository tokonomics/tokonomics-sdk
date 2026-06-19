# Tokonomics — Architecture & System Design Specification
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Status:** APPROVED — Do not deviate without architecture review  

---

## 1. System Overview

Tokonomics is a **multi-tenant SaaS platform** with three distinct data flows:

1. **Pull Flow:** Tokonomics polls LLM providers (OpenAI, Anthropic, Gemini) using org-stored API keys to fetch raw spend data
2. **Push Flow (SDK):** Customer apps send usage events to Tokonomics ingestion API in real time
3. **Pull Flow (Stripe):** Tokonomics polls Stripe via OAuth to fetch revenue per customer

These three data sources are joined at the **customer level** to produce gross margin.

---

## 2. Technology Stack

### 2.1 Monorepo Structure (Turborepo)
```
tokonomics/
├── apps/
│   ├── web/              # Next.js 14 App Router (dashboard + landing)
│   ├── ingest/           # Fastify ingestion microservice (high-throughput)
│   └── worker/           # Background job processor (BullMQ)
├── packages/
│   ├── sdk-python/       # PyPI package: tokonomics
│   ├── sdk-node/         # npm package: tokonomics
│   ├── db/               # Prisma schema + migrations + client
│   ├── shared/           # Shared types, constants, utilities
│   └── email-templates/  # React Email templates
├── infrastructure/
│   ├── docker/           # Dockerfiles per service
│   └── k8s/              # Kubernetes manifests (Scale tier infra)
├── docs/                 # Engineering artifacts (this folder)
└── turbo.json
```

### 2.2 Frontend (apps/web)
| Layer | Technology | Justification |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR, RSC, API routes, proven at scale |
| Language | TypeScript 5.4+ | Type safety across monorepo |
| Styling | Tailwind CSS 3.4 | Utility-first, matches landing page |
| UI Components | shadcn/ui + Radix UI | Accessible, unstyled, customizable |
| Charts | Recharts + Tremor | Finance dashboards, composable |
| State | Zustand + React Query (TanStack v5) | Server-state + client-state separation |
| Auth | Clerk | Multi-tenant auth, org management, webhooks |
| Forms | React Hook Form + Zod | Type-safe form validation |
| Table | TanStack Table v8 | Virtualized sortable tables for customer data |

### 2.3 Backend (apps/web API Routes + apps/ingest)
| Layer | Technology | Justification |
|---|---|---|
| API (dashboard) | Next.js Route Handlers | Co-located with UI, tRPC-compatible |
| API (ingestion) | Fastify | 10K+ RPS, minimal overhead, not in Next.js request lifecycle |
| ORM | Prisma 5 | Type-safe DB access, migrations, Prisma Accelerate for pooling |
| Validation | Zod | Runtime + compile-time type safety |
| Queue | BullMQ (Redis-backed) | Job scheduling, retry logic, DLQ |
| Cron | BullMQ cron jobs | Provider polling, digest generation |
| Email | Resend + React Email | Transactional + digest emails |

### 2.4 Data Layer
| Component | Technology | Justification |
|---|---|---|
| Primary Database | PostgreSQL 16 | ACID, jsonb, time-series queries, partitioning |
| Cache / Queue | Redis 7 (Upstash) | Serverless Redis, BullMQ backend, rate limiting |
| Time-Series Aggregation | PostgreSQL materialized views + TimescaleDB extension | Efficient range queries on usage_events |
| Connection Pooling | Prisma Accelerate OR PgBouncer | Serverless-safe DB connections |
| Full-Text Search | PostgreSQL pg_trgm | Customer search |

### 2.5 Infrastructure & Deployment
| Component | Technology | Notes |
|---|---|---|
| Frontend Hosting | **Vercel Pro** ($20/month) | Commercial use requires Pro. Already on trial — keep subscription. Auto-deploy from main. |
| Ingest Service | **Fly.io** (free tier → paid) | 3 free shared VMs cover early-stage. `fly.toml` config in `apps/ingest/`. |
| Worker Service | **Fly.io** (free tier → paid) | Same Fly.io org. `fly.toml` in `apps/worker/`. |
| Database | **Supabase PostgreSQL** (free → Pro at $25/month) | Free tier: 500MB, pauses after 1 week of inactivity. Add GitHub Actions keep-alive cron. Upgrade to Pro on first paying customer. |
| Redis | **Upstash Redis** (free tier) | 500K commands/month free covers early stage. Pay-as-you-go after. |
| Secrets | **Vercel Environment Variables** (web) + **Fly.io secrets** (ingest/worker) | No additional secrets manager needed pre-revenue. |
| CDN | Vercel Edge Network | Included in Vercel Pro. |
| Monitoring | Sentry (errors) + Vercel Analytics + PostHog (product analytics) | All have generous free tiers. |
| Logs | Fly.io built-in logs + Vercel logs | Sufficient for early stage. Add Axiom when log volume warrants it. |

**Infrastructure cost pre-revenue:** $20/month (Vercel Pro only). Everything else on free tiers.  
**Infrastructure cost post-first-customer:** +$25/month (Supabase Pro). Total: $45/month.

---

## 3. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SYSTEMS                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │   OpenAI API  │  │ Anthropic API │  │  Gemini  │  │  Stripe API     │   │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  └────────┬────────┘   │
└─────────┼─────────────────┼───────────────┼──────────────────┼────────────┘
          │  (polling)      │  (polling)    │  (polling)       │  (OAuth)
          └─────────────────┴───────────────┘                  │
                            │                                   │
┌───────────────────────────▼──────────────────────────────────▼────────────┐
│                           TOKONOMICS PLATFORM                               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    apps/web (Next.js 14)                           │    │
│  │  ┌──────────────────┐  ┌───────────────────┐  ┌────────────────┐ │    │
│  │  │   Dashboard UI   │  │   API Routes      │  │   Webhooks    │ │    │
│  │  │  (React/RSC)     │  │  /api/v1/*        │  │  /api/webhooks│ │    │
│  │  └──────────────────┘  └─────────┬─────────┘  └───────┬───────┘ │    │
│  └───────────────────────────────────┼─────────────────────┼────────┘    │
│                                       │                     │              │
│  ┌────────────────────────────────────▼─────────────────────▼────────┐    │
│  │                    packages/db (Prisma)                           │    │
│  │              PostgreSQL connection pool                            │    │
│  └────────────────────────────────────┬───────────────────────────────┘   │
│                                        │                                    │
│  ┌─────────────────────┐  ┌───────────▼────────┐  ┌────────────────────┐  │
│  │  apps/ingest        │  │   PostgreSQL 16     │  │  apps/worker       │  │
│  │  (Fastify/Fly.io)   │  │   (Supabase)        │  │  (BullMQ/Fly.io)   │  │
│  │                     │  │                     │  │                    │  │
│  │  POST /ingest/v1/   │  │  usage_events       │  │  provider-sync     │  │
│  │  events (10K RPS)   │  │  (partitioned)      │  │  digest-gen        │  │
│  │                     │  │  customers          │  │  alert-check       │  │
│  └──────────┬──────────┘  │  organizations      │  │  stripe-sync       │  │
│             │             │  subscriptions      │  │  margin-calc       │  │
│             │             └─────────────────────┘  └────────┬───────────┘  │
│             │                                               │               │
│             └───────────────────► Redis (Upstash) ◄─────────┘               │
│                              (queue + cache + rate limit)                   │
└─────────────────────────────────────────────────────────────────────────────┘
          ▲
          │  SDK events (async, non-blocking)
          │
┌─────────┴─────────────────────────────────────────────────────────────────┐
│                          CUSTOMER'S APPLICATION                             │
│                                                                             │
│  ┌───────────────────────────┐   ┌──────────────────────────────────────┐  │
│  │  Python SDK               │   │  Node.js SDK                         │  │
│  │  @track(customer_id=...)  │   │  withTracking({customerId: ...})     │  │
│  └───────────────────────────┘   └──────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Specifications

### 4.1 Provider Polling Flow (Free Tier)
```
SCHEDULE: Every 15 min (free) / 5 min (paid)

Worker Job: provider-sync
  1. Fetch active organizations with provider connections
  2. For each connection:
     a. Decrypt API key from DB (KMS)
     b. Call provider's usage API endpoint
     c. Parse response into normalized ProviderUsageRecord
     d. Upsert into provider_usage_records table
     e. Trigger aggregate recalculation
     f. Check spend spike conditions → enqueue alert if triggered
  3. Update connection.last_synced_at
```

### 4.2 SDK Event Ingestion Flow (Starter Tier)
```
SDK CALL (customer app) → POST /ingest/v1/events
  1. Fastify receives event
  2. Validate SDK API key → look up org_id
  3. Rate limit check (Redis): 10K events/sec global, 100 events/sec per org
  4. Validate event schema (Zod)
  5. Calculate cost_usd server-side using model pricing table
  6. Write to usage_events (PostgreSQL) with org_id, customer_id, timestamp
  7. Push customer_id to Redis set: "dirty_customers:{org_id}"
  8. Return 202 Accepted (async processing)
  
  BACKGROUND (every 30s):
  9. Worker reads dirty_customers set
  10. Recalculate daily_customer_aggregates for dirty customers
  11. Check budget rules → enqueue alerts if triggered
```

### 4.3 Stripe Sync Flow (Growth Tier)
```
SCHEDULE: Every 6 hours + on Stripe webhook

Worker Job: stripe-sync
  1. Fetch orgs with active Stripe connections
  2. For each connection:
     a. Decrypt Stripe access token
     b. Fetch customers list from Stripe API
     c. Fetch subscriptions + MRR per customer
     d. Attempt customer matching:
        - Exact: customer_id match
        - Fuzzy: email match (normalized)
        - Manual: org-defined mapping table
     e. Upsert into stripe_customers table
  3. Trigger margin recalculation for matched customers
```

### 4.4 Margin Calculation Flow
```
TRIGGER: After stripe-sync OR after daily_aggregate update

margin_pct = (mrr - monthly_llm_cost) / mrr × 100

  1. Join daily_customer_aggregates + stripe_customers on (org_id, customer_id)
  2. Compute gross_margin_pct for each customer
  3. Write to customer_margin_snapshots (daily)
  4. Check margin_floor_rules → enqueue alert if below floor
  5. Recalculate AI Margin Score for org (see scoring algorithm)
```

---

## 5. Folder Structure (apps/web)

```
apps/web/
├── app/
│   ├── (auth)/               # Clerk auth routes
│   │   ├── sign-in/
│   │   └── sign-up/
│   ├── (dashboard)/          # Authenticated dashboard
│   │   ├── layout.tsx        # Dashboard shell, sidebar
│   │   ├── overview/         # Main spend overview (Free)
│   │   │   └── page.tsx
│   │   ├── customers/        # Per-customer table (Starter+)
│   │   │   ├── page.tsx
│   │   │   └── [customerId]/
│   │   │       └── page.tsx
│   │   ├── margin/           # Gross margin dashboard (Growth+)
│   │   │   └── page.tsx
│   │   ├── alerts/           # Alert management
│   │   │   └── page.tsx
│   │   ├── simulator/        # Pricing simulator (Growth+)
│   │   │   └── page.tsx
│   │   ├── routing/          # Model routing tests (Growth+)
│   │   │   └── page.tsx
│   │   └── settings/         # Org settings, integrations, billing
│   │       ├── providers/
│   │       ├── stripe/
│   │       ├── slack/
│   │       ├── sdk-keys/
│   │       ├── team/         # Scale+
│   │       └── billing/
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── clerk/        # User sync
│   │   │   ├── stripe/       # Payment events
│   │   │   └── slack/
│   │   └── v1/               # Public API (Scale tier)
│   │       └── [...route]/
│   └── (marketing)/          # Public landing pages
│       └── page.tsx
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   ├── charts/               # Recharts wrappers
│   ├── dashboard/            # Domain-specific components
│   │   ├── CustomerTable/
│   │   ├── MarginScore/
│   │   ├── SpendChart/
│   │   ├── ModelMixPie/
│   │   └── AlertFeed/
│   └── layouts/
├── lib/
│   ├── auth.ts               # Clerk helpers
│   ├── db.ts                 # Prisma client singleton
│   ├── redis.ts              # Upstash Redis client
│   ├── stripe.ts             # Stripe client
│   ├── resend.ts             # Resend client
│   ├── encryption.ts         # AES-256 key encryption/decryption
│   ├── pricing/              # Model pricing tables (updated regularly)
│   │   └── model-costs.ts
│   └── validators/           # Zod schemas
├── hooks/                    # Custom React hooks
├── stores/                   # Zustand stores
└── types/                    # Shared TypeScript types
```

---

## 6. AI Margin Score Algorithm

The AI Margin Score is a 0–100 composite score:

```typescript
interface MarginScoreComponents {
  baseMarginScore: number;    // 0-40 pts: weighted avg gross margin across customers
  concentrationPenalty: number; // 0-(-20) pts: % revenue from top 3 customers
  wasteScore: number;         // 0-20 pts: % of calls using cheapest adequate model
  pricingFitScore: number;    // 0-20 pts: correlation between usage and revenue
  trendBonus: number;         // 0-10 pts: margin improving over 30 days
}

function calculateMarginScore(org: OrgData): number {
  const base = weightedAvgMargin(org.customers) * 0.4;        // up to 40
  const concentration = calcConcentrationPenalty(org);         // up to -20
  const waste = calcModelWasteScore(org.usageEvents);          // up to 20
  const pricingFit = calcPricingFitScore(org);                 // up to 20
  const trend = calcTrendBonus(org.marginHistory);              // up to 10
  
  return Math.max(0, Math.min(100, 
    base + concentration + waste + pricingFit + trend
  ));
}
```

---

## 7. Security Architecture

### 7.1 API Key Encryption
```
Provider API Key Storage:
  NEVER store plaintext API keys in DB
  
  Storage flow:
  1. User pastes API key
  2. Server generates random 32-byte IV
  3. Encrypt: AES-256-GCM(key=KMS_KEY, iv=IV, data=API_KEY)
  4. Store: {encrypted_value, iv, auth_tag} in provider_connections.encrypted_key
  
  Retrieval:
  1. Fetch encrypted_key from DB
  2. Decrypt using KMS_KEY from environment
  3. Use decrypted key for API call
  4. NEVER return decrypted key to frontend
  5. Clear from memory after use
```

### 7.2 SDK API Key Format
```
Format: tok_live_{org_id_hash}_{random_32_chars}
Example: tok_live_8f3a2b_k9mxp2qr7nw1...

- Stored as: hash(key) in api_keys table (bcrypt, cost=10)
- On validation: hash incoming key, compare to stored hash
- Last 4 chars shown in UI for identification
```

### 7.3 Multi-Tenancy Isolation
```
ALL database queries MUST include org_id filter.
Pattern: prisma.table.findMany({ where: { orgId: ctx.orgId, ...filters } })

Row Level Security (RLS) enabled in PostgreSQL as defense-in-depth:
CREATE POLICY org_isolation ON usage_events 
  USING (org_id = current_setting('app.org_id'));
```

---

## 8. Caching Strategy

| Data | Cache TTL | Cache Key |
|---|---|---|
| Org spend overview (last 30d) | 5 minutes | `spend:org:{orgId}:30d` |
| Customer cost table | 1 minute | `customers:org:{orgId}` |
| Model pricing table | 1 hour | `pricing:models` |
| Margin score | 5 minutes | `score:org:{orgId}` |
| Stripe customer list | 6 hours | `stripe:customers:org:{orgId}` |
| Budget rule set | 10 minutes | `budgets:org:{orgId}` |

Cache invalidation on write (Redis DEL pattern).

---

## 9. Rate Limiting

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| POST /ingest/v1/events | 1000 req | 1 minute | per org |
| GET /api/v1/* (Scale API) | 1000 req | 1 hour | per org |
| POST /api/providers (key connect) | 10 req | 1 hour | per user |
| POST /api/slack/test | 5 req | 1 minute | per org |
| GET /api/customers (dashboard) | 60 req | 1 minute | per user |

Rate limits enforced via Upstash Redis + custom middleware.

---

## 10. Background Jobs (BullMQ)

| Job Name | Schedule | Queue | Priority |
|---|---|---|---|
| provider-sync:paid | Every 5 minutes | provider-sync | High |
| provider-sync:free | Every 15 minutes | provider-sync | Low |
| stripe-sync | Every 6 hours | stripe | Medium |
| margin-calculate | Triggered | calculations | High |
| alert-check | Every 5 minutes | alerts | High |
| digest-generate | Monday 7am UTC | digest | Low |
| aggregate-rebuild | Daily 2am UTC | maintenance | Low |
| api-key-cleanup | Daily 3am UTC | maintenance | Low |

Concurrency: 10 workers per queue. Dead Letter Queue after 3 retries.
