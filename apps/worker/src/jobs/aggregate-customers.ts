import { prisma } from "@tokonomics/db";
import { Redis } from "@upstash/redis";
import type { Logger } from "pino";

function getRedis(): Redis {
  const url = process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
  }
  return new Redis({ url, token });
}

export async function aggregateDirtyCustomers(logger: Logger): Promise<void> {
  const redis = getRedis();

  const keys = await redis.keys("dirty_customers:*");
  if (keys.length === 0) return;

  logger.info({ orgCount: keys.length }, "Aggregating dirty customers");

  for (const key of keys) {
    const orgId = (key as string).replace("dirty_customers:", "");
    const customerIds = (await redis.smembers(key as string)) as string[];
    if (customerIds.length === 0) continue;

    for (const customerId of customerIds) {
      try {
        await aggregateCustomer(orgId, customerId, logger);
      } catch (err: unknown) {
        logger.error({ orgId, customerId, err }, "Failed to aggregate customer");
      }
    }

    await redis.del(key as string);
    logger.info({ orgId, count: customerIds.length }, "Aggregated customers for org");
  }
}

async function aggregateCustomer(orgId: string, customerId: string, logger: Logger): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = await prisma.usageEvent.findMany({
    where: { orgId, customerId, createdAt: { gte: today } },
    select: { costUsd: true, inputTokens: true, outputTokens: true, model: true, feature: true },
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

    modelBreakdown[e.model] ??= { cost: 0, calls: 0 };
    modelBreakdown[e.model]!.cost += cost;
    modelBreakdown[e.model]!.calls += 1;

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

  logger.info({ orgId, customerId, totalCost }, "Customer aggregated");
}

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
      await aggregateCustomer(customer.orgId, customer.id, logger);
    } catch (err: unknown) {
      logger.error({ customerId: customer.id, err }, "Rebuild aggregate failed");
    }
  }
}
