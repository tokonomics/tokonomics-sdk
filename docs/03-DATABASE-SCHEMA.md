# Tokonomics — Database Schema & Data Models
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Database:** PostgreSQL 16 with TimescaleDB extension  
**ORM:** Prisma 5  

---

## 1. Schema Design Principles

1. **All tables have `created_at` and `updated_at` timestamps** (managed by Prisma)
2. **All IDs are CUID2** (`cuid()` in Prisma) for URL-safe, sortable IDs
3. **Multi-tenancy enforced via `org_id` foreign key** on every tenant-scoped table
4. **`usage_events` is partitioned by `created_at` month** for query performance
5. **Sensitive fields encrypted at application layer** before DB insert
6. **Soft delete** pattern used where data recovery matters (organizations, customers)
7. **Row Level Security** enabled as defense-in-depth (see Architecture doc)

---

## 2. Complete Prisma Schema

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // For migrations only (bypasses PgBouncer)
}

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY & AUTH
// ─────────────────────────────────────────────────────────────────────────────

model User {
  id          String   @id @default(cuid())
  clerkId     String   @unique @map("clerk_id")
  email       String   @unique
  name        String?
  avatarUrl   String?  @map("avatar_url")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  memberships Membership[]

  @@map("users")
}

model Organization {
  id          String    @id @default(cuid())
  clerkOrgId  String?   @unique @map("clerk_org_id") // null for solo founders
  name        String
  slug        String    @unique
  logoUrl     String?   @map("logo_url")
  plan        PlanTier  @default(FREE)
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  memberships           Membership[]
  providerConnections   ProviderConnection[]
  stripeConnection      StripeConnection?
  slackConnection       SlackConnection?
  sdkApiKeys            SdkApiKey[]
  customers             Customer[]
  usageEvents           UsageEvent[]
  budgetRules           BudgetRule[]
  alerts                Alert[]
  modelRoutingTests     ModelRoutingTest[]
  pricingSimulations    PricingSimulation[]
  subscription          Subscription?
  marginRules           MarginFloorRule[]
  weeklyDigestSettings  WeeklyDigestSettings?

  @@map("organizations")
}

model Membership {
  id        String     @id @default(cuid())
  userId    String     @map("user_id")
  orgId     String     @map("org_id")
  role      OrgRole    @default(VIEWER)
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([userId, orgId])
  @@map("memberships")
}

enum OrgRole {
  OWNER
  ADMIN
  VIEWER
}

enum PlanTier {
  FREE
  STARTER
  GROWTH
  SCALE
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING
// ─────────────────────────────────────────────────────────────────────────────

model Subscription {
  id                   String             @id @default(cuid())
  orgId                String             @unique @map("org_id")
  stripeCustomerId     String?            @unique @map("stripe_customer_id")
  stripeSubscriptionId String?            @unique @map("stripe_subscription_id")
  stripePriceId        String?            @map("stripe_price_id")
  plan                 PlanTier           @default(FREE)
  status               SubscriptionStatus @default(ACTIVE)
  currentPeriodStart   DateTime?          @map("current_period_start")
  currentPeriodEnd     DateTime?          @map("current_period_end")
  cancelAtPeriodEnd    Boolean            @default(false) @map("cancel_at_period_end")
  trialEndsAt          DateTime?          @map("trial_ends_at")
  createdAt            DateTime           @default(now()) @map("created_at")
  updatedAt            DateTime           @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@map("subscriptions")
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  UNPAID
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER CONNECTIONS (LLM API Keys)
// ─────────────────────────────────────────────────────────────────────────────

model ProviderConnection {
  id              String          @id @default(cuid())
  orgId           String          @map("org_id")
  provider        LlmProvider
  displayName     String          @map("display_name")       // "OpenAI (Production)"
  encryptedKey    String          @map("encrypted_key")      // AES-256-GCM encrypted
  keyIv           String          @map("key_iv")             // Initialization vector
  keyAuthTag      String          @map("key_auth_tag")       // GCM auth tag
  keyLastFour     String          @map("key_last_four")      // Last 4 chars of original key
  status          ConnectionStatus @default(CONNECTED)
  lastSyncedAt    DateTime?       @map("last_synced_at")
  lastSyncError   String?         @map("last_sync_error")
  lastSpendUsd    Decimal?        @db.Decimal(12, 6) @map("last_spend_usd")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  org                  Organization          @relation(fields: [orgId], references: [id], onDelete: Cascade)
  providerUsageRecords ProviderUsageRecord[]

  @@unique([orgId, provider, displayName])
  @@map("provider_connections")
}

enum LlmProvider {
  OPENAI
  ANTHROPIC
  GOOGLE
}

enum ConnectionStatus {
  CONNECTED
  ERROR
  DISCONNECTED
}

// Raw spend data pulled from provider APIs
model ProviderUsageRecord {
  id              String   @id @default(cuid())
  connectionId    String   @map("connection_id")
  orgId           String   @map("org_id")
  date            DateTime @db.Date // The calendar date this spend occurred
  modelId         String   @map("model_id")        // "gpt-4o", "claude-3-5-sonnet-20241022"
  inputTokens     BigInt   @map("input_tokens")
  outputTokens    BigInt   @map("output_tokens")
  totalTokens     BigInt   @map("total_tokens")
  costUsd         Decimal  @db.Decimal(12, 6) @map("cost_usd")
  requestCount    Int      @map("request_count")
  rawResponse     Json?    @map("raw_response")    // Original provider response for debugging
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  connection ProviderConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, date, modelId])
  @@index([orgId, date])
  @@index([connectionId, date])
  @@map("provider_usage_records")
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK API KEYS
// ─────────────────────────────────────────────────────────────────────────────

model SdkApiKey {
  id          String    @id @default(cuid())
  orgId       String    @map("org_id")
  name        String    // "Production", "Staging"
  keyHash     String    @unique @map("key_hash")    // bcrypt hash
  keyPrefix   String    @map("key_prefix")          // "tok_live_" + first 8 chars
  lastUsedAt  DateTime? @map("last_used_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@map("sdk_api_keys")
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────────────────────────────────────

model Customer {
  id              String    @id @default(cuid())
  orgId           String    @map("org_id")
  externalId      String    @map("external_id")    // customer_id from SDK events
  displayName     String?   @map("display_name")
  email           String?
  manualMrr       Decimal?  @db.Decimal(12, 2) @map("manual_mrr") // Manual revenue override
  stripeMatchId   String?   @map("stripe_match_id") // Linked Stripe customer ID
  tags            String[]  @default([])
  deletedAt       DateTime? @map("deleted_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  org                     Organization               @relation(fields: [orgId], references: [id], onDelete: Cascade)
  usageEvents             UsageEvent[]
  dailyAggregates         DailyCustomerAggregate[]
  marginSnapshots         CustomerMarginSnapshot[]
  budgetRules             BudgetRule[]
  alerts                  Alert[]

  @@unique([orgId, externalId])
  @@index([orgId])
  @@index([orgId, email])
  @@map("customers")
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE EVENTS (High-Volume, Partitioned)
// ─────────────────────────────────────────────────────────────────────────────

// IMPORTANT: This table MUST be partitioned by created_at in raw SQL migration
// CREATE TABLE usage_events (...) PARTITION BY RANGE (created_at);
// Prisma cannot manage partitioned table parents directly — use raw SQL migration.

model UsageEvent {
  id           String      @id @default(cuid())
  orgId        String      @map("org_id")
  customerId   String?     @map("customer_id")       // FK to customers.id (resolved from external_id)
  externalCustomerId String @map("external_customer_id") // Raw customer_id from SDK
  feature      String?                               // "chat", "search", "summarize"
  workflow     String?                               // "agent-loop", "rag-pipeline"
  model        String                                // "gpt-4o", "claude-3-5-sonnet-20241022"
  provider     LlmProvider
  inputTokens  Int         @map("input_tokens")
  outputTokens Int         @map("output_tokens")
  costUsd      Decimal     @db.Decimal(12, 6) @map("cost_usd") // Calculated server-side
  latencyMs    Int?        @map("latency_ms")
  sdkVersion   String?     @map("sdk_version")
  idempotencyKey String?   @unique @map("idempotency_key") // Prevent duplicate events
  createdAt    DateTime    @default(now()) @map("created_at")

  org      Organization @relation(fields: [orgId], references: [id])
  customer Customer?    @relation(fields: [customerId], references: [id])

  // NOTE: Additional indexes created in raw SQL migration for partition support
  @@index([orgId, createdAt])
  @@index([orgId, externalCustomerId, createdAt])
  @@index([orgId, feature, createdAt])
  @@map("usage_events")
}

// Pre-aggregated daily stats per customer per org (computed by worker)
model DailyCustomerAggregate {
  id            String   @id @default(cuid())
  orgId         String   @map("org_id")
  customerId    String   @map("customer_id")
  date          DateTime @db.Date
  totalCostUsd  Decimal  @db.Decimal(12, 6) @map("total_cost_usd")
  inputTokens   BigInt   @map("input_tokens")
  outputTokens  BigInt   @map("output_tokens")
  requestCount  Int      @map("request_count")
  modelBreakdown Json    @map("model_breakdown") // {model: {cost, calls}}
  featureBreakdown Json  @map("feature_breakdown") // {feature: {cost, calls}}
  updatedAt     DateTime @updatedAt @map("updated_at")

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([orgId, customerId, date])
  @@index([orgId, date])
  @@map("daily_customer_aggregates")
}

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

model StripeConnection {
  id                 String    @id @default(cuid())
  orgId              String    @unique @map("org_id")
  stripeAccountId    String    @map("stripe_account_id")
  encryptedToken     String    @map("encrypted_token")   // Encrypted access_token
  tokenIv            String    @map("token_iv")
  tokenAuthTag       String    @map("token_auth_tag")
  scope              String                              // "read_only"
  lastSyncedAt       DateTime? @map("last_synced_at")
  status             ConnectionStatus @default(CONNECTED)
  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  org             Organization    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  stripeCustomers StripeCustomer[]

  @@map("stripe_connections")
}

model StripeCustomer {
  id               String   @id @default(cuid())
  connectionId     String   @map("connection_id")
  orgId            String   @map("org_id")
  stripeCustomerId String   @map("stripe_customer_id")
  email            String?
  name             String?
  mrrCents         Int      @map("mrr_cents")          // Monthly recurring revenue in cents
  planName         String?  @map("plan_name")
  status           String                              // "active", "canceled", etc.
  matchedCustomerId String? @map("matched_customer_id") // FK to customers.id when matched
  lastSyncedAt     DateTime @map("last_synced_at")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  connection StripeConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([connectionId, stripeCustomerId])
  @@index([orgId, email])
  @@index([orgId, matchedCustomerId])
  @@map("stripe_customers")
}

// ─────────────────────────────────────────────────────────────────────────────
// MARGIN
// ─────────────────────────────────────────────────────────────────────────────

model CustomerMarginSnapshot {
  id              String   @id @default(cuid())
  orgId           String   @map("org_id")
  customerId      String   @map("customer_id")
  date            DateTime @db.Date
  mrrCents        Int      @map("mrr_cents")
  llmCostUsd      Decimal  @db.Decimal(12, 6) @map("llm_cost_usd")
  grossMarginPct  Decimal  @db.Decimal(7, 4) @map("gross_margin_pct")  // e.g. 97.9432
  status          MarginStatus
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([orgId, customerId, date])
  @@index([orgId, date])
  @@map("customer_margin_snapshots")
}

enum MarginStatus {
  HEALTHY      // margin >= floor + 15%
  WATCH        // margin < floor + 15% but >= floor
  UNPROFITABLE // margin < floor
  LOSING_MONEY // margin < 0
}

// Daily org-level AI Margin Score
model OrgMarginScore {
  id            String   @id @default(cuid())
  orgId         String   @map("org_id")
  date          DateTime @db.Date
  score         Int                           // 0-100
  baseScore     Int      @map("base_score")
  concentration Int                           // penalty
  wasteScore    Int      @map("waste_score")
  pricingFit    Int      @map("pricing_fit")
  trendBonus    Int      @map("trend_bonus")
  components    Json                          // detailed breakdown for display
  createdAt     DateTime @default(now()) @map("created_at")

  @@unique([orgId, date])
  @@index([orgId])
  @@map("org_margin_scores")
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS & BUDGET RULES
// ─────────────────────────────────────────────────────────────────────────────

model BudgetRule {
  id            String       @id @default(cuid())
  orgId         String       @map("org_id")
  customerId    String?      @map("customer_id")    // null = applies to all customers
  feature       String?                             // null = applies to all features
  ruleType      BudgetPeriod @map("rule_type")
  limitUsd      Decimal      @db.Decimal(12, 6) @map("limit_usd")
  alertAtPct    Int          @default(80) @map("alert_at_pct") // Alert at 80% of limit
  circuitBreak  Boolean      @default(false) @map("circuit_break") // Hard stop at limit
  isActive      Boolean      @default(true) @map("is_active")
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  org      Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  customer Customer?    @relation(fields: [customerId], references: [id])

  @@index([orgId])
  @@index([orgId, customerId])
  @@map("budget_rules")
}

enum BudgetPeriod {
  DAILY
  MONTHLY
}

model Alert {
  id           String      @id @default(cuid())
  orgId        String      @map("org_id")
  customerId   String?     @map("customer_id")
  alertType    AlertType   @map("alert_type")
  severity     AlertSeverity
  title        String
  body         String      @db.Text
  metadata     Json        @default("{}")        // {currentValue, threshold, model, etc.}
  isRead       Boolean     @default(false) @map("is_read")
  resolvedAt   DateTime?   @map("resolved_at")
  notifiedVia  String[]    @map("notified_via") // ["email", "slack"]
  createdAt    DateTime    @default(now()) @map("created_at")

  org      Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  customer Customer?    @relation(fields: [customerId], references: [id])

  @@index([orgId, isRead])
  @@index([orgId, createdAt])
  @@map("alerts")
}

enum AlertType {
  SPEND_SPIKE          // Daily spend > N× 7-day avg
  BUDGET_THRESHOLD     // Customer or feature hit X% of budget
  BUDGET_BREACHED      // Circuit breaker triggered
  MARGIN_FLOOR         // Customer margin below configured floor
  CUSTOMER_UNPROFITABLE // Customer margin < 0
  PROVIDER_SYNC_ERROR  // API key invalid or provider error
  STRIPE_SYNC_ERROR
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}

model MarginFloorRule {
  id          String   @id @default(cuid())
  orgId       String   @map("org_id")
  floorPct    Decimal  @db.Decimal(5, 2) @map("floor_pct") // e.g. 60.00
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId])
  @@map("margin_floor_rules")
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL ROUTING TESTS
// ─────────────────────────────────────────────────────────────────────────────

model ModelRoutingTest {
  id              String      @id @default(cuid())
  orgId           String      @map("org_id")
  name            String
  feature         String?
  controlModel    String      @map("control_model")    // "gpt-4o"
  treatmentModel  String      @map("treatment_model")  // "claude-haiku-3-5"
  status          TestStatus  @default(DRAFT)
  startedAt       DateTime?   @map("started_at")
  endedAt         DateTime?   @map("ended_at")
  results         Json?                               // {controlCost, treatmentCost, savings, qualityScore}
  recommendation  String?     @db.Text               // AI-generated recommendation
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@map("model_routing_tests")
}

enum TestStatus {
  DRAFT
  RUNNING
  COMPLETED
  CANCELED
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING SIMULATOR
// ─────────────────────────────────────────────────────────────────────────────

model PricingSimulation {
  id          String   @id @default(cuid())
  orgId       String   @map("org_id")
  name        String
  config      Json     // {mode: "usage_based"|"flat", tiers: [...], fairUseLimitTokens}
  results     Json     // {projectedMrr, projectedMargin, customerImpact: [...]}
  savedAt     DateTime @default(now()) @map("saved_at")
  createdAt   DateTime @default(now()) @map("created_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId])
  @@map("pricing_simulations")
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS & INTEGRATIONS
// ─────────────────────────────────────────────────────────────────────────────

model SlackConnection {
  id              String   @id @default(cuid())
  orgId           String   @unique @map("org_id")
  webhookUrl      String   @map("webhook_url")     // Encrypted
  webhookIv       String   @map("webhook_iv")
  webhookAuthTag  String   @map("webhook_auth_tag")
  channelName     String?  @map("channel_name")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@map("slack_connections")
}

model WeeklyDigestSettings {
  id              String   @id @default(cuid())
  orgId           String   @unique @map("org_id")
  isEnabled       Boolean  @default(true) @map("is_enabled")
  sendEmail       Boolean  @default(true) @map("send_email")
  sendSlack       Boolean  @default(true) @map("send_slack")
  recipientEmails String[] @map("recipient_emails")
  lastSentAt      DateTime? @map("last_sent_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@map("weekly_digest_settings")
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL PRICING TABLE (internal reference, updated by team)
// ─────────────────────────────────────────────────────────────────────────────

model ModelPricing {
  id                String      @id @default(cuid())
  provider          LlmProvider
  modelId           String      @map("model_id")       // "gpt-4o"
  modelDisplayName  String      @map("model_display_name")
  inputCostPer1M    Decimal     @db.Decimal(12, 6) @map("input_cost_per_1m")  // per 1M input tokens
  outputCostPer1M   Decimal     @db.Decimal(12, 6) @map("output_cost_per_1m") // per 1M output tokens
  isActive          Boolean     @default(true) @map("is_active")
  effectiveFrom     DateTime    @map("effective_from")
  effectiveTo       DateTime?   @map("effective_to")
  createdAt         DateTime    @default(now()) @map("created_at")

  @@unique([provider, modelId, effectiveFrom])
  @@index([provider, modelId, isActive])
  @@map("model_pricing")
}
```

---

## 3. Raw SQL Migrations

### 3.1 Partition usage_events by month
```sql
-- Run AFTER Prisma creates the base table

-- Convert to partitioned table (requires data migration if existing data)
ALTER TABLE usage_events RENAME TO usage_events_old;

CREATE TABLE usage_events (
  id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  customer_id TEXT,
  external_customer_id TEXT NOT NULL,
  feature TEXT,
  workflow TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd NUMERIC(12, 6) NOT NULL,
  latency_ms INTEGER,
  sdk_version TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (automate with a cron in worker)
CREATE TABLE usage_events_2026_06 
  PARTITION OF usage_events 
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE usage_events_2026_07 
  PARTITION OF usage_events 
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Index on each partition
CREATE INDEX idx_usage_events_org_created 
  ON usage_events (org_id, created_at DESC);
  
CREATE INDEX idx_usage_events_org_customer 
  ON usage_events (org_id, external_customer_id, created_at DESC);
```

### 3.2 Row Level Security
```sql
-- Enable RLS
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_customer_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create policies (requires setting app.org_id in session)
CREATE POLICY org_isolation ON usage_events
  USING (org_id = current_setting('app.org_id', true));
  
-- Set org_id in all DB connections (middleware)
-- SET LOCAL app.org_id = 'clxxx...';
```

### 3.3 Materialized Views for Dashboard
```sql
-- Organization 30-day spend summary (refreshed every 5 min by worker)
CREATE MATERIALIZED VIEW org_spend_summary AS
SELECT 
  org_id,
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost_usd,
  SUM(input_tokens) as input_tokens,
  SUM(output_tokens) as output_tokens,
  COUNT(*) as request_count,
  jsonb_object_agg(model, model_cost) as model_breakdown
FROM usage_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY org_id, DATE(created_at);

CREATE UNIQUE INDEX ON org_spend_summary (org_id, date);

-- Refresh command (run by worker every 5 minutes)
REFRESH MATERIALIZED VIEW CONCURRENTLY org_spend_summary;
```

---

## 4. Model Pricing Reference Data

Initial seed data for `model_pricing` table:

| Provider | Model ID | Input Cost /1M | Output Cost /1M |
|---|---|---|---|
| OPENAI | gpt-4o | $2.50 | $10.00 |
| OPENAI | gpt-4o-mini | $0.15 | $0.60 |
| OPENAI | gpt-4-turbo | $10.00 | $30.00 |
| OPENAI | gpt-3.5-turbo | $0.50 | $1.50 |
| ANTHROPIC | claude-3-5-sonnet-20241022 | $3.00 | $15.00 |
| ANTHROPIC | claude-3-5-haiku-20241022 | $0.80 | $4.00 |
| ANTHROPIC | claude-3-opus-20240229 | $15.00 | $75.00 |
| GOOGLE | gemini-1.5-pro | $1.25 | $5.00 |
| GOOGLE | gemini-1.5-flash | $0.075 | $0.30 |
| GOOGLE | gemini-2.0-flash | $0.10 | $0.40 |

---

## 5. Index Strategy

Performance-critical queries and their indexes:

| Query Pattern | Index |
|---|---|
| Daily spend for org (charts) | `(org_id, created_at DESC)` on usage_events |
| Customer cost table sort by cost | `(org_id, date)` on daily_customer_aggregates |
| Recent alerts for org | `(org_id, created_at DESC)` on alerts |
| Provider usage by date range | `(connection_id, date)` on provider_usage_records |
| SDK key lookup | `(key_hash)` UNIQUE on sdk_api_keys |
| Customer lookup by external_id | `(org_id, external_id)` UNIQUE on customers |
| Margin snapshot history | `(org_id, date DESC)` on customer_margin_snapshots |
