# Tokonomics — MVP Execution Plan
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Target:** Production-ready MVP delivering Free + Starter tiers with Growth tier in progress  

---

## Phase Overview

```
Phase 0: Foundation         Week 1      (1-2 days)
Phase 1: Free Tier          Week 1-2    (3-4 days)
Phase 2: Starter Tier       Week 2-3    (5-7 days)
Phase 3: Growth Tier        Week 3-5    (7-10 days)
Phase 4: Scale Tier         Week 5-6    (3-4 days)
Phase 5: Hardening & Launch Week 6-7    (3-5 days)
```

**Approach:** Build vertically per tier. Each tier is shippable. No horizontal sprawl.

---

## Phase 0: Foundation (Day 1–2)

**Goal:** Repo, auth, DB, and deploy pipeline working. Zero features, all plumbing.

### 0.1 Monorepo Setup
```bash
# Initialize Turborepo monorepo
npx create-turbo@latest tokonomics
cd tokonomics

# Create app and package workspaces
mkdir -p apps/{web,ingest,worker}
mkdir -p packages/{db,shared,sdk-node,email-templates}

# Configure turbo.json with pipelines:
# build → test:unit → test:integration (dependency order)
```

**turbo.json pipelines:**
```json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "test:unit": { "dependsOn": [] },
    "test:integration": { "dependsOn": ["build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

### 0.2 Next.js App Setup (apps/web)
```bash
cd apps/web
npx create-next-app@latest . --typescript --tailwind --app --src-dir no
# Install: shadcn/ui, clerk, prisma, zod, react-query, zustand, recharts
```

**Configure:**
- `tailwind.config.ts` with custom color tokens (brand: `#6366f1`)
- `middleware.ts` for Clerk auth (protect all `/` routes except `/api/webhooks/*` and `/`)
- `app/layout.tsx` with ClerkProvider
- `.env.local` from Phase 0 env var template

### 0.3 Database Setup (packages/db)
```bash
# Setup Supabase project
# Create DATABASE_URL and DIRECT_URL

# Initialize Prisma
cd packages/db
npx prisma init
# Copy schema from DATABASE-SCHEMA.md
npx prisma migrate dev --name "initial_schema"
npx prisma generate

# Run raw SQL migrations for partitioning and RLS
npx prisma db execute --file migrations/partitioning.sql
npx prisma db execute --file migrations/rls.sql
npx prisma db seed  # Seed model_pricing table
```

### 0.4 CI/CD Setup
- Create GitHub repo, configure branch protection on `main` (require PR + CI pass)
- Connect Vercel to `apps/web`, set env vars
- Create Railway services for `ingest` and `worker`, set env vars
- Configure GitHub Actions from `06-CICD-DEPLOYMENT.md`

### 0.5 Fastify Ingest Service Setup (apps/ingest)
```bash
cd apps/ingest
yarn add fastify @fastify/rate-limit fastify-plugin
# Basic Fastify server with health endpoint only for now
# Add routes incrementally in Phase 1+
```

### 0.6 BullMQ Worker Setup (apps/worker)
```bash
cd apps/worker
yarn add bullmq ioredis
# Basic worker bootstrap with queue connection only
# Add jobs incrementally in Phase 1+
```

**Phase 0 Deliverable:** `https://app.tokonomics.dev` loads, shows Clerk sign-in, authenticated users reach dashboard shell (empty). CI pipeline runs on every PR.

---

## Phase 1: Free Tier (Day 3–6)

**Goal:** User can connect an OpenAI/Anthropic/Gemini key and see their spend dashboard in 30 seconds.

### 1.1 Encryption Module
```
packages/shared/src/encryption.ts
- encryptApiKey(key: string): EncryptedKey
- decryptApiKey(encrypted: EncryptedKey): string
- Unit tests FIRST (see test plan §4.3)
```

### 1.2 Provider Connection API
Build and test in order:
```
app/api/providers/route.ts → GET (list) + POST (create)
app/api/providers/[id]/route.ts → DELETE
app/api/providers/[id]/sync/route.ts → POST (manual sync)

Validation:
- Schema: Zod validation on all inputs
- Business: Test API key against provider BEFORE saving
- Security: Encrypt key, store last 4 chars only
```

**Provider Validation Calls:**
```typescript
// OpenAI validation: GET https://api.openai.com/v1/models (uses key)
// Anthropic: GET https://api.anthropic.com/v1/models
// Google: GET https://generativelanguage.googleapis.com/v1/models
```

### 1.3 Provider Sync Worker Job
```
apps/worker/src/jobs/provider-sync.ts

1. Fetch all active provider connections (paginated, 100 at a time)
2. Per connection: decrypt key → call provider usage API → normalize → upsert
3. Provider usage API endpoints:
   - OpenAI: GET /v1/usage?date=YYYY-MM-DD
   - Anthropic: GET /v1/usage/tokens?start_time=...&end_time=...
   - Google: Use Cloud Billing API or estimate from model API
4. Normalize response to ProviderUsageRecord format
5. Update connection.last_synced_at
6. Enqueue spike check if spend > 2× 7-day average

Schedule: free tier = every 15 min, paid = every 5 min
```

### 1.4 Spend Overview API + Dashboard UI
```
API: GET /api/overview/spend?period=30d
- Query provider_usage_records for org
- Compute daily series, model mix, projections
- Cache in Redis for 5 minutes

UI Components (in order):
1. <TotalSpendCard> — big number, trend arrow
2. <SpendChart> — daily bar chart (Recharts)
3. <ModelMixChart> — donut chart
4. <ProviderList> — connected providers, sync status
5. <ConnectProviderModal> — form to add key
```

### 1.5 Spend Spike Alerts (Email)
```
apps/worker/src/jobs/alert-check.ts

Spike detection:
- Compute today's spend for org
- Compare to 7-day rolling average
- If today > threshold × avg: create Alert record + send email via Resend
- Don't re-alert if alert already fired today (check last_alerted_at)

Email template: apps/email-templates/src/SpendSpikeAlert.tsx
```

### 1.6 Phase 1 Settings UI
```
/settings/providers — List connections, add/remove
/settings/alerts — Configure spike threshold
```

**Phase 1 Deliverable:** Free tier fully working. Any user can paste API key and see spend dashboard with model mix and alerts. Time-to-value < 5 minutes validated manually.

---

## Phase 2: Starter Tier (Day 7–13)

**Goal:** SDK + per-customer cost attribution working end-to-end.

### 2.1 Billing Integration (Stripe)
```
1. Create Stripe products and prices:
   - starter: $99/month (price_starter)
   - growth: $199/month (price_growth)
   - scale: $399/month (price_scale)

2. app/api/webhooks/stripe/route.ts:
   - customer.subscription.created → update org.plan + subscription record
   - customer.subscription.updated → update plan
   - customer.subscription.deleted → downgrade to FREE

3. Billing portal: Link to Stripe Customer Portal for self-serve upgrades/cancellation

4. Plan gate middleware: check org.plan >= required plan before serving routes
```

### 2.2 SDK API Key Management
```
API:
  GET /api/sdk-keys → list
  POST /api/sdk-keys → create (returns full key ONCE)
  DELETE /api/sdk-keys/:id → revoke

Key generation:
  1. Generate 32 random bytes
  2. Format: tok_live_{base64url(random)}
  3. Hash with bcrypt(cost=10)
  4. Store hash + prefix (first 12 chars) for display

UI: /settings/sdk-keys
  - Show key list with prefix
  - One-click copy on creation (key shown once)
  - Revoke button
  - Integration code snippets (Python/Node.js/LangChain)
```

### 2.3 Fastify Ingestion Service (apps/ingest)
```typescript
// apps/ingest/src/routes/events.ts

POST /ingest/v1/events:
  1. Extract Bearer token from Authorization header
  2. Hash token, look up in sdk_api_keys (use Redis cache, TTL=5min)
  3. Rate limit: 1000 req/min per org (Redis sliding window)
  4. Validate request body (Zod schema)
  5. Calculate cost_usd server-side (model pricing table, cached in Redis)
  6. Check circuit breaker: has budget been exceeded? (Redis check) → 402 if yes
  7. Write usage_event to PostgreSQL
  8. Upsert customer if not exists
  9. Add customer_id to Redis dirty set for aggregation
  10. Return 202 Accepted with costUsd

Optimizations:
  - Use pg COPY for batch inserts (POST /ingest/v1/events/batch)
  - SDK key validation cached in Redis (avoid DB hit on every request)
  - Model pricing cached in Redis (1hr TTL)
  - Budget check uses Redis counter (fast), not DB query
```

### 2.4 Customer Aggregation Worker
```
apps/worker/src/jobs/aggregate-customers.ts

Runs every 30 seconds:
1. Read "dirty_customers:{orgId}" sets from Redis
2. For each dirty customer:
   a. Sum usage_events for current month
   b. Group by model, feature, workflow
   c. Upsert daily_customer_aggregates for today
3. Clear processed customers from dirty set

Runs daily at 2am:
4. Rebuild all aggregates from raw events (catch any missed)
```

### 2.5 Customer Dashboard UI
```
/customers (Starter+):
  Table columns: Customer ID | Monthly Cost | Requests | Top Feature | Status
  - Sort by cost desc, cost asc, margin asc
  - Search by customer ID, email, display name
  - Status badges: Healthy / Watch / Unprofitable / Losing Money
  - Pagination (50 per page)
  - Export CSV button

/customers/[id] (detail page):
  - Cost breakdown by feature (bar chart)
  - Cost breakdown by model (donut)
  - Daily cost trend (line chart, last 30 days)
  - Budget rules for this customer
  - Alert history
```

### 2.6 Budget Rules UI
```
/alerts (settings area):
  - Create budget rule: scope (org/customer/feature), period, limit, alert %, circuit break
  - List active rules
  - Edit / delete rules

Budget rule evaluation (in worker):
  - Every 5 minutes: check Redis counters against budget rules
  - Fire alert if threshold crossed
  - Write to alerts table
  - Send email/Slack notification
```

### 2.7 No-Code Prompt Assist
```
/settings/sdk-keys page includes:
  A "Prompt Assist" tab with copy-paste prompt:
  "Add this to your Cursor/Claude Code/Lovable prompt:
  'Add tokonomics tracking to every LLM call. Use the logged-in 
  user as customer_id, infer the feature name from the route. 
  API key: {org_sdk_key}'"

  Shows Python and Node.js code snippets auto-populated with their API key.
```

### 2.8 Node.js SDK Package (packages/sdk-node)
```typescript
// Minimal SDK for NPM
export class Tokonomics {
  constructor(options: { apiKey: string; baseUrl?: string })
  
  async track<T>(
    context: { customerId: string; feature?: string; workflow?: string },
    fn: () => Promise<T>
  ): Promise<T>
  
  middleware(): ExpressMiddleware  // Auto-extract customer from req.user
}

// publish to npm as: tokonomics@0.1.0
```

**Phase 2 Deliverable:** Starter tier fully working. SDK events flow through to customer table. Budget alerts fire. Stripe billing gates features correctly.

---

## Phase 3: Growth Tier (Day 14–23)

**Goal:** Stripe revenue connected, gross margin visible, routing suggestions, pricing simulator, weekly digest, AI Margin Score.

### 3.1 Stripe OAuth Integration
```
app/api/stripe/oauth-url/route.ts
  - Generate Stripe OAuth URL with scope=read_only
  - State param = signed JWT with orgId (prevent CSRF)

app/api/stripe/oauth-callback/route.ts
  - Exchange code for access_token
  - Encrypt and store in stripe_connections
  - Trigger immediate stripe-sync job

apps/worker/src/jobs/stripe-sync.ts
  - Fetch Stripe customers and subscriptions
  - Attempt email/ID matching to tracked customers
  - Store in stripe_customers table
  - Trigger margin calculation for matched customers
```

### 3.2 Gross Margin Calculation
```
apps/worker/src/jobs/margin-calculate.ts

Triggered after: stripe-sync OR daily aggregate update

For each customer with Stripe match:
  1. mrr = stripe_customers.mrr_cents / 100 (USD)
  2. llm_cost = monthly sum from daily_customer_aggregates
  3. gross_margin_pct = (mrr - llm_cost) / mrr × 100
  4. Determine status vs margin floor rule
  5. Upsert customer_margin_snapshot for today
  6. Check margin floor → enqueue alert if breached

For org-level:
  7. Calculate weighted average margin
  8. Calculate AI Margin Score (see algorithm in Architecture doc)
  9. Upsert org_margin_scores for today
```

### 3.3 AI Gross Margin Dashboard UI
```
/margin (Growth+):
  - Summary cards: Gross Margin %, LLM COGS, MRR, Net Margin
  - Customer margin table (same as /customers but with revenue column + margin %)
  - Status distribution: Healthy / Watch / Unprofitable / Losing counts
  - Margin trend chart (30 days)
  - AI Margin Score widget (gauge/donut + component breakdown)
  
Margin floor configuration:
  - Set floor percentage (e.g. 60%)
  - Alerts fire when any customer drops below
```

### 3.4 Pricing Simulator
```
/simulator (Growth+):

UI:
  - Mode selector: Flat / Usage-based / Tiered
  - Inputs: base price, price per token, fair-use limits, tiers
  - "Run Simulation" → call POST /api/simulator/run
  - Results: MRR lift %, margin improvement, per-customer impact table
  - "Save Simulation" → stores config + results
  - "Compare scenarios" → side-by-side saved simulations

Backend:
  POST /api/simulator/run:
  1. Load all customers with their last-30d usage + current MRR
  2. Apply new pricing config to each customer's token usage
  3. Calculate new MRR per customer, new margin per customer
  4. Return aggregated results + per-customer breakdown
```

### 3.5 Model Routing Tests
```
/routing (Growth+):

UI:
  - Create test: name, feature filter, control model, treatment model
  - Start / Stop test
  - Results view: cost comparison, savings, latency comparison

Backend:
  - When test is "RUNNING": tag incoming usage_events with test_id
  - At test end: query events split by model, compute cost/latency delta
  - Generate recommendation text using Claude API (simple prompt):
    "Given these results: [data], write a 2-sentence routing recommendation"
```

### 3.6 Slack Integration
```
/settings/slack:
  - Enter Slack webhook URL
  - Test button → send test message
  - Alert delivery: existing alert-check worker sends to Slack webhook
  
Slack message format (Block Kit):
  🚨 *Margin Alert* | cust_9x8q
  > Gross margin dropped to -4.7%
  > Revenue: $49 | LLM Cost: $51.30
  [View Customer →]
```

### 3.7 Weekly Margin Digest
```
apps/worker/src/jobs/digest-generate.ts
  Schedule: Monday 7am UTC

  For each org with digest enabled:
  1. Compute weekly summary:
     - Customers that crossed margin floor this week
     - Biggest cost spikes (customer or workflow)
     - Model routing opportunities (top 3 by savings potential)
     - Week-over-week margin score change
  2. Render email template (React Email)
  3. Send via Resend to recipient_emails
  4. If Slack connected: send summary message

apps/email-templates/src/WeeklyDigest.tsx
  - Clean table design matching brand
  - "View Dashboard →" CTA button
```

### 3.8 AI Margin Score UI
```
/margin page → Margin Score section:
  - Score gauge: 0-100 with color bands (red < 40, yellow 40-70, green > 70)
  - Component breakdown bars: base / concentration / waste / pricing fit / trend
  - Insights list: drag/lift items with action recommendations
  - 30-day score history line chart
```

**Phase 3 Deliverable:** Growth tier fully working. End-to-end: SDK events → customer attribution → Stripe revenue → gross margin → weekly digest → Slack alerts.

---

## Phase 4: Scale Tier (Day 24–27)

### 4.1 Team Access
```
/settings/team (Scale+):
  - Invite by email (sends Clerk invitation)
  - Roles: Owner / Admin / Viewer
  - Remove member
  
Role permissions:
  - Viewer: read-only dashboard
  - Admin: manage integrations, budgets, alerts
  - Owner: billing, team management, delete org
```

### 4.2 Public API
```
apps/web/app/api/v1/[...route]/route.ts
  - Authenticate via X-API-Key header (org-level API key, separate from SDK key)
  - Expose: /v1/spend/summary, /v1/customers, /v1/customers/:id, /v1/margin-score, /v1/alerts
  - Full OpenAPI documentation at /api/v1/docs (Swagger UI)
  - Rate limit: 1000 req/hour per org
```

### 4.3 White-Label Investor Reports
```
/reports (Scale+):
  - Period selector: 30d / 90d / QTD / YTD
  - Preview: margin score, customer health distribution, cost trends, MRR trend
  - Export as PDF (Puppeteer headless render or @react-pdf/renderer)
  - Custom org logo on report
```

### 4.4 Margin Copilot
```
/margin page → Copilot panel (Scale+):
  - Triggered by: low margin score, unprofitable customers, model waste detected
  - Calls Claude API with:
    - Org's margin score and components
    - Top 3 unprofitable customers (anonymized internally)
    - Model usage breakdown
  - Returns 3 specific, actionable recommendations
  - "Apply routing rule" and "Set cap" quick actions from copilot panel
```

**Phase 4 Deliverable:** Scale tier complete. All four pricing tiers fully functional.

---

## Phase 5: Hardening & Launch (Day 28–35)

### 5.1 Performance Optimization
- [ ] Verify all DB queries use indexes (run EXPLAIN ANALYZE on slow queries)
- [ ] Enable Prisma Accelerate for connection pooling
- [ ] Add Redis caching for all dashboard queries (spend overview, customer table, margin score)
- [ ] Lazy-load heavy chart components in Next.js
- [ ] Verify ingest service handles 1000+ RPS (run load test against staging)
- [ ] Set up materialized view auto-refresh in worker

### 5.2 Security Audit
- [ ] Verify all API routes check org membership (no missing orgId filters)
- [ ] Verify encryption/decryption works correctly for all stored secrets
- [ ] Test Stripe webhook signature verification
- [ ] Test Clerk webhook signature verification
- [ ] Verify no prompt content leaks in SDK (test with fake secret in prompt)
- [ ] Enable PostgreSQL RLS policies
- [ ] Review rate limiting on all sensitive endpoints
- [ ] Dependency audit: `yarn audit --level=high`

### 5.3 Python SDK
```bash
cd packages/sdk-python
# Implement: tokonomics/__init__.py
# Classes: Tokonomics, track decorator, context manager
# Support: openai, anthropic, google-generativeai, langchain
# Publish: pip install tokonomics (PyPI)
```

### 5.4 Error Handling & Observability
- [ ] Sentry integration in all 3 services (apps/web, apps/ingest, apps/worker)
- [ ] Structured logging in worker (pino)
- [ ] PostHog product analytics events: provider_connected, sdk_key_created, first_customer_tracked, stripe_connected
- [ ] Health check endpoints for all services
- [ ] Set up UptimeRobot for all health endpoints

### 5.5 Seed Data & Testing
- [ ] Create test org with realistic data for demos
- [ ] Create test Stripe webhook simulator
- [ ] Test full onboarding flow manually (time it)
- [ ] Test SDK integration end-to-end (Python + Node.js)
- [ ] Verify weekly digest emails render correctly

### 5.6 Launch Checklist
- [ ] Custom domain: `app.tokonomics.dev` → Vercel
- [ ] Custom domain: `ingest.tokonomics.dev` → Railway
- [ ] Custom domain: `api.tokonomics.dev` → Railway  
- [ ] SSL certificates auto-provisioned (Vercel + Railway)
- [ ] DKIM/SPF configured for `tokonomics.dev` email (Resend)
- [ ] Privacy Policy and Terms of Service pages live
- [ ] Stripe production mode activated
- [ ] Waitlist → early access email send (Tally.so → Resend)

---

## Build Order Summary (strict sequence)

```
1. Monorepo + CI/CD (never skip this — enables everything else)
2. Auth (Clerk) + DB schema
3. Encryption module (unit tested)
4. Provider connection + sync job (Free tier)
5. Spend dashboard UI (Free tier complete)
6. Stripe billing + plan gates
7. SDK key management
8. Ingest service (events API)
9. Customer aggregation
10. Customer table UI (Starter complete)
11. Stripe OAuth integration  
12. Margin calculation
13. Gross margin dashboard UI
14. Pricing simulator
15. Model routing
16. Slack + weekly digest
17. AI Margin Score (Growth complete)
18. Team access
19. Public API
20. Investor reports
21. Margin copilot (Scale complete)
22. Python SDK
23. Hardening + launch
```
