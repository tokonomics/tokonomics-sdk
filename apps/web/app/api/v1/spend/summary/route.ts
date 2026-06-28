import { prisma } from "@tokonomics/db";
import { NextResponse } from "next/server";
import { authenticatePublicApi } from "@/lib/public-api-auth";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await authenticatePublicApi(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const agg = await prisma.providerUsageRecord.aggregate({
    where: { orgId: ctx.orgId, date: { gte: thirtyDaysAgo } },
    _sum: { costUsd: true, requestCount: true },
  });

  return NextResponse.json({
    data: {
      period: "30d",
      totalSpendUsd: agg._sum.costUsd?.toString() ?? "0",
      totalRequests: agg._sum.requestCount ?? 0,
    },
    meta: { timestamp: new Date().toISOString() },
  });
}
