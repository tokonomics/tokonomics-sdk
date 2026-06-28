# CLAUDE.md — Tokonomics Agent Context
**This file is read automatically by Claude Code on every session.**  
**Do not delete or modify without human approval.**

---

## What Is This Project?

Tokonomics is an **AI gross margin intelligence platform** for AI SaaS founders.  
It connects LLM provider spend → customer attribution → Stripe revenue → gross margin per customer.

**Live landing page:** https://tokonomics.dev  
**Target users:** AI SaaS founders using OpenAI / Anthropic / Gemini in their products

---

## Your Role

You are building the full Tokonomics product. You are a principal engineer.  
You write production-grade, type-safe, tested code. You do not prototype.

---

## Engineering Documents (Read Before Coding)

All documents are in `./docs/`:

| File | Read When |
|---|---|
| `01-PRD.md` | Understanding what to build and what NOT to build |
| `02-ARCHITECTURE.md` | Structuring code, choosing libraries, understanding data flow |
| `03-DATABASE-SCHEMA.md` | Writing Prisma schema, migrations, queries |
| `04-API-SPECIFICATION.md` | Building API routes or calling them from the frontend |
| `05-TEST-PLAN.md` | Writing tests (always read before writing implementation) |
| `06-CICD-DEPLOYMENT.md` | Setting up CI, Docker, env vars, deployment |
| `07-EXECUTION-PLAN.md` | What to build next (follow this order strictly) |
| `08-AGENT-INSTRUCTIONS.md` | Rules that govern all your decisions (READ FIRST) |

---

## Confirmed Infrastructure Decisions (DO NOT CHANGE)

These are finalized decisions. Do not propose alternatives.

| Service | Decision | Cost |
|---|---|---|
| **Frontend hosting** | **Vercel Pro** — already on trial, will subscribe | $20/month |
| **Ingest service** | **Fly.io** — free tier (shared-cpu-1x, 256MB) | $0 |
| **Worker service** | **Fly.io** — free tier (shared-cpu-1x, 256MB) | $0 |
| **Database** | **Supabase free tier** → upgrade to Pro ($25/mo) on first paying customer | $0 now |
| **Redis** | **Upstash free tier** (500K commands/month) | $0 |
| **Auth** | **Clerk free tier** (50K MAU free) | $0 |
| **Email** | **Resend free tier** (3K emails/month) | $0 |
| **Errors** | **Sentry free tier** (5K errors/month) | $0 |
| **Analytics** | **PostHog free tier** (1M events/month) | $0 |

**Total pre-revenue cost: $20/month (Vercel Pro only)**

**Supabase free tier keep-alive:** A GitHub Actions workflow pings Supabase every 4 days to prevent the free tier 7-day inactivity pause. See `06-CICD-DEPLOYMENT.md §5` for the workflow. Delete it when upgrading to Pro.

---

## Current Build Status

> **Update this section when a phase is completed.**

- [x] **Phase 0: Foundation** — ✅ COMPLETE (2026-06-19)
- [x] **Phase 1: Free Tier** — ✅ COMPLETE (2026-06-19)
  - [x] Encryption module (AES-256-GCM) — 9 unit tests ✅
  - [x] Model pricing / cost calculation — 11 unit tests ✅
  - [x] Provider Connection API (GET/POST/DELETE) — validates key before saving ✅
  - [x] Provider Sync Worker (OpenAI + Anthropic usage API) — 15 min cron ✅
  - [x] Spend Overview API + dashboard UI — bar chart, donut, period picker ✅
  - [x] Spend spike alert job — 2× 7-day average detection ✅
  - [x] app.tokonomics.dev live — Vercel Pro ✅
- [x] **Phase 2: Starter Tier** — ✅ COMPLETE (2026-06-28)
  - [x] SDK key generation (bcrypt, 9 unit tests) — GET/POST/DELETE /api/sdk-keys ✅
  - [x] Ingest service — POST /ingest/v1/events live at ingest.tokonomics.dev ✅
  - [x] Customer aggregation worker job (dirty-set pattern) ✅
  - [x] Customer dashboard — /customers with sort, search, CSV export ✅
  - [x] No-code Prompt Assist — copy-paste prompt in SDK Keys page ✅
  - [x] Docker fixes: tsup bundling, prisma generate, OpenSSL 3.x binary ✅
  - [x] Billing deferred → Lemon Squeezy (2.1 skipped, org set to STARTER in DB)
- [ ] Phase 3: Growth Tier
- [ ] Phase 4: Scale Tier
- [ ] Phase 3: Growth Tier
- [ ] Phase 4: Scale Tier
- [ ] Phase 5: Hardening & Launch

---

## Tech Stack (Quick Reference)

```
Frontend:     Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
Auth:         Clerk (50K MAU free)
Database:     PostgreSQL 16 (Supabase free) + Prisma 5
Cache/Queue:  Upstash Redis (free) + BullMQ
Ingest API:   Fastify on Fly.io (free tier)
Worker:       BullMQ on Fly.io (free tier)
Email:        Resend (free) + React Email
Payments:     Stripe
Monitoring:   Sentry + PostHog
Deploy:       Vercel Pro (web) + Fly.io (ingest + worker)
```

---

## Monorepo Structure

```
tokonomics/
├── apps/
│   ├── web/           # Next.js 14 dashboard + API routes → Vercel Pro
│   ├── ingest/        # Fastify event ingestion service → Fly.io
│   └── worker/        # BullMQ background jobs → Fly.io
├── packages/
│   ├── db/            # Prisma schema + client
│   ├── shared/        # Types, encryption, cost calculation
│   ├── sdk-node/      # npm: tokonomics
│   └── sdk-python/    # pip: tokonomics
└── docs/              # Engineering specs (this folder)
```

---

## Critical Rules (Memorize These)

1. **Every DB query includes `orgId`** — multi-tenancy security
2. **Never return decrypted API keys** — only `keyLastFour` metadata  
3. **Cost calculated server-side** — never trust client-provided cost
4. **SDK never captures prompt content** — privacy guarantee
5. **Test business logic first** — write tests before implementation
6. **Stay in current phase** — don't build ahead without approval
7. **No scope creep** — if it's not in the PRD, don't build it
8. **Fly.io for ingest and worker** — not Railway, not Render, not other platforms
9. **Supabase keep-alive** — ensure the GitHub Actions cron is in place before any break in development

---

## Key Commands

```bash
# Development
yarn dev                                  # Start all apps (turbo)
yarn workspace @tokonomics/web dev        # Web only
yarn workspace @tokonomics/ingest dev     # Ingest only
yarn workspace @tokonomics/worker dev     # Worker only

# Testing
yarn test:unit                            # Fast unit tests
yarn test:integration                     # Needs DB + Redis running
yarn test:coverage                        # Coverage report (must stay ≥85%)

# Database
yarn prisma migrate dev --name "..."      # New migration (dev only)
yarn prisma migrate deploy                # Apply migrations (CI/prod only)
yarn prisma generate                      # Regenerate client after schema change
yarn prisma studio                        # Visual DB browser

# Type checking & lint
yarn typecheck                            # tsc across all packages
yarn lint                                 # ESLint across all packages

# Build
yarn build                                # Build all apps

# Fly.io deployment (manual)
fly deploy --config apps/ingest/fly.toml
fly deploy --config apps/worker/fly.toml

# Fly.io logs
fly logs --app tokonomics-ingest
fly logs --app tokonomics-worker
```

---

## Environment Setup (Local Dev)

1. Copy `.env.example` files to `.env.local` in each app
2. Set up Supabase project → copy `DATABASE_URL` and `DIRECT_URL`
3. Set up Upstash Redis → copy `UPSTASH_REDIS_REST_URL` and token
4. Set up Clerk app → copy publishable key and secret
5. Generate `ENCRYPTION_KEY`: `openssl rand -hex 32`
6. Run `yarn workspace @tokonomics/db prisma migrate dev`
7. Run `yarn workspace @tokonomics/db prisma db seed`
8. Run `yarn dev`

Full env var reference: `docs/06-CICD-DEPLOYMENT.md §2`

---

## Before Every Session

1. Read `docs/08-AGENT-INSTRUCTIONS.md` completely
2. Check "Current Build Status" above — know your phase and step
3. Run `git log --oneline -10` to see recent changes
4. Run `yarn typecheck && yarn test:unit` to confirm baseline is green
5. Then and only then: start coding
