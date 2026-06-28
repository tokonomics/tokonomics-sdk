import { prisma } from "@tokonomics/db";
import { NextResponse } from "next/server";
import { authenticatePublicApi } from "@/lib/public-api-auth";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await authenticatePublicApi(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latest = await prisma.orgMarginScore.findFirst({
    where: { orgId: ctx.orgId },
    orderBy: { date: "desc" },
    select: { score: true, date: true, components: true },
  });

  return NextResponse.json({
    data: latest ? { score: latest.score, date: latest.date, components: latest.components } : null,
    meta: { timestamp: new Date().toISOString() },
  });
}
