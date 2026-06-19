import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env["UPSTASH_REDIS_REST_URL"]!,
  token: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
});

// Cache key patterns (centralized to prevent key drift)
export const CacheKeys = {
  orgSpend: (orgId: string, period: string): string => `spend:org:${orgId}:${period}`,
  customers: (orgId: string): string => `customers:org:${orgId}`,
  modelPricing: (): string => `pricing:models`,
  marginScore: (orgId: string): string => `score:org:${orgId}`,
  stripeCustomers: (orgId: string): string => `stripe:customers:org:${orgId}`,
  budgetRules: (orgId: string): string => `budgets:org:${orgId}`,
  sdkKey: (keyHash: string): string => `sdk:key:${keyHash}`,
  dirtyCustomers: (orgId: string): string => `dirty_customers:${orgId}`,
} as const;

// TTLs in seconds (centralized)
export const CacheTTL = {
  orgSpend: 5 * 60,       // 5 minutes
  customers: 60,           // 1 minute
  modelPricing: 60 * 60,  // 1 hour
  marginScore: 5 * 60,    // 5 minutes
  stripeCustomers: 6 * 60 * 60, // 6 hours
  budgetRules: 10 * 60,   // 10 minutes
  sdkKey: 5 * 60,         // 5 minutes
} as const;
