import { prisma } from "@tokonomics/db";
import { Redis } from "ioredis";
import type { Logger } from "pino";

// For the worker, we use native Redis (ioredis) since BullMQ already uses it
function getWorkerRedis(): Redis {
  const url =
    process.env["UPSTASH_REDIS_URL"] ??
    process.env["REDIS_URL"] ??
    "redis://localhost:6379";
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, tls: url.startsWith("rediss:") ? {} : undefined });
}

export async function aggregateDirtyCustomers(logger: Logger): Promise<void> {
  // We use @upstash/redis REST for reading dirty sets to avoid importing ioredis
  const { Redis: UpstashRedis } = await import("@upstash/redis");
  const redis = new UpstashRedis({
    url: process.env["UPSTASH_REDIS_REST_URL"]!,
    token: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
  });

  // Find all orgs that have dirty customers
  const keys = await redis.keys("dirty_customers:*");
  if (keys.length === 0) return;

  logger.info({ orgCount: keys.length }, "Aggregating dirty customers");

  for (const key of keys) {
    const orgId = (key as string).replace("dirty_customers:", "");
    const customerIds = await redis.smembers(key as string) as string[];
    if (customerIds.length === 0) continue;

    for (const customerId of customerIds) {
      try {
        await aggregateCustomer(orgId, customerId);
      } catch (err: unknown) {
        logger.error({ orgId, customerId, err }, "Failed to aggregate customer");
      }
    }

    // Clear the dirty set after processing
    await redis.del(key as string);
    logger.info({ orgId, count: customerIds.length }, "Aggregated customers");
  }
}

async function aggregateCustomer(orgId: string, customerId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Sum today's events for this customer
  const events = await prisma.usageEvent.findMany({
    where: {
      orgId,
      customerId,
      createdAt: { gte: today },
    },
    select: {
      costUsd: true,
      inputTokens: true,
      outputTokens: true,
      model: true,
      feature: true,
    },
  });

  if (events.length === 0) return;

  let totalCost = 0;
  let totalInput = BigInt(0);
  let totalOutput = BigInt(0);
  const modelBreakdown: Record<string, { cost: number; calls: number }> = {};
  const featureBreakdown: Record<string, { cost: number; calls: number }> = {};

  for (const e of events) {
    const cost = parseFloat(e.costUsd.toString());
    totalCost += cost;
    totalInput += BigInt(e.inputTokens);
    totalOutput += BigInt(e.outputTokens);

    const model = e.model;
    modelBreakdown[model] ??= { cost: 0, calls: 0 };
    modelBreakdown[model]!.cost += cost;
    modelBreakdown[model]!.calls += 1;

    if (e.feature) {
      featureBreakdown[e.feature] ??= { cost: 0, calls: 0 };
      featureBreakdown[e.feature]!.cost += cost;
      featureBreakdown[e.feature]!.calls += 1;
    }
  }

  await prisma.dailyCustomerAggregate.upsert({
    where: { orgId_customerId_date: { orgId, customerId, date: today } },
    update: {
      totalCostUsd: totalCost.toFixed(6),
      inputTokens: totalInput,
      outputTokens: totalOutput,
      requestCount: events.length,
      modelBreakdown,
      featureBreakdown,
    },
    create: {
      orgId,
      customerId,
      date: today,
      totalCostUsd: totalCost.toFixed(6),
      inputTokens: totalInput,
      outputTokens: totalOutput,
      requestCount: events.length,
      modelBreakdown,
      featureBreakdown,
    },
  });
}

// Daily full rebuild — catches any missed aggregations
export async function rebuildAllAggregates(logger: Logger): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null },
    select: { id: true, orgId: true },
    take: 1000,
  });

  logger.info({ count: customers.length }, "Rebuilding all aggregates");

  for (const customer of customers) {
    try {
      await aggregateCustomer(customer.orgId, customer.id);
    } catch (err: unknown) {
      logger.error({ customerId: customer.id, err }, "Rebuild aggregate failed");
    }
  }
}
