# Tokonomics — Comprehensive Test Plan & TDD Framework
**Version:** 1.0  
**Last Updated:** 2026-06-18  
**Test Frameworks:** Vitest (unit/integration) + Playwright (E2E) + k6 (load)  

---

## 1. Testing Philosophy

1. **Test-First for Business Logic:** All margin calculations, cost computations, and alert rules are written test-first
2. **Integration over Unit for Infra:** DB queries tested against real PostgreSQL (test container), not mocks
3. **E2E for Critical User Paths:** Sign up → connect key → see spend; SDK → ingest → see customer cost
4. **Zero Snapshot Tests for Business Logic:** Snapshots for UI only, never for calculation results
5. **Test Isolation:** Each test owns its data. No shared state between tests.

---

## 2. Test Directory Structure

```
tokonomics/
├── apps/
│   ├── web/
│   │   ├── __tests__/
│   │   │   ├── unit/
│   │   │   │   ├── lib/
│   │   │   │   │   ├── encryption.test.ts
│   │   │   │   │   ├── model-costs.test.ts
│   │   │   │   │   └── margin-score.test.ts
│   │   │   │   └── validators/
│   │   │   │       └── event-schema.test.ts
│   │   │   ├── integration/
│   │   │   │   ├── api/
│   │   │   │   │   ├── providers.test.ts
│   │   │   │   │   ├── customers.test.ts
│   │   │   │   │   ├── budgets.test.ts
│   │   │   │   │   ├── alerts.test.ts
│   │   │   │   │   └── stripe.test.ts
│   │   │   │   └── webhooks/
│   │   │   │       ├── clerk.test.ts
│   │   │   │       └── stripe.test.ts
│   │   │   └── e2e/                # Playwright
│   │   │       ├── onboarding.spec.ts
│   │   │       ├── dashboard.spec.ts
│   │   │       └── billing.spec.ts
│   ├── ingest/
│   │   ├── __tests__/
│   │   │   ├── unit/
│   │   │   │   ├── validators.test.ts
│   │   │   │   └── cost-calc.test.ts
│   │   │   ├── integration/
│   │   │   │   ├── ingest-events.test.ts
│   │   │   │   └── rate-limiting.test.ts
│   │   │   └── load/              # k6
│   │   │       └── ingest-load.js
│   └── worker/
│       ├── __tests__/
│       │   ├── unit/
│       │   │   ├── margin-calculator.test.ts
│       │   │   ├── alert-checker.test.ts
│       │   │   └── digest-generator.test.ts
│       │   └── integration/
│       │       ├── provider-sync.test.ts
│       │       └── stripe-sync.test.ts
├── packages/
│   ├── sdk-node/
│   │   └── __tests__/
│   │       ├── unit/
│   │       └── integration/
│   └── sdk-python/
│       └── tests/
└── vitest.config.ts
```

---

## 3. Test Configuration

### vitest.config.ts (root)
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      exclude: ["**/node_modules/**", "**/*.d.ts", "**/e2e/**"],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true }, // DB tests need single process
    },
  },
});
```

### test/setup.ts
```typescript
import { beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./helpers/db";
import { redis } from "@/lib/redis";

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDb();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.ENCRYPTION_KEY = "a".repeat(64); // Test-only key
  process.env.CLERK_SECRET_KEY = "sk_test_xxx";
});

beforeEach(async () => {
  await testDb.reset(); // Truncate all tables between tests
  await redis.flushdb();
});

afterAll(async () => {
  await testDb.teardown();
  await redis.quit();
});
```

---

## 4. Unit Tests

### 4.1 Cost Calculation Tests
```typescript
// apps/web/__tests__/unit/lib/model-costs.test.ts

import { describe, it, expect } from "vitest";
import { calculateEventCost, getModelPricing } from "@/lib/pricing/model-costs";

describe("calculateEventCost", () => {
  it("calculates GPT-4o cost correctly", () => {
    const cost = calculateEventCost({
      model: "gpt-4o",
      provider: "OPENAI",
      inputTokens: 1000,
      outputTokens: 500,
    });
    // Input: 1000 tokens × ($2.50/1M) = $0.0025
    // Output: 500 tokens × ($10.00/1M) = $0.005
    // Total: $0.0075
    expect(cost).toBe("0.007500");
  });

  it("calculates claude-3-5-haiku cost correctly", () => {
    const cost = calculateEventCost({
      model: "claude-haiku-3-5-20241022",
      provider: "ANTHROPIC",
      inputTokens: 10000,
      outputTokens: 2000,
    });
    // Input: 10K × ($0.80/1M) = $0.008
    // Output: 2K × ($4.00/1M) = $0.008
    // Total: $0.016
    expect(cost).toBe("0.016000");
  });

  it("returns 0 for unknown model (logs warning)", () => {
    const cost = calculateEventCost({
      model: "unknown-model-xyz",
      provider: "OPENAI",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toBe("0.000000");
  });

  it("handles zero tokens", () => {
    const cost = calculateEventCost({
      model: "gpt-4o",
      provider: "OPENAI",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(cost).toBe("0.000000");
  });

  it("handles very large token counts without overflow", () => {
    const cost = calculateEventCost({
      model: "gpt-4o",
      provider: "OPENAI",
      inputTokens: 10_000_000,
      outputTokens: 5_000_000,
    });
    expect(cost).toBe("75.000000");
  });
});

describe("getModelPricing", () => {
  it("returns correct pricing for known model", () => {
    const pricing = getModelPricing("gpt-4o", "OPENAI");
    expect(pricing).toEqual({
      inputCostPer1M: "2.500000",
      outputCostPer1M: "10.000000",
    });
  });

  it("returns null for unknown model", () => {
    const pricing = getModelPricing("unknown-model", "OPENAI");
    expect(pricing).toBeNull();
  });
});
```

### 4.2 Margin Score Tests
```typescript
// apps/worker/__tests__/unit/margin-calculator.test.ts

import { describe, it, expect } from "vitest";
import { calculateMarginScore, calculateGrossMargin } from "@/lib/margin";

describe("calculateGrossMargin", () => {
  it("calculates healthy margin", () => {
    const margin = calculateGrossMargin({
      mrrCents: 19900,     // $199
      llmCostUsd: "4.20",
    });
    expect(margin.grossMarginPct).toBeCloseTo(97.89, 1);
    expect(margin.status).toBe("HEALTHY");
  });

  it("classifies unprofitable customer", () => {
    const margin = calculateGrossMargin({
      mrrCents: 4900,      // $49
      llmCostUsd: "51.30",
    });
    expect(margin.grossMarginPct).toBeCloseTo(-4.69, 1);
    expect(margin.status).toBe("LOSING_MONEY");
  });

  it("classifies watch status at configured floor", () => {
    const margin = calculateGrossMargin({
      mrrCents: 9900,
      llmCostUsd: "38.40",
      floorPct: 60,
    });
    expect(margin.grossMarginPct).toBeCloseTo(61.2, 1);
    expect(margin.status).toBe("WATCH"); // within 15% above floor
  });

  it("handles zero revenue (avoids divide by zero)", () => {
    const margin = calculateGrossMargin({
      mrrCents: 0,
      llmCostUsd: "10.00",
    });
    expect(margin.grossMarginPct).toBe(-Infinity);
    expect(margin.status).toBe("LOSING_MONEY");
  });

  it("handles zero LLM cost (free user)", () => {
    const margin = calculateGrossMargin({
      mrrCents: 9900,
      llmCostUsd: "0.00",
    });
    expect(margin.grossMarginPct).toBe(100);
    expect(margin.status).toBe("HEALTHY");
  });
});

describe("calculateMarginScore", () => {
  it("returns high score for healthy org", () => {
    const score = calculateMarginScore({
      customers: [
        { mrrCents: 19900, llmCostUsd: "4.20" },
        { mrrCents: 9900, llmCostUsd: "6.80" },
      ],
      usageEvents: mockHealthyUsageEvents(),
      marginHistory: mockImprovingHistory(),
    });
    expect(score).toBeGreaterThan(70);
  });

  it("penalizes high customer concentration", () => {
    const scoreConcentrated = calculateMarginScore({
      customers: [
        { mrrCents: 100000, llmCostUsd: "10.00" }, // 90% of revenue
        { mrrCents: 5000, llmCostUsd: "1.00" },
        { mrrCents: 5000, llmCostUsd: "1.00" },
      ],
      usageEvents: [],
      marginHistory: [],
    });
    const scoreBalanced = calculateMarginScore({
      customers: Array(20).fill({ mrrCents: 5000, llmCostUsd: "1.00" }),
      usageEvents: [],
      marginHistory: [],
    });
    expect(scoreConcentrated).toBeLessThan(scoreBalanced);
  });

  it("score is always 0–100", () => {
    const worstCase = calculateMarginScore({
      customers: [{ mrrCents: 100, llmCostUsd: "200.00" }],
      usageEvents: mockExpensiveEvents(),
      marginHistory: mockDecliningHistory(),
    });
    expect(worstCase).toBeGreaterThanOrEqual(0);
    expect(worstCase).toBeLessThanOrEqual(100);
  });
});
```

### 4.3 Encryption Tests
```typescript
// apps/web/__tests__/unit/lib/encryption.test.ts

import { describe, it, expect } from "vitest";
import { encryptApiKey, decryptApiKey } from "@/lib/encryption";

describe("API key encryption", () => {
  const testKey = "sk-proj-abcdefghijklmnop1234567890";

  it("encrypts and decrypts API key correctly", () => {
    const encrypted = encryptApiKey(testKey);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(testKey);
  });

  it("produces different ciphertext for same key (random IV)", () => {
    const enc1 = encryptApiKey(testKey);
    const enc2 = encryptApiKey(testKey);
    expect(enc1.encryptedValue).not.toBe(enc2.encryptedValue);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptApiKey(testKey);
    const tampered = { ...encrypted, encryptedValue: encrypted.encryptedValue + "x" };
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it("extracts last 4 chars for display", () => {
    const encrypted = encryptApiKey(testKey);
    expect(encrypted.lastFour).toBe(testKey.slice(-4));
  });
});
```

### 4.4 Alert Check Tests
```typescript
// apps/worker/__tests__/unit/alert-checker.test.ts

import { describe, it, expect, vi } from "vitest";
import { checkSpendSpike, checkBudgetRules, checkMarginFloor } from "@/lib/alert-checker";

describe("checkSpendSpike", () => {
  it("fires alert when today exceeds 2× 7-day average", async () => {
    const result = await checkSpendSpike({
      todaySpend: "20.00",
      sevenDayAvg: "5.00",
      threshold: 2.0,
    });
    expect(result.shouldAlert).toBe(true);
    expect(result.alertType).toBe("SPEND_SPIKE");
  });

  it("does not fire when below threshold", async () => {
    const result = await checkSpendSpike({
      todaySpend: "8.00",
      sevenDayAvg: "5.00",
      threshold: 2.0,
    });
    expect(result.shouldAlert).toBe(false);
  });

  it("does not fire when 7-day avg is zero (new org)", async () => {
    const result = await checkSpendSpike({
      todaySpend: "100.00",
      sevenDayAvg: "0.00",
      threshold: 2.0,
    });
    expect(result.shouldAlert).toBe(false); // Avoid false alarm on day 1
  });
});

describe("checkBudgetRules", () => {
  it("fires warning at alertAtPct", async () => {
    const result = checkBudgetRules({
      rules: [{ limitUsd: "50.00", alertAtPct: 80, period: "DAILY" }],
      currentSpend: "42.00",
    });
    expect(result[0].type).toBe("BUDGET_THRESHOLD");
    expect(result[0].severity).toBe("WARNING");
  });

  it("fires circuit breaker at limit", async () => {
    const result = checkBudgetRules({
      rules: [{ limitUsd: "50.00", alertAtPct: 80, period: "DAILY", circuitBreak: true }],
      currentSpend: "51.00",
    });
    expect(result[0].type).toBe("BUDGET_BREACHED");
    expect(result[0].circuitBreakActive).toBe(true);
  });
});
```

---

## 5. Integration Tests

### 5.1 Provider Connection Integration Tests
```typescript
// apps/web/__tests__/integration/api/providers.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, createTestOrg } from "../../helpers";

describe("POST /api/providers", () => {
  it("validates API key against provider before saving", async () => {
    const { app, org } = await createTestOrg({ plan: "FREE" });
    
    // Mock OpenAI validation call to return success
    mockProviderValidation("OPENAI", true);
    
    const res = await app.request("/api/providers", {
      method: "POST",
      body: JSON.stringify({
        provider: "OPENAI",
        displayName: "Test OpenAI",
        apiKey: "sk-proj-test1234",
      }),
    });
    
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.provider).toBe("OPENAI");
    expect(body.data.keyLastFour).toBe("1234");
    
    // Verify key is NOT stored in plaintext
    const dbRecord = await db.providerConnection.findFirst({
      where: { orgId: org.id }
    });
    expect(dbRecord?.encryptedKey).not.toContain("sk-proj-test1234");
    expect(dbRecord?.keyIv).toBeDefined();
  });

  it("rejects invalid API key with clear error", async () => {
    mockProviderValidation("OPENAI", false, "Invalid API key");
    
    const res = await app.request("/api/providers", {
      method: "POST",
      body: JSON.stringify({
        provider: "OPENAI",
        displayName: "Test",
        apiKey: "sk-invalid",
      }),
    });
    
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
```

### 5.2 Ingestion Integration Tests
```typescript
// apps/ingest/__tests__/integration/ingest-events.test.ts

import { describe, it, expect } from "vitest";

describe("POST /ingest/v1/events", () => {
  it("ingests valid event and calculates cost", async () => {
    const { sdkKey, org } = await createTestOrgWithSdkKey();
    
    const res = await ingestApp.inject({
      method: "POST",
      url: "/ingest/v1/events",
      headers: { Authorization: `Bearer ${sdkKey}` },
      payload: {
        customer_id: "test-customer-1",
        model: "gpt-4o",
        provider: "openai",
        input_tokens: 1000,
        output_tokens: 500,
        latency_ms: 1200,
      },
    });
    
    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.data.costUsd).toBe("0.007500"); // Verified calculation
    expect(body.data.accepted).toBe(true);
    
    // Verify event saved to DB
    const event = await db.usageEvent.findFirst({
      where: { orgId: org.id, externalCustomerId: "test-customer-1" }
    });
    expect(event).toBeDefined();
    expect(event?.costUsd.toString()).toBe("0.007500");
    
    // Verify customer auto-created
    const customer = await db.customer.findFirst({
      where: { orgId: org.id, externalId: "test-customer-1" }
    });
    expect(customer).toBeDefined();
  });

  it("returns 402 when circuit breaker triggered", async () => {
    const { sdkKey, org, customer } = await createTestSetup();
    
    // Set budget rule with low limit
    await createBudgetRule({ orgId: org.id, customerId: customer.id, limitUsd: "0.01", circuitBreak: true });
    
    // First event: under budget
    await ingestEvent(sdkKey, { customer_id: customer.externalId, input_tokens: 100, output_tokens: 50 });
    
    // Second event: would exceed budget
    const res = await ingestEvent(sdkKey, { customer_id: customer.externalId, input_tokens: 10000, output_tokens: 5000 });
    
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.payload).error.code).toBe("BUDGET_EXCEEDED");
  });

  it("deduplicates events by idempotency_key", async () => {
    const { sdkKey } = await createTestOrgWithSdkKey();
    
    const payload = {
      customer_id: "cust-1",
      model: "gpt-4o",
      provider: "openai",
      input_tokens: 1000,
      output_tokens: 500,
      idempotency_key: "unique-req-123",
    };
    
    await ingestApp.inject({ method: "POST", url: "/ingest/v1/events", payload });
    await ingestApp.inject({ method: "POST", url: "/ingest/v1/events", payload }); // Duplicate
    
    const count = await db.usageEvent.count({ where: { idempotencyKey: "unique-req-123" } });
    expect(count).toBe(1); // Only stored once
  });

  it("rejects request with invalid SDK key", async () => {
    const res = await ingestApp.inject({
      method: "POST",
      url: "/ingest/v1/events",
      headers: { Authorization: "Bearer tok_invalid" },
      payload: { customer_id: "test", model: "gpt-4o", provider: "openai", input_tokens: 100, output_tokens: 50 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rate limits at 1000 req/min per org", async () => {
    const { sdkKey } = await createTestOrgWithSdkKey();
    const results = await Promise.all(
      Array(1001).fill(null).map(() => ingestValidEvent(sdkKey))
    );
    const rateLimited = results.filter(r => r.statusCode === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

### 5.3 Customer API Integration Tests
```typescript
// apps/web/__tests__/integration/api/customers.test.ts

describe("GET /api/customers", () => {
  it("returns sorted customer list with cost data", async () => {
    const { app, org } = await createTestOrg({ plan: "STARTER" });
    
    // Seed customers with usage
    await seedCustomerWithUsage(org.id, "cust-1", 19900, "4.20");   // $199 revenue, $4.20 cost
    await seedCustomerWithUsage(org.id, "cust-2", 4900, "51.30");   // $49 revenue, $51.30 cost
    await seedCustomerWithUsage(org.id, "cust-3", 9900, "38.40");   // $99 revenue, $38.40 cost

    const res = await app.request("/api/customers?sort=cost_desc", {
      headers: authHeaders(org.id)
    });
    
    expect(res.status).toBe(200);
    const { data } = await res.json();
    
    expect(data.customers[0].externalId).toBe("cust-2"); // Highest cost first
    expect(data.customers[0].totalCostUsd).toBe("51.30");
    expect(data.summary.unprofitable).toBe(1); // cust-2 is losing money
  });

  it("requires STARTER plan", async () => {
    const { app } = await createTestOrg({ plan: "FREE" });
    const res = await app.request("/api/customers", { headers: authHeaders() });
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("PLAN_REQUIRED");
  });
});
```

### 5.4 Stripe Sync Integration Tests
```typescript
// apps/worker/__tests__/integration/stripe-sync.test.ts

describe("stripe-sync worker job", () => {
  it("matches stripe customer by email to tracked customer", async () => {
    const org = await createOrgWithStripeConnection();
    
    // Create tracked customer with email
    const customer = await db.customer.create({
      data: { orgId: org.id, externalId: "cust-1", email: "user@example.com" }
    });
    
    // Mock Stripe API to return customer with same email
    mockStripeCustomers([{
      id: "cus_stripe123",
      email: "user@example.com",
      name: "Jane Smith",
      subscriptions: [{ items: { data: [{ price: { unit_amount: 9900 } }] } }]
    }]);
    
    await runStripeSync(org.id);
    
    const stripeCustomer = await db.stripeCustomer.findFirst({
      where: { orgId: org.id, stripeCustomerId: "cus_stripe123" }
    });
    
    expect(stripeCustomer?.matchedCustomerId).toBe(customer.id);
    expect(stripeCustomer?.mrrCents).toBe(9900);
  });
});
```

---

## 6. E2E Tests (Playwright)

### 6.1 Critical Path: Onboarding
```typescript
// apps/web/__tests__/e2e/onboarding.spec.ts

import { test, expect } from "@playwright/test";

test.describe("Free tier onboarding", () => {
  test("can connect provider key and see spend in <5 minutes", async ({ page }) => {
    // Start timer
    const startTime = Date.now();
    
    await page.goto("/sign-up");
    await page.fill('[data-testid="email"]', "test@example.com");
    await page.fill('[data-testid="password"]', "TestPassword123!");
    await page.click('[data-testid="submit"]');
    
    // Should reach dashboard
    await expect(page).toHaveURL(/\/overview/);
    
    // Connect provider key
    await page.click('[data-testid="connect-provider"]');
    await page.selectOption('[data-testid="provider-select"]', "OPENAI");
    await page.fill('[data-testid="api-key-input"]', process.env.TEST_OPENAI_KEY!);
    await page.fill('[data-testid="display-name"]', "Test OpenAI");
    await page.click('[data-testid="save-provider"]');
    
    // Should show syncing state
    await expect(page.locator('[data-testid="sync-status"]')).toContainText("Syncing");
    
    // Should show spend data within 30 seconds
    await expect(page.locator('[data-testid="total-spend"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid="total-spend"]')).not.toContainText("$0.00");
    
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5 * 60 * 1000); // Under 5 minutes
  });
});

test.describe("Starter tier: SDK integration", () => {
  test("SDK event appears in customer table within 60 seconds", async ({ page }) => {
    const org = await setupTestOrg("STARTER");
    await page.goto(`/customers`);
    
    // Send event via SDK
    await sendSdkEvent(org.sdkKey, { customer_id: "e2e-test-cust", model: "gpt-4o", ... });
    
    // Wait for customer to appear
    await expect(page.locator(`[data-customer-id="e2e-test-cust"]`)).toBeVisible({ timeout: 60000 });
  });
});
```

---

## 7. SDK Tests

### Node.js SDK Tests
```typescript
// packages/sdk-node/__tests__/unit/track.test.ts

import { describe, it, expect, vi } from "vitest";
import { Tokonomics } from "../src";

describe("Tokonomics Node SDK", () => {
  it("wraps OpenAI call and sends event", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      if (url.toString().includes("ingest.tokonomics.dev")) {
        return new Response(JSON.stringify({ data: { accepted: true, costUsd: "0.007500" } }), { status: 202 });
      }
      return mockOpenAiResponse();
    });

    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    const result = await toko.track({ customerId: "cust-1", feature: "chat" }, async () => {
      return openai.chat.completions.create({ model: "gpt-4o", messages: [...] });
    });

    // Verify tracking call was made
    const trackingCall = fetchSpy.mock.calls.find(([url]) => 
      url.toString().includes("ingest.tokonomics.dev")
    );
    expect(trackingCall).toBeDefined();
    
    const body = JSON.parse(trackingCall![1]!.body as string);
    expect(body.customer_id).toBe("cust-1");
    expect(body.feature).toBe("chat");
    expect(body.model).toBe("gpt-4o");
    expect(body.prompt_content).toBeUndefined(); // NO prompt capture
  });

  it("does not block LLM call if tracking fails", async () => {
    // Tracking endpoint is down
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));
    
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    // Should NOT throw even though tracking failed
    await expect(
      toko.track({ customerId: "cust-1" }, async () => mockLlmCall())
    ).resolves.toBeDefined();
  });

  it("never sends prompt content", async () => {
    const sentPayloads: any[] = [];
    vi.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      if (url.toString().includes("ingest")) {
        sentPayloads.push(JSON.parse(options!.body as string));
      }
      return mockOpenAiResponse("This is the completion text");
    });

    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    await toko.track({ customerId: "cust-1" }, async () =>
      mockLlmCallWithMessages([{ role: "user", content: "SECRET PROMPT" }])
    );

    for (const payload of sentPayloads) {
      expect(JSON.stringify(payload)).not.toContain("SECRET PROMPT");
      expect(JSON.stringify(payload)).not.toContain("This is the completion text");
    }
  });
});
```

---

## 8. Load Tests (k6)

### 8.1 Ingestion Load Test
```javascript
// apps/ingest/__tests__/load/ingest-load.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 100 },   // Ramp up to 100 VUs
    { duration: "3m", target: 1000 },  // Ramp up to 1000 VUs (target 10K RPS)
    { duration: "1m", target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(99)<200"],   // 99th percentile < 200ms
    http_req_failed: ["rate<0.01"],     // Error rate < 1%
    http_reqs: ["rate>5000"],           // At least 5K RPS sustained
  },
};

export default function () {
  const res = http.post(
    `${__ENV.INGEST_URL}/ingest/v1/events`,
    JSON.stringify({
      customer_id: `cust-${Math.floor(Math.random() * 1000)}`,
      model: "gpt-4o",
      provider: "openai",
      input_tokens: Math.floor(Math.random() * 2000),
      output_tokens: Math.floor(Math.random() * 500),
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${__ENV.SDK_KEY}`,
      },
    }
  );

  check(res, {
    "status is 202": (r) => r.status === 202,
    "response time < 200ms": (r) => r.timings.duration < 200,
  });
  sleep(0.001); // 1ms sleep = ~1000 RPS per VU
}
```

---

## 9. Coverage Requirements

| Module | Min Coverage |
|---|---|
| Cost calculation | 100% |
| Margin calculation | 100% |
| Encryption/decryption | 100% |
| Alert checker logic | 90% |
| API route handlers | 85% |
| Worker jobs | 85% |
| SDK (node + python) | 90% |
| UI components | 70% |

---

## 10. CI Test Execution Order

```yaml
# Fast feedback loop
1. Lint + type check (< 1 min)
2. Unit tests (< 2 min)
3. Integration tests (< 5 min, uses test DB container)
4. E2E tests (< 10 min, uses staging environment)
5. Load tests (< 10 min, runs weekly on main only)
```
