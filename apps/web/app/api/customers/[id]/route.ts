import { prisma } from "@tokonomics/db";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized, notFound } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getRedis, CacheKeys } from "@/lib/redis";

type Params = { params: { id: string } };

const patchSchema = z.object({
  displayName: z.string().max(200).optional(),
  email: z.string().email().optional().nullable(),
  manualMrr: z.number().nonnegative().optional().nullable(),
});

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, orgId: ctx.orgId, deletedAt: null },
      select: { id: true, externalId: true, displayName: true, email: true, manualMrr: true },
    });
    if (!customer) return notFound("Customer");

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const aggregates = await prisma.dailyCustomerAggregate.findMany({
      where: { customerId: params.id, orgId: ctx.orgId, date: { gte: monthStart } },
      select: { date: true, totalCostUsd: true, requestCount: true, modelBreakdown: true, featureBreakdown: true },
      orderBy: { date: "asc" },
    });

    const totalCost = aggregates.reduce((s, a) => s + parseFloat(a.totalCostUsd.toString()), 0);

    const budgetRules = await prisma.budgetRule.findMany({
      where: { orgId: ctx.orgId, customerId: params.id, isActive: true },
      select: { id: true, ruleType: true, limitUsd: true, alertAtPct: true, circuitBreak: true },
    });

    return ok({
      ...customer,
      manualMrr: customer.manualMrr?.toString() ?? null,
      totalCostUsd: totalCost.toFixed(6),
      dailySeries: aggregates.map((a) => ({
        date: a.date.toISOString().slice(0, 10),
        costUsd: parseFloat(a.totalCostUsd.toString()).toFixed(6),
        requestCount: a.requestCount,
      })),
      budgetRules: budgetRules.map((r) => ({ ...r, limitUsd: r.limitUsd.toString() })),
    });
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const customer = await prisma.customer.findFirst({
      where: { id: params.id, orgId: ctx.orgId, deletedAt: null },
    });
    if (!customer) return notFound("Customer");

    let body: unknown;
    try { body = await req.json(); } catch { return err("VALIDATION_ERROR", "Invalid JSON"); }

    let input;
    try { input = patchSchema.parse(body); } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    const updated = await prisma.customer.update({
      where: { id: params.id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.manualMrr !== undefined
          ? { manualMrr: input.manualMrr !== null ? input.manualMrr.toString() : null }
          : {}),
      },
      select: { id: true, externalId: true, displayName: true, email: true, manualMrr: true },
    });

    // Invalidate margin + customer list caches so next load reflects new MRR
    await Promise.all([
      getRedis().del(`margin:org:${ctx.orgId}`),
      getRedis().del(CacheKeys.customers(ctx.orgId)),
    ]).catch(() => {}); // non-fatal

    return ok({ ...updated, manualMrr: updated.manualMrr?.toString() ?? null });
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
