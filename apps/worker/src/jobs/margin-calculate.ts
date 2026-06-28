import { prisma } from "@tokonomics/db";
import { calculateGrossMargin, calculateMarginScore } from "@tokonomics/shared";
import type { Logger } from "pino";

export async function runMarginCalculation(logger: Logger): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  for (const org of orgs) {
    try {
      await calculateOrgMargins(org.id, logger);
    } catch (err: unknown) {
      logger.error({ orgId: org.id, err }, "Margin calculation failed for org");
    }
  }
}

async function calculateOrgMargins(orgId: string, logger: Logger): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Get customers with manual MRR set
  const customers = await prisma.customer.findMany({
    where: { orgId, deletedAt: null, manualMrr: { not: null } },
    select: { id: true, externalId: true, manualMrr: true },
  });

  if (customers.length === 0) return;

  // Get monthly costs
  const aggregates = await prisma.dailyCustomerAggregate.groupBy({
    by: ["customerId"],
    where: { orgId, date: { gte: monthStart } },
    _sum: { totalCostUsd: true },
  });

  const costMap = new Map(
    aggregates.map((a) => [a.customerId, a._sum.totalCostUsd?.toString() ?? "0"])
  );

  const marginInputs: { mrrCents: number; llmCostUsd: string }[] = [];

  for (const customer of customers) {
    const mrrUsd = parseFloat(customer.manualMrr!.toString());
    const mrrCents = Math.round(mrrUsd * 100);
    const llmCostUsd = costMap.get(customer.id) ?? "0";

    const { grossMarginPct, status } = calculateGrossMargin({ mrrCents, llmCostUsd });

    await prisma.customerMarginSnapshot.upsert({
      where: { orgId_customerId_date: { orgId, customerId: customer.id, date: today } },
      update: { mrrCents, llmCostUsd, grossMarginPct: grossMarginPct.toFixed(4), status },
      create: {
        orgId,
        customerId: customer.id,
        date: today,
        mrrCents,
        llmCostUsd,
        grossMarginPct: grossMarginPct.toFixed(4),
        status,
      },
    });

    marginInputs.push({ mrrCents, llmCostUsd });
  }

  // Calculate org-level margin score
  const last30 = await prisma.orgMarginScore.findMany({
    where: { orgId },
    orderBy: { date: "desc" },
    take: 30,
    select: { score: true },
  });
  const history = last30.map((s) => s.score).reverse();

  const score = calculateMarginScore({ customers: marginInputs, marginHistory: history });

  await prisma.orgMarginScore.upsert({
    where: { orgId_date: { orgId, date: today } },
    update: { score, baseScore: Math.round((score * 40) / 100), concentration: 0, wasteScore: 0, pricingFit: 0, trendBonus: 0, components: {} },
    create: {
      orgId,
      date: today,
      score,
      baseScore: Math.round((score * 40) / 100),
      concentration: 0,
      wasteScore: 0,
      pricingFit: 0,
      trendBonus: 0,
      components: { score },
    },
  });

  logger.info({ orgId, score, customerCount: customers.length }, "Margin calculated");
}
