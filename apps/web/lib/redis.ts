import { Redis } from "@upstash/redis";

// Lazy singleton — avoids Upstash URL validation running at module import time
// (which breaks Next.js build-time static analysis of API routes)
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env["UPSTASH_REDIS_REST_URL"];
    const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
    if (!url || !token) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

// Convenience proxy — keeps call sites clean (redis.get / redis.set)
export const redis = new Proxy({} as Redis, {
  get(_target, prop: string) {
    const client = getRedis();
    const val = (client as unknown as Record<string, unknown>)[prop];
    return typeof val === "function" ? (val as Function).bind(client) : val;
  },
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
  orgSpend: 5 * 60,
  customers: 60,
  modelPricing: 60 * 60,
  marginScore: 5 * 60,
  stripeCustomers: 6 * 60 * 60,
  budgetRules: 10 * 60,
  sdkKey: 5 * 60,
} as const;
