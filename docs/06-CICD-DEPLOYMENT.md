# Tokonomics — CI/CD & Deployment Pipeline Configuration
**Version:** 1.1 (Updated: Railway → Fly.io, Vercel Pro confirmed)
**Last Updated:** 2026-06-18  

---

## 1. Deployment Architecture Overview

```
GitHub (main) ──► GitHub Actions ──► Three Deployment Targets:
                                      ├── Vercel Pro (apps/web)         ← $20/month, already on trial
                                      ├── Fly.io (apps/ingest)          ← free tier
                                      └── Fly.io (apps/worker)          ← free tier

Environments:
  dev     → Feature branches → Vercel preview deployments (auto)
  staging → staging branch → Full integration testing
  prod    → main branch → Production deployment (gated by CI pass)

Pre-revenue monthly cost: $20 (Vercel Pro only)
Post-first-customer:      $45 (+ Supabase Pro $25/month)
```

---

## 2. Environment Variables

### apps/web (Vercel Pro — set in Vercel dashboard)
```bash
# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Database
DATABASE_URL=postgresql://user:pass@db.supabase.co:6543/tokonomics?pgbouncer=true
DIRECT_URL=postgresql://user:pass@db.supabase.co:5432/tokonomics  # For migrations only

# Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# Encryption (64-char hex — generate once, never rotate)
ENCRYPTION_KEY=xxxx...xxxx

# Stripe (Tokonomics own billing)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_GROWTH=price_xxx
STRIPE_PRICE_SCALE=price_xxx

# Email
RESEND_API_KEY=re_xxx
FROM_EMAIL=hello@tokonomics.dev

# Internal service communication
INGEST_SERVICE_URL=https://ingest.tokonomics.dev
INGEST_INTERNAL_SECRET=xxx

# App config
NEXT_PUBLIC_APP_ENV=production
```

### apps/ingest (Fly.io — set via `fly secrets set`)
```bash
fly secrets set \
  DATABASE_URL="postgresql://..." \
  UPSTASH_REDIS_REST_URL="https://..." \
  UPSTASH_REDIS_REST_TOKEN="xxx" \
  ENCRYPTION_KEY="xxxx...xxxx" \
  INGEST_INTERNAL_SECRET="xxx" \
  PORT="8080"
```

### apps/worker (Fly.io — set via `fly secrets set`)
```bash
fly secrets set \
  DATABASE_URL="postgresql://..." \
  UPSTASH_REDIS_REST_URL="https://..." \
  UPSTASH_REDIS_REST_TOKEN="xxx" \
  ENCRYPTION_KEY="xxxx...xxxx" \
  RESEND_API_KEY="re_xxx" \
  FROM_EMAIL="hello@tokonomics.dev" \
  SENTRY_DSN="https://xxx@sentry.io/xxx"
```

---

## 3. Dockerfiles

### apps/ingest/Dockerfile
```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/ingest/package.json ./apps/ingest/
COPY packages/ ./packages/
RUN yarn install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn workspace @tokonomics/ingest build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fastify
COPY --from=builder /app/apps/ingest/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER fastify
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:8080/ingest/v1/health || exit 1

CMD ["node", "dist/index.js"]
```

### apps/worker/Dockerfile
```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ ./packages/
RUN yarn install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn workspace @tokonomics/worker build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=10s \
  CMD wget -qO- http://localhost:8081/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## 4. Fly.io Configuration

### apps/ingest/fly.toml
```toml
app = "tokonomics-ingest"
primary_region = "sin"   # Singapore — closest to India, low latency to US too

[build]
  dockerfile = "apps/ingest/Dockerfile"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false   # Keep always-on for low-latency ingestion
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "requests"
    hard_limit = 200
    soft_limit = 150

[[vm]]
  size = "shared-cpu-1x"    # Free tier: 256MB RAM — sufficient for ingest at early stage
  memory = "256mb"

[checks]
  [checks.health]
    grace_period = "5s"
    interval = "10s"
    method = "get"
    path = "/ingest/v1/health"
    port = 8080
    timeout = "5s"
    type = "http"
```

### apps/worker/fly.toml
```toml
app = "tokonomics-worker"
primary_region = "sin"

[build]
  dockerfile = "apps/worker/Dockerfile"

[env]
  PORT = "8081"
  NODE_ENV = "production"

# Worker doesn't need HTTP traffic — runs as background process
# But we expose a health endpoint for monitoring
[http_service]
  internal_port = 8081
  force_https = false
  auto_stop_machines = false   # Worker must always be running (cron jobs)
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "shared-cpu-1x"    # Free tier: 256MB RAM
  memory = "256mb"

[checks]
  [checks.health]
    grace_period = "10s"
    interval = "30s"
    method = "get"
    path = "/health"
    port = 8081
    timeout = "10s"
    type = "http"
```

### Fly.io Initial Setup Commands
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create ingest app
cd apps/ingest
fly apps create tokonomics-ingest --org personal
fly secrets set DATABASE_URL="..." UPSTASH_REDIS_REST_URL="..." # etc.

# Create worker app  
cd apps/worker
fly apps create tokonomics-worker --org personal
fly secrets set DATABASE_URL="..." UPSTASH_REDIS_REST_URL="..." # etc.

# Deploy both (also done via GitHub Actions on main push)
fly deploy --config apps/ingest/fly.toml
fly deploy --config apps/worker/fly.toml
```

---

## 5. GitHub Actions Workflows

### `.github/workflows/ci.yml` — Run on every PR
```yaml
name: CI

on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main, staging]

env:
  NODE_VERSION: "20"

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "yarn"
      - run: yarn install --frozen-lockfile
      - run: yarn turbo run lint typecheck

  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "yarn"
      - run: yarn install --frozen-lockfile
      - run: yarn turbo run test:unit
      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: tokonomics_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/tokonomics_test
      DIRECT_URL: postgresql://postgres:postgres@localhost:5432/tokonomics_test
      REDIS_URL: redis://localhost:6379
      ENCRYPTION_KEY: ${{ secrets.TEST_ENCRYPTION_KEY }}
      CLERK_SECRET_KEY: ${{ secrets.TEST_CLERK_SECRET_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "yarn"
      - run: yarn install --frozen-lockfile
      - run: yarn workspace @tokonomics/db prisma migrate deploy
      - run: yarn workspace @tokonomics/db prisma db seed
      - run: yarn turbo run test:integration

  docker-build:
    name: Docker Build Check
    runs-on: ubuntu-latest
    needs: integration-tests
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Build ingest image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/ingest/Dockerfile
          push: false
          tags: tokonomics/ingest:test
      - name: Build worker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/worker/Dockerfile
          push: false
          tags: tokonomics/worker:test
```

### `.github/workflows/deploy-production.yml`
```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy Production
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Run DB Migrations
        env:
          DIRECT_URL: ${{ secrets.PROD_DIRECT_URL }}
        run: |
          yarn install --frozen-lockfile
          yarn workspace @tokonomics/db prisma migrate deploy

      # Vercel auto-deploys on push to main via GitHub integration
      # No manual step needed — connected in Vercel dashboard

      - name: Deploy Ingest to Fly.io
        uses: superfly/flyctl-actions/setup-flyctl@master
      - run: fly deploy --config apps/ingest/fly.toml --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Deploy Worker to Fly.io
        run: fly deploy --config apps/worker/fly.toml --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

      - name: Notify Slack
        if: success()
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: '{"text":"✅ Tokonomics production deploy complete: ${{ github.sha }}"}'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.DEPLOY_SLACK_WEBHOOK }}
```

### `.github/workflows/supabase-keepalive.yml` — Prevent free tier pause
```yaml
name: Supabase Keep-Alive

on:
  schedule:
    - cron: "0 12 */4 * *"   # Every 4 days at noon UTC — well within the 7-day pause window

jobs:
  ping:
    name: Ping Supabase
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase project URL
        run: |
          curl -f "${{ secrets.SUPABASE_PROJECT_URL }}/rest/v1/" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            --max-time 10
          echo "Supabase keep-alive ping successful"

# NOTE: Delete this workflow file when upgrading to Supabase Pro.
# It is only needed on the free tier to prevent project pause.
# Upgrade trigger: first paying customer arrives.
```

### `.github/workflows/weekly-load-test.yml`
```yaml
name: Weekly Load Test

on:
  schedule:
    - cron: "0 2 * * 1"  # Monday 2am UTC

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - run: |
          k6 run apps/ingest/__tests__/load/ingest-load.js \
            --env INGEST_URL=${{ secrets.STAGING_INGEST_URL }} \
            --env SDK_KEY=${{ secrets.TEST_SDK_KEY }} \
            --out json=results.json
      - uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: results.json
```

---

## 6. Vercel Configuration

### apps/web/vercel.json
```json
{
  "framework": "nextjs",
  "regions": ["sin1", "iad1"],
  "functions": {
    "app/api/**": {
      "maxDuration": 30
    },
    "app/api/webhooks/**": {
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" }
      ]
    }
  ]
}
```

**Vercel setup steps:**
1. Connect GitHub repo to Vercel Pro account
2. Set root directory to `apps/web`
3. Add all environment variables from §2 above in Vercel dashboard
4. Add custom domain `app.tokonomics.dev` in Vercel dashboard
5. Vercel auto-deploys on every push to `main`

---

## 7. Database Migration Strategy

```bash
# Development (runs against local or Supabase free DB)
yarn prisma migrate dev --name "add_margin_score"

# Production — runs in GitHub Actions before Vercel/Fly.io deploy
# Uses DIRECT_URL (bypasses pgBouncer — required for DDL migrations)
yarn prisma migrate deploy

# Emergency rollback
yarn prisma migrate resolve --rolled-back "20260618_migration_name"
```

**Migration rules:**
1. Never use `migrate reset` on staging or prod
2. All migrations must be backward-compatible
3. Dropping columns: 2-step process (stop reading → deploy → drop in next PR)
4. Always test migration against a Supabase free project copy first

---

## 8. Infrastructure Upgrade Triggers

| Trigger | Action | New Monthly Cost |
|---|---|---|
| **First paying customer** | Upgrade Supabase to Pro | +$25 → **$45/month total** |
| Ingest > 1000 RPS sustained | Scale Fly.io ingest VM up | +$5–15 → **$50–60/month** |
| Worker needs more memory | Scale Fly.io worker VM up | +$5 → **$50–65/month** |
| >3K emails/month | Upgrade Resend to paid | +$20 |
| Team member joins | No change until >50K MAU on Clerk | $0 |

---

## 9. Monitoring & Alerting

```yaml
Sentry (free tier — 5K errors/month):
  - All three services (web, ingest, worker)
  - Error rate > 1% → email alert

Vercel Analytics (included in Pro):
  - LCP, CLS, FID per page

Fly.io built-in metrics:
  - CPU, RAM, request count per machine
  - Available in Fly.io dashboard

PostHog (free — 1M events/month):
  - Product analytics: provider_connected, sdk_key_created, first_customer_tracked

UptimeRobot (free — 50 monitors):
  - https://app.tokonomics.dev → every 5 minutes
  - https://ingest.tokonomics.dev/ingest/v1/health → every 1 minute
  - Alert on 2 consecutive failures → email
```

---

## 10. Secrets Management

| Secret | Stored In | Notes |
|---|---|---|
| Web env vars | Vercel dashboard (Environment Variables) | Encrypted at rest by Vercel |
| Ingest/Worker secrets | `fly secrets set` → Fly.io Vault | Encrypted at rest by Fly |
| ENCRYPTION_KEY | Vercel + Fly.io (same value) | Never rotate — backs all stored provider keys |
| TEST_ENCRYPTION_KEY | GitHub Actions Secret | Different value from prod — test environments only |
| FLY_API_TOKEN | GitHub Actions Secret | For CI deployment to Fly.io |
| PROD_DIRECT_URL | GitHub Actions Secret | Supabase direct URL for migration-only |
