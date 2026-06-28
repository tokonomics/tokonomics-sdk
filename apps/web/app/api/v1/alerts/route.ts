import { prisma } from "@tokonomics/db";
import { NextResponse } from "next/server";
import { authenticatePublicApi } from "@/lib/public-api-auth";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await authenticatePublicApi(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const alerts = await prisma.alert.findMany({
    where: { orgId: ctx.orgId, isRead: false },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, alertType: true, severity: true,
      title: true, body: true, createdAt: true, metadata: true,
    },
  });

  return NextResponse.json({
    data: alerts,
    meta: { total: alerts.length, timestamp: new Date().toISOString() },
  });
}
