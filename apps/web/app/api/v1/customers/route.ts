import { prisma } from "@tokonomics/db";
import { NextResponse } from "next/server";
import { authenticatePublicApi } from "@/lib/public-api-auth";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await authenticatePublicApi(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));

  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const aggregates = await prisma.dailyCustomerAggregate.groupBy({
    by: ["customerId"],
    where: { orgId: ctx.orgId, date: { gte: monthStart } },
    _sum: { totalCostUsd: true, requestCount: true },
    orderBy: { _sum: { totalCostUsd: "desc" } },
    take: limit,
  });

  const customers = await prisma.customer.findMany({
    where: { id: { in: aggregates.map((a) => a.customerId) }, orgId: ctx.orgId },
    select: { id: true, externalId: true, displayName: true, email: true },
  });
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return NextResponse.json({
    data: aggregates.map((a) => ({
      ...customerMap.get(a.customerId),
      monthlySpendUsd: a._sum.totalCostUsd?.toString() ?? "0",
      requestCount: a._sum.requestCount ?? 0,
    })),
    meta: { timestamp: new Date().toISOString() },
  });
}
