export type PlanTier = "FREE" | "STARTER" | "GROWTH" | "SCALE";

export type LlmProvider = "OPENAI" | "ANTHROPIC" | "GOOGLE";

export type ConnectionStatus = "CONNECTED" | "ERROR" | "DISCONNECTED";

export type OrgRole = "OWNER" | "ADMIN" | "VIEWER";

export type MarginStatus = "HEALTHY" | "WATCH" | "UNPROFITABLE" | "LOSING_MONEY";

export type AlertType =
  | "SPEND_SPIKE"
  | "BUDGET_THRESHOLD"
  | "BUDGET_BREACHED"
  | "MARGIN_FLOOR"
  | "CUSTOMER_UNPROFITABLE"
  | "PROVIDER_SYNC_ERROR"
  | "STRIPE_SYNC_ERROR";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type BudgetPeriod = "DAILY" | "MONTHLY";

export type TestStatus = "DRAFT" | "RUNNING" | "COMPLETED" | "CANCELED";

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID";

// ─── Plan tier ordering for comparison ───────────────────────────────────────

const PLAN_ORDER: Record<PlanTier, number> = {
  FREE: 0,
  STARTER: 1,
  GROWTH: 2,
  SCALE: 3,
};

export function meetsMinPlan(orgPlan: PlanTier, requiredPlan: PlanTier): boolean {
  return PLAN_ORDER[orgPlan] >= PLAN_ORDER[requiredPlan];
}

// ─── SDK Ingest Types ─────────────────────────────────────────────────────────

export type IngestEventInput = {
  customerId: string;
  model: string;
  provider: LlmProvider;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  feature?: string;
  workflow?: string;
  sdkVersion?: string;
  idempotencyKey?: string;
};

export type IngestEventResponse = {
  eventId: string;
  costUsd: string;
  status: "accepted";
};

// ─── Encryption types ─────────────────────────────────────────────────────────

export type EncryptedValue = {
  encryptedValue: string;
  iv: string;
  authTag: string;
};
