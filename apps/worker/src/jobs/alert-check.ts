import { prisma } from "@tokonomics/db";
import type { Logger } from "pino";

type SpikeCheckResult = {
  shouldAlert: boolean;
  alertType: "SPEND_SPIKE";
  todaySpend: string;
  sevenDayAvg: string;
};

export function checkSpendSpike(params: {
  todaySpend: string;
  sevenDayAvg: string;
  threshold: number;
}): SpikeCheckResult {
  const today = parseFloat(params.todaySpend);
  const avg = parseFloat(params.sevenDayAvg);

  // Never alert if 7-day avg is zero (new org, avoids day-1 false alarms)
  const shouldAlert = avg > 0 && today > params.threshold * avg;

  return {
    shouldAlert,
    alertType: "SPEND_SPIKE",
    todaySpend: params.todaySpend,
    sevenDayAvg: params.sevenDayAvg,
  };
}

export async function runAlertCheck(logger: Logger): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  logger.info({ count: orgs.length }, "Running alert check");

  for (const org of orgs) {
    try {
      await checkOrgAlerts(org.id, logger);
    } catch (err: unknown) {
      logger.error({ orgId: org.id, err }, "Alert check failed for org");
    }
  }
}

async function checkOrgAlerts(orgId: string, logger: Logger): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  // Today's spend
  const todayRecords = await prisma.providerUsageRecord.aggregate({
    where: { orgId, date: today },
    _sum: { costUsd: true },
  });
  const todaySpend = todayRecords._sum.costUsd?.toNumber() ?? 0;

  // 7-day rolling average
  const weekRecords = await prisma.providerUsageRecord.aggregate({
    where: { orgId, date: { gte: sevenDaysAgo, lt: today } },
    _sum: { costUsd: true },
  });
  const weekTotal = weekRecords._sum.costUsd?.toNumber() ?? 0;
  const sevenDayAvg = weekTotal / 7;

  const spike = checkSpendSpike({
    todaySpend: todaySpend.toFixed(6),
    sevenDayAvg: sevenDayAvg.toFixed(6),
    threshold: 2.0,
  });

  if (!spike.shouldAlert) return;

  // Check if alert already fired today (avoid re-alerting)
  const existingAlert = await prisma.alert.findFirst({
    where: {
      orgId,
      alertType: "SPEND_SPIKE",
      createdAt: { gte: today },
    },
  });
  if (existingAlert) return;

  await prisma.alert.create({
    data: {
      orgId,
      alertType: "SPEND_SPIKE",
      severity: "WARNING",
      title: "Spend spike detected",
      body: `Today's spend ($${todaySpend.toFixed(2)}) is over 2× the 7-day average ($${sevenDayAvg.toFixed(2)}).`,
      metadata: {
        todaySpend: spike.todaySpend,
        sevenDayAvg: spike.sevenDayAvg,
        threshold: 2.0,
      },
      notifiedVia: [],
    },
  });

  logger.info({ orgId, todaySpend, sevenDayAvg }, "Spend spike alert created");

  // TODO(agent): Send email via Resend in Phase 1.5 — requires RESEND_API_KEY
  // and SpendSpikeAlert email template (apps/email-templates/src/SpendSpikeAlert.tsx)
}
