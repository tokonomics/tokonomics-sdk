# Tokonomics — Agent Instructions & Ruleset
**For:** Claude Code (and any AI coding agent)  
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Status:** BINDING — These rules are not suggestions. Follow all of them.

---

## 1. Source of Truth Hierarchy

When in doubt about what to build, consult documents in this priority order:

1. `07-EXECUTION-PLAN.md` — What to build next and in what order
2. `01-PRD.md` — What features exist and what is out of scope
3. `02-ARCHITECTURE.md` — How to structure the code
4. `03-DATABASE-SCHEMA.md` — Exact database shape
5. `04-API-SPECIFICATION.md` — Exact API contract
6. `05-TEST-PLAN.md` — How to test it
7. `06-CICD-DEPLOYMENT.md` — How to deploy it

**Never deviate from these documents without explicit instruction from the human.**  
If you believe a document has an error, flag it in a comment and continue — don't silently override.

---

## 2. Before Writing Any Code

Complete this checklist before touching a file:

```
□ I know which Phase of the Execution Plan I am in
□ I know which specific step (e.g. "2.3 Fastify Ingestion Service") I am building
□ I have read the relevant sections of PRD, Architecture, and API Spec
□ I have read any existing code in the files I will modify
□ I have the test cases I need to write BEFORE implementing
□ I understand the database tables I will read/write
□ I know which plan tier gates this feature (FREE/STARTER/GROWTH/SCALE)
```

Do not skip this checklist. Writing code without reading the spec produces drift.

---

## 3. Code Quality Rules

### 3.1 TypeScript
- **ALWAYS use strict TypeScript.** `any` is forbidden unless inside a `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining why.
- All function parameters and return types must be explicitly typed.
- Use `zod` for all runtime validation. Never trust unvalidated external input.
- Prefer `type` over `interface` for data shapes. Use `interface` only for class contracts.
- Use `satisfies` operator to verify literal objects match types without widening.

```typescript
// ❌ BAD
const handler = async (req: any, res: any) => { ... }

// ✅ GOOD
const handler = async (req: Request): Promise<Response> => { ... }
```

### 3.2 Database Access
- **EVERY database query must include `orgId` as a filter.**  
  This is the multi-tenancy isolation guarantee. Missing this is a security bug.
  
```typescript
// ❌ SECURITY BUG — missing orgId
const customer = await prisma.customer.findFirst({
  where: { externalId: params.customerId }
});

// ✅ CORRECT — always include orgId
const customer = await prisma.customer.findFirst({
  where: { externalId: params.customerId, orgId: ctx.orgId }
});
```

- Never use `findFirst` where `findUnique` is semantically correct.
- Use `select` to limit columns returned (never fetch encrypted fields unless needed).
- Use Prisma transactions for multi-step writes.
- Never run `prisma migrate dev` in CI — use `prisma migrate deploy` only.

### 3.3 API Security
- All dashboard routes must call `await auth()` from Clerk and check `userId` and `orgId`.
- All routes must return errors in the standard envelope format (see API Spec §2).
- Plan gates must be checked via a reusable `requirePlan(tier)` middleware, not inline.
- Never return decrypted API keys to the frontend. Ever.

```typescript
// ❌ BAD — leaks decrypted key
return { apiKey: decryptApiKey(connection.encryptedKey) };

// ✅ CORRECT — only return metadata
return { keyLastFour: connection.keyLastFour, status: connection.status };
```

### 3.4 Encryption
- Only use the `encryptApiKey` / `decryptApiKey` functions from `packages/shared/src/encryption.ts`.
- Never write encryption logic inline. Never use a different encryption scheme.
- Never log decrypted keys. Use `keyLastFour` for logging.

### 3.5 Cost Calculation
- **ALWAYS calculate `cost_usd` server-side** using `packages/shared/src/pricing/model-costs.ts`.
- Never trust client-provided cost values.
- Always use `Decimal` type for monetary values, never `number` (floating point errors).
- Use Prisma's `Decimal` field type for DB storage.

```typescript
// ❌ BAD — trusting client cost
const event = { costUsd: req.body.costUsd };  

// ✅ CORRECT — calculate server-side
const event = { costUsd: calculateEventCost({ model, provider, inputTokens, outputTokens }) };
```

### 3.6 Error Handling
- All async functions must have try/catch.
- All API route handlers must return appropriate HTTP status codes (see API Spec §2).
- Log errors with context to Sentry AND return safe error messages to client (no stack traces).
- Background jobs must catch errors per-item and continue (never let one bad org fail all orgs).

```typescript
// ✅ Correct background job pattern
for (const org of orgs) {
  try {
    await syncOrgProvider(org);
  } catch (error) {
    logger.error({ orgId: org.id, error }, "Provider sync failed");
    Sentry.captureException(error, { extra: { orgId: org.id } });
    // Continue to next org
  }
}
```

---

## 4. Testing Rules

### 4.1 Test-First for Business Logic
The following modules MUST have tests written BEFORE the implementation:
- `packages/shared/src/encryption.ts`
- `packages/shared/src/pricing/model-costs.ts`
- Any margin calculation function
- Any alert checking function
- Any budget rule evaluation

**Workflow:**
1. Write failing test
2. Run test (confirm it fails)
3. Write minimal implementation
4. Run test (confirm it passes)
5. Refactor if needed

### 4.2 Integration Tests for API Routes
Every new API route needs an integration test that:
- Tests the happy path
- Tests authentication (returns 401 without auth)
- Tests plan gating (returns 402 if wrong plan)
- Tests validation (returns 400 for bad input)

### 4.3 Coverage Gates
- New code must maintain ≥ 85% line coverage.
- Business logic (calculations, rules) must maintain ≥ 100%.
- `yarn test:coverage` must pass before marking any phase complete.

### 4.4 Test Data Factories
Create factory functions, not inline object literals:
```typescript
// packages/db/test/factories.ts
export async function createTestOrg(overrides = {}) {
  return prisma.organization.create({
    data: { name: "Test Org", slug: `test-${cuid()}`, plan: "FREE", ...overrides }
  });
}
```

---

## 5. Architecture Rules

### 5.1 Folder Placement
- Dashboard UI: `apps/web/app/(dashboard)/`
- API routes: `apps/web/app/api/` (following Next.js App Router convention)
- Reusable components: `apps/web/components/`
- Business logic (non-UI): `apps/web/lib/` or `packages/shared/`
- DB access: ONLY via `packages/db` Prisma client
- BullMQ jobs: `apps/worker/src/jobs/`
- Fastify routes: `apps/ingest/src/routes/`

**Never put business logic in UI components.** Extract to `lib/` or `packages/shared/`.

### 5.2 No Direct DB Access from Ingest Service
The ingest service writes directly to the DB (for performance). This is the ONLY exception.  
All other services (web, worker) access DB via Prisma client in `packages/db`.

### 5.3 No Circular Dependencies
- `packages/shared` → no dependencies on apps
- `packages/db` → depends on `packages/shared` only
- `apps/web` → depends on `packages/db` + `packages/shared`
- `apps/ingest` → depends on `packages/shared` only (own DB connection)
- `apps/worker` → depends on `packages/db` + `packages/shared`

### 5.4 Environment Variables
- Never hardcode values that should be env vars.
- All env vars used in `apps/web` must be in `apps/web/.env.local` (dev) and Vercel (prod).
- `NEXT_PUBLIC_` prefix only for values safe to expose to browsers.
- Never prefix secrets with `NEXT_PUBLIC_`.

### 5.5 Feature Flags via Plan Tier
Do not use separate feature flag systems. Plan tier IS the feature gate.
```typescript
// In route handler
const org = await getOrgWithPlan(orgId);
if (!meetsMinPlan(org.plan, "STARTER")) {
  return planRequiredResponse("STARTER");
}
```

---

## 6. Scope Rules (Anti-Scope-Creep)

### 6.1 Features That Are Explicitly OUT OF SCOPE — Never Build These
```
❌ Prompt content capture or storage
❌ LLM proxy / middleware (OpenAI-compatible proxy mode)
❌ Real-time streaming cost tracking
❌ Infrastructure cost monitoring (AWS/GCP/Azure)
❌ Mobile app
❌ Self-hosted mode
❌ Custom model fine-tuning
❌ Multi-cloud cost
❌ Social features
❌ In-app chat support
```

If the human asks for one of these, flag it as out of scope and ask for confirmation before proceeding.

### 6.2 Stay in Current Phase
Only build the features for the current phase. Do not skip ahead.  
If you finish a phase early, confirm with the human before starting the next phase.

### 6.3 No Gold-Plating
- Don't add animations, transitions, or UI polish not asked for.
- Don't add configuration options not in the spec.
- Don't add API endpoints not in the API spec.
- Don't add database columns not in the schema.

---

## 7. SDK Rules

### 7.1 Privacy Is Non-Negotiable
The SDK must NEVER collect or transmit:
- Prompt text / messages content
- Completion text / response content
- User PII beyond what is explicitly passed as `customer_id`
- IP addresses
- Request metadata beyond token counts and latency

**Test for this explicitly.** See test plan §7.

### 7.2 Non-Blocking Design
The SDK wraps LLM calls. If the Tokonomics ingestion endpoint is unavailable:
- The underlying LLM call must still succeed
- The tracking event should be queued locally (in-memory queue, max 1000 events)
- Retry sending events with exponential backoff
- If queue fills: drop oldest events, log warning

Never let SDK failures propagate to the customer's application.

### 7.3 SDK Versioning
- SDK follows semver strictly
- Breaking changes require major version bump
- All SDK API contracts match the ingestion API spec exactly

---

## 8. UI/UX Rules

### 8.1 Design System
- Use shadcn/ui components as primitives. Do not build custom primitives that duplicate shadcn.
- Color tokens defined in `tailwind.config.ts`. Never use arbitrary color values in components.
- Dark mode support from day one (Clerk and shadcn both support it).

### 8.2 Empty States
Every data view must have an empty state with a CTA.
```
Customer table empty state: "No customers tracked yet. Add the SDK to your app."
Spend overview empty state: "Connect a provider API key to see your spend."
```

### 8.3 Loading States
Every async data fetch must show a skeleton loader, not a spinner (better perceived performance).

### 8.4 Error States
Every data view must handle error state gracefully with a retry button.

### 8.5 Responsive Design
Dashboard must work on screens ≥ 1024px. Mobile is not a priority for v1 but must not be broken.

---

## 9. Git Workflow

```bash
# Branch naming
feature/phase-1-provider-connections
feature/phase-2-ingest-service
fix/margin-calculation-edge-case
chore/update-model-pricing-table

# Commit format (Conventional Commits)
feat(providers): add Anthropic API key validation
fix(ingest): handle duplicate idempotency keys correctly
test(margin): add edge case for zero-revenue customer
chore(db): add index on usage_events org_id + created_at
docs(api): update POST /providers response schema

# PR requirements
- All CI checks pass (lint, typecheck, unit tests, integration tests)
- No new `any` types introduced
- Coverage maintained
- Description references which phase/step from execution plan
```

---

## 10. Performance Rules

### 10.1 Database
- All queries against large tables (`usage_events`, `provider_usage_records`) must use indexed columns.
- Never do `SELECT *` — always specify columns.
- Aggregation over large ranges must use pre-computed aggregates (`daily_customer_aggregates`), not raw `usage_events`.
- Never run N+1 queries. Use Prisma `include` or batch queries.

```typescript
// ❌ N+1
const customers = await getCustomers();
for (const c of customers) {
  c.cost = await getCustomerCost(c.id); // N DB calls!
}

// ✅ Single query with aggregation
const customersWithCost = await getCustomersWithCost(); // 1 DB call
```

### 10.2 Caching
- All dashboard queries must check Redis cache before hitting DB.
- Cache keys follow the pattern defined in Architecture doc §8.
- Cache invalidation: on any write that changes the data, delete the cache key.

### 10.3 Ingest Service
- Target: ≤ 200ms p99 for ingest endpoint.
- Batch DB writes (pg COPY or Prisma createMany) for batch ingestion.
- SDK key validation uses Redis (not DB) as primary lookup.

---

## 11. How to Handle Ambiguity

When a spec is unclear, follow this decision tree:

```
1. Is the answer in 01-PRD.md? → Follow it
2. Is the answer in 04-API-SPECIFICATION.md? → Follow it
3. Is there a similar pattern in existing code? → Follow that pattern
4. Can I make a safe, reversible choice? → Make it, leave a TODO comment
5. Is the ambiguity significant enough to affect user experience? 
   → STOP, document the question, ask the human before proceeding
```

When you leave a TODO:
```typescript
// TODO(agent): Confirm whether pagination is needed on /api/customers 
//              for orgs with < 100 customers. Currently returning all.
//              See 04-API-SPECIFICATION.md §6 — spec says pageSize default 50.
```

---

## 12. Common Mistakes to Avoid

```
❌ Using `Math.random()` for IDs → Use `cuid()` or `crypto.randomBytes()`
❌ Storing costs as JavaScript `number` → Use `Decimal` string or Prisma Decimal
❌ Missing orgId in DB queries → Multi-tenancy bug
❌ Returning decrypted API key in response → Security breach
❌ Using `any` in TypeScript → Type safety bypass
❌ Writing to usage_events without cost_usd → Data integrity bug
❌ SDK collecting prompt content → Privacy violation
❌ Calling Stripe API without error handling → Silent billing failures
❌ Not checking plan tier before serving feature → Revenue leak
❌ Hardcoding model pricing → Price changes break cost calculation
❌ Running aggregations on raw usage_events for dashboard → Performance issue
❌ Using Promise.all on 1000+ org operations → DB overload
❌ Catching errors silently without logging → Hidden bugs
❌ Sending provider API key to frontend → Security breach
❌ Using `prisma.$disconnect()` in serverless routes → Connection leaks
```

---

## 13. Definition of Done (Per Phase)

A phase is DONE only when ALL of the following are true:

```
□ All features in the phase are implemented per spec
□ Unit tests pass with required coverage
□ Integration tests pass
□ No TypeScript errors (yarn typecheck passes)
□ No ESLint errors (yarn lint passes)  
□ Feature is deployed to staging and manually tested
□ Empty states and error states implemented
□ Plan gating tested (correct features visible/hidden per tier)
□ Security rules verified (orgId isolation, no key leaks)
□ Performance: dashboard page loads in < 2.5s on staging
□ Human has reviewed and approved the phase
```

Do not mark a phase complete and move to the next phase until every checkbox above is checked.
