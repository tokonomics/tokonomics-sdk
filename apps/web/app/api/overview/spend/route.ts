import { prisma } from "@tokonomics/db";
import { ok, unauthorized } from "@/lib/api-response";
import { redis, CacheKeys, CacheTTL } from "@/lib/redis";
import { getAuthContext } from "@/lib/auth";
import { Decimal } from "@prisma/client/runtime/library";

const VALID_PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof VALID_PERIODS)[number];

function periodDays(period: Period): number {
  return parseInt(period, 10);
}

export async function GET(req: Request): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30d";
  const period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : "30d";

  const cacheKey = CacheKeys.orgSpend(ctx.orgId, period);
  const cached = await redis.get(cacheKey);
  if (cached) return ok(cached);

  const days = periodDays(period);
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);
  periodStart.setHours(0, 0, 0, 0);

  const records = await prisma.providerUsageRecord.findMany({
    where: {
      orgId: ctx.orgId,
      date: { gte: periodStart },
    },
    select: {
      date: true,
      modelId: true,
      costUsd: true,
      requestCount: true,
      inputTokens: true,
      outputTokens: true,
      connection: { select: { provider: true } },
    },
    orderBy: { date: "asc" },
  });

  // Aggregate totals
  let totalSpend = new Decimal(0);
  const dailyMap = new Map<string, Decimal>();
  const modelMap = new Map<string, { cost: Decimal; calls: number }>();
  const providerMap = new Map<string, Decimal>();

  for (const r of records) {
    const dateStr = r.date.toISOString().slice(0, 10);
    totalSpend = totalSpend.add(r.costUsd);

    const dayTotal = dailyMap.get(dateStr) ?? new Decimal(0);
    dailyMap.set(dateStr, dayTotal.add(r.costUsd));

    const modelKey = r.modelId;
    const modelData = modelMap.get(modelKey) ?? { cost: new Decimal(0), calls: 0 };
    modelMap.set(modelKey, {
      cost: modelData.cost.add(r.costUsd),
      calls: modelData.calls + r.requestCount,
    });

    const providerKey = r.connection.provider;
    const provTotal = providerMap.get(providerKey) ?? new Decimal(0);
    providerMap.set(providerKey, provTotal.add(r.costUsd));
  }

  // Build daily series filling in zero days
  const dailySeries: { date: string; costUsd: string }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(periodStart);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    dailySeries.push({
      date: dateStr,
      costUsd: (dailyMap.get(dateStr) ?? new Decimal(0)).toFixed(2),
    });
  }

  // Projected monthly spend based on daily average
  const dailyAvg = days > 0 ? totalSpend.div(days) : new Decimal(0);
  const projectedMonthly = dailyAvg.mul(30);

  // Trend: compare last half vs first half of period
  const midpoint = Math.floor(days / 2);
  let firstHalf = new Decimal(0);
  let secondHalf = new Decimal(0);
  dailySeries.forEach((d, i) => {
    const cost = new Decimal(d.costUsd);
    if (i < midpoint) firstHalf = firstHalf.add(cost);
    else secondHalf = secondHalf.add(cost);
  });
  const trend =
    firstHalf.isZero()
      ? "+0.0%"
      : `${secondHalf.sub(firstHalf).div(firstHalf).mul(100).toFixed(1)}%`;

  const modelMix = Array.from(modelMap.entries())
    .sort(([, a], [, b]) => b.cost.cmp(a.cost))
    .map(([model, data]) => ({
      model,
      costUsd: data.cost.toFixed(2),
      pct: totalSpend.isZero()
        ? 0
        : parseFloat(data.cost.div(totalSpend).mul(100).toFixed(1)),
      calls: data.calls,
    }));

  const providerMix = Array.from(providerMap.entries())
    .sort(([, a], [, b]) => b.cmp(a))
    .map(([provider, cost]) => ({
      provider,
      costUsd: cost.toFixed(2),
      pct: totalSpend.isZero()
        ? 0
        : parseFloat(cost.div(totalSpend).mul(100).toFixed(1)),
    }));

  const result = {
    totalSpendUsd: totalSpend.toFixed(2),
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: new Date().toISOString().slice(0, 10),
    projectedMonthlyUsd: projectedMonthly.toFixed(2),
    trend,
    dailySeries,
    modelMix,
    providerMix,
  };

  await redis.set(cacheKey, result, { ex: CacheTTL.orgSpend });
  return ok(result);
}
