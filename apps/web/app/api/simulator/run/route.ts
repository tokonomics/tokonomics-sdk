import { prisma } from "@tokonomics/db";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

const simSchema = z.object({
  name: z.string().min(1).max(100),
  mode: z.enum(["FLAT", "USAGE_BASED", "TIERED"]),
  basePriceUsd: z.number().nonnegative().default(0),
  pricePerMillionTokens: z.number().nonnegative().default(0),
  fairUseLimitTokens: z.number().nonnegative().default(0),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    let body: unknown;
    try { body = await req.json(); } catch { return err("VALIDATION_ERROR", "Invalid JSON"); }

    let input;
    try { input = simSchema.parse(body); } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const customers = await prisma.customer.findMany({
      where: { orgId: ctx.orgId, deletedAt: null },
      select: { id: true, externalId: true, displayName: true, manualMrr: true },
    });

    const aggregates = await prisma.dailyCustomerAggregate.groupBy({
      by: ["customerId"],
      where: { orgId: ctx.orgId, date: { gte: monthStart } },
      _sum: { totalCostUsd: true, inputTokens: true, outputTokens: true },
    });
    const aggMap = new Map(aggregates.map((a) => [a.customerId, a]));

    const customerImpact = customers
      .map((c) => {
        const agg = aggMap.get(c.id);
        const tokens = Number(agg?._sum.inputTokens ?? 0) + Number(agg?._sum.outputTokens ?? 0);
        const currentCost = parseFloat(agg?._sum.totalCostUsd?.toString() ?? "0");
        const currentMrr = c.manualMrr ? parseFloat(c.manualMrr.toString()) : 0;

        let simulatedMrr = 0;
        if (input.mode === "FLAT") {
          simulatedMrr = input.basePriceUsd;
        } else if (input.mode === "USAGE_BASED") {
          const overageTokens = Math.max(0, tokens - input.fairUseLimitTokens);
          simulatedMrr = input.basePriceUsd + (overageTokens / 1_000_000) * input.pricePerMillionTokens;
        } else if (input.mode === "TIERED") {
          simulatedMrr = input.basePriceUsd + (tokens / 1_000_000) * input.pricePerMillionTokens;
        }

        const newMargin = simulatedMrr > 0 ? ((simulatedMrr - currentCost) / simulatedMrr) * 100 : 0;
        const currentMargin = currentMrr > 0 ? ((currentMrr - currentCost) / currentMrr) * 100 : 0;

        return {
          externalId: c.externalId,
          displayName: c.displayName,
          tokens,
          currentMrr: currentMrr.toFixed(2),
          simulatedMrr: simulatedMrr.toFixed(2),
          currentCost: currentCost.toFixed(4),
          currentMarginPct: currentMargin.toFixed(1),
          simulatedMarginPct: newMargin.toFixed(1),
          mrrDelta: (simulatedMrr - currentMrr).toFixed(2),
        };
      })
      .filter((c) => parseInt(c.tokens.toString()) > 0)
      .sort((a, b) => parseFloat(b.simulatedMrr) - parseFloat(a.simulatedMrr));

    const totalCurrentMrr = customerImpact.reduce((s, c) => s + parseFloat(c.currentMrr), 0);
    const totalSimulatedMrr = customerImpact.reduce((s, c) => s + parseFloat(c.simulatedMrr), 0);
    const totalCost = customerImpact.reduce((s, c) => s + parseFloat(c.currentCost), 0);

    const results = {
      mode: input.mode,
      totalCurrentMrr: totalCurrentMrr.toFixed(2),
      totalSimulatedMrr: totalSimulatedMrr.toFixed(2),
      mrrLiftPct: totalCurrentMrr > 0
        ? (((totalSimulatedMrr - totalCurrentMrr) / totalCurrentMrr) * 100).toFixed(1)
        : "0",
      currentMarginPct: totalCurrentMrr > 0
        ? (((totalCurrentMrr - totalCost) / totalCurrentMrr) * 100).toFixed(1)
        : "0",
      simulatedMarginPct: totalSimulatedMrr > 0
        ? (((totalSimulatedMrr - totalCost) / totalSimulatedMrr) * 100).toFixed(1)
        : "0",
      customerImpact,
    };

    // Save simulation
    await prisma.pricingSimulation.create({
      data: {
        orgId: ctx.orgId,
        name: input.name,
        config: { mode: input.mode, basePriceUsd: input.basePriceUsd, pricePerMillionTokens: input.pricePerMillionTokens, fairUseLimitTokens: input.fairUseLimitTokens },
        results,
      },
    });

    return ok(results, 201);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
