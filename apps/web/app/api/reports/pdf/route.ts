import { prisma } from "@tokonomics/db";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { calculateGrossMargin } from "@tokonomics/shared";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "30d";

    const days = period === "90d" ? 90 : period === "qtd" ? 91 : period === "ytd" ? 365 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, plan: true },
    });

    const customers = await prisma.customer.findMany({
      where: { orgId: ctx.orgId, deletedAt: null },
      select: { id: true, externalId: true, displayName: true, manualMrr: true },
    });

    const aggregates = await prisma.dailyCustomerAggregate.groupBy({
      by: ["customerId"],
      where: { orgId: ctx.orgId, date: { gte: monthStart } },
      _sum: { totalCostUsd: true, requestCount: true },
    });
    const costMap = new Map(aggregates.map((a) => [a.customerId, parseFloat(a._sum.totalCostUsd?.toString() ?? "0")]));

    const totalSpend = await prisma.providerUsageRecord.aggregate({
      where: { orgId: ctx.orgId, date: { gte: since } },
      _sum: { costUsd: true },
    });

    const marginScore = await prisma.orgMarginScore.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: { date: "desc" },
      select: { score: true },
    });

    let totalMrr = 0;
    let totalCost = 0;
    const customerRows = customers
      .filter((c) => c.manualMrr)
      .map((c) => {
        const mrr = parseFloat(c.manualMrr!.toString());
        const cost = costMap.get(c.id) ?? 0;
        const { grossMarginPct, status } = calculateGrossMargin({ mrrCents: Math.round(mrr * 100), llmCostUsd: cost.toFixed(6) });
        totalMrr += mrr;
        totalCost += cost;
        return { externalId: c.externalId, displayName: c.displayName, mrr, cost, grossMarginPct: grossMarginPct.toFixed(1), status };
      })
      .sort((a, b) => parseFloat(a.grossMarginPct) - parseFloat(b.grossMarginPct));

    const orgMargin = totalMrr > 0 ? (((totalMrr - totalCost) / totalMrr) * 100).toFixed(1) : "N/A";

    // Return JSON — the /reports page renders this as a printable HTML page
    return NextResponse.json({
      data: {
        org: org?.name ?? "Organization",
        generatedAt: new Date().toISOString(),
        period,
        marginScore: marginScore?.score ?? null,
        totalMrrUsd: totalMrr.toFixed(2),
        totalCostUsd: totalCost.toFixed(2),
        orgMarginPct: orgMargin,
        totalSpendUsd: parseFloat(totalSpend._sum.costUsd?.toString() ?? "0").toFixed(2),
        customers: customerRows,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
