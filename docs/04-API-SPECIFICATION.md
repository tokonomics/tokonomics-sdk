# Tokonomics — API Specification
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Format:** OpenAPI 3.1 compatible (documented as markdown for agent use)  
**Base URL (Dashboard API):** `https://app.tokonomics.dev/api`  
**Base URL (Ingestion API):** `https://ingest.tokonomics.dev`  
**Base URL (Public API):** `https://api.tokonomics.dev/v1`  

---

## 1. Authentication

### Dashboard API (apps/web)
All dashboard API routes are authenticated via Clerk session cookie.  
Middleware at `middleware.ts` validates session and extracts `orgId` + `userId`.

```typescript
// Pattern for all dashboard API routes
import { auth } from "@clerk/nextjs/server";
import { getOrgContext } from "@/lib/auth";

export async function GET(req: Request) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // ...
}
```

### Ingestion API (apps/ingest)
Authenticated via SDK API key in header:
```
Authorization: Bearer tok_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Public API (Scale tier)
Authenticated via org API key:
```
X-API-Key: tok_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 2. Standard Response Envelope

```typescript
// Success
{
  "data": <payload>,
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-06-18T12:00:00Z"
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "customer_id is required",
    "details": [{ "field": "customer_id", "message": "Required" }]
  },
  "meta": {
    "requestId": "req_xxx",
    "timestamp": "2026-06-18T12:00:00Z"
  }
}
```

### Standard Error Codes
| HTTP | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Request body/params failed Zod validation |
| 401 | UNAUTHORIZED | Missing or invalid auth |
| 403 | FORBIDDEN | Authenticated but insufficient permissions or plan |
| 404 | NOT_FOUND | Resource doesn't exist in org |
| 409 | CONFLICT | Duplicate resource (unique constraint) |
| 429 | RATE_LIMITED | Too many requests |
| 402 | PLAN_REQUIRED | Feature requires plan upgrade |
| 500 | INTERNAL_ERROR | Server error (see logs) |

---

## 3. Provider Connections API

### `GET /api/providers`
List all provider connections for the org.

**Response 200:**
```json
{
  "data": [{
    "id": "clxxx",
    "provider": "OPENAI",
    "displayName": "OpenAI (Production)",
    "keyLastFour": "a4bZ",
    "status": "CONNECTED",
    "lastSyncedAt": "2026-06-18T11:55:00Z",
    "lastSpendUsd": "145.80"
  }]
}
```

### `POST /api/providers`
Add a new provider connection.  
**Plan Required:** FREE  

**Request Body:**
```json
{
  "provider": "OPENAI" | "ANTHROPIC" | "GOOGLE",
  "displayName": "OpenAI (Production)",
  "apiKey": "sk-proj-..."
}
```

**Validation:**
- `provider`: Required, enum
- `displayName`: Required, 1–100 chars
- `apiKey`: Required, validated against provider (test call before saving)

**Process:**
1. Validate API key by making a test call to provider's models list or usage endpoint
2. Encrypt API key using AES-256-GCM
3. Store encrypted key + IV + auth tag
4. Trigger immediate sync job

**Response 201:**
```json
{
  "data": {
    "id": "clxxx",
    "provider": "OPENAI",
    "displayName": "OpenAI (Production)",
    "keyLastFour": "a4bZ",
    "status": "CONNECTED"
  }
}
```

**Response 400 (invalid key):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "API key validation failed: Invalid API key provided"
  }
}
```

### `DELETE /api/providers/:id`
Remove provider connection and all associated usage records.

**Response 200:**
```json
{ "data": { "deleted": true } }
```

### `POST /api/providers/:id/sync`
Trigger manual sync for a provider connection.

**Response 202:**
```json
{ "data": { "jobId": "job_xxx", "status": "queued" } }
```

---

## 4. Spend Overview API

### `GET /api/overview/spend`
Get aggregated spend overview for the org.  
**Plan Required:** FREE  

**Query Params:**
- `period`: `7d` | `30d` | `90d` (default: `30d`)
- `provider`: Optional filter

**Response 200:**
```json
{
  "data": {
    "totalSpendUsd": "145.80",
    "periodStart": "2026-05-19",
    "periodEnd": "2026-06-18",
    "projectedMonthlyUsd": "312.40",
    "trend": "+12.3%",
    "dailySeries": [
      { "date": "2026-06-17", "costUsd": "12.40" },
      { "date": "2026-06-18", "costUsd": "8.20" }
    ],
    "modelMix": [
      { "model": "gpt-4o", "costUsd": "98.40", "pct": 67.5, "calls": 12840 },
      { "model": "gpt-4o-mini", "costUsd": "47.40", "pct": 32.5, "calls": 98320 }
    ],
    "providerMix": [
      { "provider": "OPENAI", "costUsd": "145.80", "pct": 100 }
    ]
  }
}
```

### `GET /api/overview/spike-threshold`
Get the current spend spike alert configuration.

**Response 200:**
```json
{
  "data": {
    "enabled": true,
    "multiplier": 2.0,
    "baselineDays": 7,
    "currentDailyAvg": "4.86"
  }
}
```

### `PUT /api/overview/spike-threshold`
Update spend spike alert configuration.

**Request Body:**
```json
{
  "enabled": true,
  "multiplier": 2.5
}
```

---

## 5. SDK API Keys API

### `GET /api/sdk-keys`
List SDK API keys for the org.

**Response 200:**
```json
{
  "data": [{
    "id": "clxxx",
    "name": "Production",
    "keyPrefix": "tok_live_8f3a2b",
    "lastUsedAt": "2026-06-18T10:30:00Z",
    "createdAt": "2026-06-01T09:00:00Z"
  }]
}
```

### `POST /api/sdk-keys`
Create a new SDK API key.  
**Plan Required:** STARTER  

**Request Body:**
```json
{ "name": "Production" }
```

**Response 201:**
```json
{
  "data": {
    "id": "clxxx",
    "name": "Production",
    "key": "tok_live_8f3a2bk9mxp2qr7nw1...",   // ONLY returned once — store it!
    "keyPrefix": "tok_live_8f3a2b"
  }
}
```

### `DELETE /api/sdk-keys/:id`
Revoke an SDK API key immediately.

---

## 6. Customers API

### `GET /api/customers`
List customers with cost data.  
**Plan Required:** STARTER  

**Query Params:**
- `period`: `30d` | `90d` | `all` (default: `30d`)
- `sort`: `cost_desc` | `cost_asc` | `margin_asc` | `margin_desc` | `name_asc` (default: `cost_desc`)
- `status`: `healthy` | `watch` | `unprofitable` | `losing` (optional filter)
- `search`: Free text (matches externalId, displayName, email)
- `page`: Page number (default: 1)
- `pageSize`: 10–100 (default: 50)

**Response 200:**
```json
{
  "data": {
    "customers": [{
      "id": "clxxx",
      "externalId": "cust_8a2f",
      "displayName": null,
      "email": "user@example.com",
      "totalCostUsd": "4.20",
      "mrrCents": 19900,
      "grossMarginPct": "97.9432",
      "status": "HEALTHY",
      "requestCount": 840,
      "lastSeenAt": "2026-06-18T11:20:00Z"
    }],
    "pagination": {
      "page": 1,
      "pageSize": 50,
      "total": 247,
      "totalPages": 5
    },
    "summary": {
      "totalCustomers": 247,
      "unprofitable": 2,
      "watching": 8,
      "avgMarginPct": "86.4"
    }
  }
}
```

### `GET /api/customers/:id`
Get detailed data for a single customer.

**Response 200:**
```json
{
  "data": {
    "id": "clxxx",
    "externalId": "cust_8a2f",
    "email": "user@example.com",
    "mrrCents": 19900,
    "totalCostUsd": "4.20",
    "grossMarginPct": "97.9432",
    "status": "HEALTHY",
    "featureBreakdown": [
      { "feature": "chat", "costUsd": "3.10", "pct": 73.8 },
      { "feature": "search", "costUsd": "1.10", "pct": 26.2 }
    ],
    "modelBreakdown": [
      { "model": "gpt-4o", "costUsd": "3.80", "pct": 90.5 }
    ],
    "dailySeries": [
      { "date": "2026-06-17", "costUsd": "0.40" }
    ],
    "budgetRules": []
  }
}
```

### `PATCH /api/customers/:id`
Update customer metadata.

**Request Body (all optional):**
```json
{
  "displayName": "Acme Corp",
  "email": "billing@acme.com",
  "manualMrr": "199.00",
  "stripeMatchId": "cus_stripe123",
  "tags": ["enterprise", "churning"]
}
```

---

## 7. Budget Rules API

### `GET /api/budgets`
List all budget rules for the org.

### `POST /api/budgets`
Create a budget rule.  
**Plan Required:** STARTER  

**Request Body:**
```json
{
  "customerId": "clxxx",        // null = all customers
  "feature": "agent-loop",      // null = all features
  "ruleType": "DAILY",          // "DAILY" | "MONTHLY"
  "limitUsd": "50.00",
  "alertAtPct": 80,
  "circuitBreak": false
}
```

### `PUT /api/budgets/:id`
Update a budget rule.

### `DELETE /api/budgets/:id`
Delete a budget rule.

---

## 8. Alerts API

### `GET /api/alerts`
List alerts for the org.

**Query Params:**
- `unread`: `true` | `false` (default: no filter)
- `severity`: `INFO` | `WARNING` | `CRITICAL`
- `type`: Alert type filter
- `page`, `pageSize`

**Response 200:**
```json
{
  "data": {
    "alerts": [{
      "id": "clxxx",
      "alertType": "CUSTOMER_UNPROFITABLE",
      "severity": "CRITICAL",
      "title": "Customer cust_9x8q is losing money",
      "body": "cust_9x8q has gross margin of -4.7%. Revenue: $49.00, LLM Cost: $51.30",
      "metadata": { "customerId": "clxxx", "marginPct": -4.7 },
      "isRead": false,
      "createdAt": "2026-06-18T06:00:00Z"
    }],
    "pagination": { "total": 12, "page": 1, "pageSize": 50 }
  }
}
```

### `POST /api/alerts/mark-read`
Mark alerts as read.

**Request Body:**
```json
{ "alertIds": ["clxxx", "clyyy"] }
// OR
{ "all": true }
```

---

## 9. Stripe Integration API

### `GET /api/stripe/status`
Check Stripe connection status.  
**Plan Required:** GROWTH  

### `GET /api/stripe/oauth-url`
Get Stripe OAuth URL to initiate connection.

**Response 200:**
```json
{ "data": { "url": "https://connect.stripe.com/oauth/authorize?..." } }
```

### `POST /api/stripe/oauth-callback`
Handle OAuth callback (called by Stripe redirect).

**Request Body:**
```json
{ "code": "ac_xxx" }
```

### `DELETE /api/stripe/connection`
Disconnect Stripe and remove all cached Stripe data.

### `GET /api/stripe/customers`
List Stripe customers with match status.

**Response 200:**
```json
{
  "data": {
    "customers": [{
      "stripeCustomerId": "cus_xxx",
      "email": "user@example.com",
      "name": "Jane Smith",
      "mrrCents": 9900,
      "matchedCustomerId": "clxxx",
      "matchConfidence": "EXACT"  // "EXACT" | "EMAIL" | "MANUAL" | "UNMATCHED"
    }]
  }
}
```

### `POST /api/stripe/match`
Manually match a Stripe customer to a tracked customer.

**Request Body:**
```json
{
  "stripeCustomerId": "cus_xxx",
  "tokonomicsCustomerId": "clxxx"
}
```

---

## 10. Slack Integration API

### `POST /api/slack/connect`
Save Slack webhook URL.  
**Plan Required:** GROWTH  

**Request Body:**
```json
{ "webhookUrl": "https://hooks.slack.com/services/..." }
```

### `POST /api/slack/test`
Send a test Slack notification.

### `DELETE /api/slack/connection`
Remove Slack webhook.

---

## 11. Pricing Simulator API

### `POST /api/simulator/run`
Run a pricing simulation.  
**Plan Required:** GROWTH  

**Request Body:**
```json
{
  "name": "Usage-based v2",
  "config": {
    "mode": "usage_based",
    "basePrice": 0,
    "pricePerToken": 0.00001,
    "fairUseLimitTokens": 120000,
    "tiers": [
      { "from": 0, "to": 100000, "pricePerToken": 0.000008 },
      { "from": 100000, "to": null, "pricePerToken": 0.000015 }
    ]
  },
  "period": "30d"
}
```

**Response 200:**
```json
{
  "data": {
    "projectedMrrCents": 1842000,
    "currentMrrCents": 1770000,
    "mrrLiftPct": 4.1,
    "projectedAvgMarginPct": 91.2,
    "currentAvgMarginPct": 86.4,
    "customerImpact": [
      {
        "externalId": "cust_8a2f",
        "currentBillCents": 19900,
        "projectedBillCents": 21200,
        "delta": "+$13"
      }
    ]
  }
}
```

### `GET /api/simulator/saved`
List saved simulations.

### `DELETE /api/simulator/:id`
Delete a saved simulation.

---

## 12. Model Routing API

### `GET /api/routing/tests`
List model routing tests.  
**Plan Required:** GROWTH  

### `POST /api/routing/tests`
Create a new routing test.

**Request Body:**
```json
{
  "name": "Chat feature: GPT-4o vs Haiku",
  "feature": "chat",
  "controlModel": "gpt-4o",
  "treatmentModel": "claude-haiku-3-5-20241022"
}
```

### `POST /api/routing/tests/:id/start`
Start a routing test.

### `POST /api/routing/tests/:id/stop`
Stop a routing test and compute results.

### `GET /api/routing/tests/:id/results`
Get routing test results.

**Response 200:**
```json
{
  "data": {
    "id": "clxxx",
    "status": "COMPLETED",
    "results": {
      "controlModel": "gpt-4o",
      "treatmentModel": "claude-haiku-3-5-20241022",
      "controlCostUsd": "38.40",
      "treatmentCostUsd": "6.20",
      "savingsUsd": "32.20",
      "savingsPct": 83.9,
      "controlRequests": 1200,
      "treatmentRequests": 1200,
      "avgLatencyControlMs": 1840,
      "avgLatencyTreatmentMs": 420
    },
    "recommendation": "Switch chat feature to claude-haiku. 84% cost reduction with comparable latency. Estimated $38/mo savings."
  }
}
```

---

## 13. AI Margin Score API

### `GET /api/margin-score`
Get current AI Margin Score.  
**Plan Required:** GROWTH  

**Response 200:**
```json
{
  "data": {
    "score": 78,
    "trend": "+3",
    "components": {
      "baseMarginScore": 40,
      "concentrationPenalty": -8,
      "wasteScore": 14,
      "pricingFit": 18,
      "trendBonus": 14
    },
    "insights": [
      { "type": "drag", "label": "heavy users", "impact": -12, "action": "Add usage caps" },
      { "type": "drag", "label": "model waste", "impact": -7, "action": "Route chat to Haiku" },
      { "type": "lift", "label": "pricing fit", "impact": +4, "description": "Usage aligns well with plan tiers" }
    ],
    "date": "2026-06-18"
  }
}
```

---

## 14. Reports API (Scale)

### `GET /api/reports/investor`
Generate white-label investor report.  
**Plan Required:** SCALE  

**Query Params:**
- `period`: `30d` | `90d` | `qtd` | `ytd`
- `format`: `pdf` | `json`

**Response:** PDF download or JSON data

---

## 15. SDK Ingestion API (apps/ingest)

### `POST /ingest/v1/events`
Ingest a single usage event.  
**Auth:** Bearer SDK API Key  

**Request Body:**
```json
{
  "customer_id": "cust_8a2f",
  "feature": "chat",
  "workflow": "rag-pipeline",
  "model": "gpt-4o",
  "provider": "openai",
  "input_tokens": 1240,
  "output_tokens": 380,
  "latency_ms": 1840,
  "timestamp": "2026-06-18T12:00:00Z",
  "idempotency_key": "req_abc123",
  "sdk_version": "0.1.4"
}
```

**Validation:**
- `customer_id`: Required, string, 1–200 chars
- `model`: Required, string
- `provider`: Required, enum
- `input_tokens`: Required, non-negative integer
- `output_tokens`: Required, non-negative integer
- `timestamp`: Optional, ISO 8601 (defaults to server time if omitted)
- `idempotency_key`: Optional but strongly recommended

**Response 202:**
```json
{
  "data": {
    "accepted": true,
    "eventId": "evt_xxx",
    "costUsd": "0.004610"
  }
}
```

**Response 402 (budget circuit breaker triggered):**
```json
{
  "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "Daily budget of $42.00 exceeded for customer cust_2r5t",
    "data": { "limitUsd": "42.00", "currentSpendUsd": "42.10" }
  }
}
```

### `POST /ingest/v1/events/batch`
Ingest up to 100 events in a single request.

**Request Body:**
```json
{
  "events": [/* array of event objects */]
}
```

**Response 202:**
```json
{
  "data": {
    "accepted": 98,
    "rejected": 2,
    "errors": [
      { "index": 3, "error": "customer_id is required" }
    ]
  }
}
```

### `GET /ingest/v1/health`
Health check endpoint.  
**Auth:** None required.

**Response 200:**
```json
{ "status": "ok", "version": "1.0.0" }
```

---

## 16. Webhooks

### `POST /api/webhooks/clerk`
Clerk user and org sync webhook.  
**Auth:** Svix signature verification (`CLERK_WEBHOOK_SECRET`)

Handles: `user.created`, `user.updated`, `organization.created`, `organizationMembership.created`

### `POST /api/webhooks/stripe`
Stripe billing events.  
**Auth:** Stripe signature verification (`STRIPE_WEBHOOK_SECRET`)

Handles:
- `customer.subscription.created` → Update org plan
- `customer.subscription.updated` → Update org plan
- `customer.subscription.deleted` → Downgrade org to FREE
- `invoice.payment_failed` → Alert org owner

---

## 17. Public API v1 (Scale Tier)

All Scale tier public API routes under `/v1/`:  
**Auth:** `X-API-Key: tok_api_xxx`

### `GET /v1/spend/summary`
Same as dashboard spend overview.

### `GET /v1/customers`
List customers with cost data.

### `GET /v1/customers/:externalId`
Get customer by external ID.

### `GET /v1/margin-score`
Get current margin score.

### `GET /v1/alerts`
List recent alerts.

---

## 18. Rate Limiting Headers

All responses include:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1718712000
Retry-After: 60  (only on 429)
```
