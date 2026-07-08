import { prisma } from "@tokonomics/db";
import { ok, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { calculateGrossMargin } from "@tokonomics/shared";

const MARGIN_TTL = 60; // 60s — short TTL because users edit MRR inline
const marginCacheKey = (orgId: string) => `margin:org:${orgId}`;

export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const cached = await getRedis().get(marginCacheKey(ctx.orgId));
    if (cached) return ok(cached);

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    // Customers with manual MRR
    const customers = await prisma.customer.findMany({
      where: { orgId: ctx.orgId, deletedAt: null, manualMrr: { not: null } },
      select: { id: true, externalId: true, displayName: true, manualMrr: true },
    });

    const aggregates = await prisma.dailyCustomerAggregate.groupBy({
      by: ["customerId"],
      where: { orgId: ctx.orgId, date: { gte: monthStart } },
      _sum: { totalCostUsd: true },
    });
    const costMap = new Map(aggregates.map((a) => [a.customerId, parseFloat(a._sum.totalCostUsd?.toString() ?? "0")]));

    let totalMrrCents = 0;
    let totalCostUsd = 0;
    let healthyCount = 0, watchCount = 0, unprofitableCount = 0, losingCount = 0;

    const customerRows = customers.map((c) => {
      const mrrUsd = parseFloat(c.manualMrr!.toString());
      const mrrCents = Math.round(mrrUsd * 100);
      const llmCostUsd = (costMap.get(c.id) ?? 0).toFixed(6);
      const { grossMarginPct, status } = calculateGrossMargin({ mrrCents, llmCostUsd });

      totalMrrCents += mrrCents;
      totalCostUsd += parseFloat(llmCostUsd);
      if (status === "HEALTHY") healthyCount++;
      else if (status === "WATCH") watchCount++;
      else if (status === "UNPROFITABLE") unprofitableCount++;
      else losingCount++;

      return {
        id: c.id,
        externalId: c.externalId,
        displayName: c.displayName,
        mrrCents,
        llmCostUsd,
        grossMarginPct: grossMarginPct.toFixed(2),
        status,
      };
    }).sort((a, b) => parseFloat(a.grossMarginPct) - parseFloat(b.grossMarginPct));

    const totalMrrUsd = totalMrrCents / 100;
    const orgMarginPct = totalMrrUsd > 0 ? ((totalMrrUsd - totalCostUsd) / totalMrrUsd) * 100 : 0;

    const latestScore = await prisma.orgMarginScore.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: { date: "desc" },
      select: { score: true, date: true },
    });

    const scoreHistory = await prisma.orgMarginScore.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { date: "asc" },
      take: 30,
      select: { date: true, score: true },
    });

    const result = {
      orgMarginPct: orgMarginPct.toFixed(2),
      totalMrrUsd: totalMrrUsd.toFixed(2),
      totalCostUsd: totalCostUsd.toFixed(2),
      marginScore: latestScore?.score ?? null,
      scoreHistory: scoreHistory.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        score: s.score,
      })),
      statusCounts: { healthy: healthyCount, watch: watchCount, unprofitable: unprofitableCount, losing: losingCount },
      customers: customerRows,
    };

    await getRedis().set(marginCacheKey(ctx.orgId), result, { ex: MARGIN_TTL });
    return ok(result);
  } catch (e: unknown) {
    return ok({ orgMarginPct: "0", totalMrrUsd: "0", totalCostUsd: "0", marginScore: null, scoreHistory: [], statusCounts: { healthy: 0, watch: 0, unprofitable: 0, losing: 0 }, customers: [] });
  }
}
