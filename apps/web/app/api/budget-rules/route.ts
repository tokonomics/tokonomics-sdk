import { prisma } from "@tokonomics/db";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

const createSchema = z.object({
  customerId: z.string().optional(),
  feature: z.string().max(100).optional(),
  ruleType: z.enum(["DAILY", "MONTHLY"]),
  limitUsd: z.number().positive(),
  alertAtPct: z.number().int().min(1).max(100).default(80),
  circuitBreak: z.boolean().default(false),
});

export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const rules = await prisma.budgetRule.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: {
        id: true,
        customerId: true,
        feature: true,
        ruleType: true,
        limitUsd: true,
        alertAtPct: true,
        circuitBreak: true,
        createdAt: true,
        customer: { select: { externalId: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return ok(
      rules.map((r) => ({
        ...r,
        limitUsd: r.limitUsd.toString(),
      }))
    );
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    let body: unknown;
    try { body = await req.json(); } catch { return err("VALIDATION_ERROR", "Invalid JSON"); }

    let input;
    try { input = createSchema.parse(body); } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    const rule = await prisma.budgetRule.create({
      data: {
        orgId: ctx.orgId,
        customerId: input.customerId ?? null,
        feature: input.feature ?? null,
        ruleType: input.ruleType,
        limitUsd: input.limitUsd.toString(),
        alertAtPct: input.alertAtPct,
        circuitBreak: input.circuitBreak,
      },
      select: { id: true, ruleType: true, limitUsd: true, alertAtPct: true, circuitBreak: true },
    });

    return ok({ ...rule, limitUsd: rule.limitUsd.toString() }, 201);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
