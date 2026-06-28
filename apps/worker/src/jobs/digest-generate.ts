import { prisma } from "@tokonomics/db";
import { Redis } from "@upstash/redis";
import type { Logger } from "pino";

function getRedis(): Redis {
  return new Redis({
    url: process.env["UPSTASH_REDIS_REST_URL"]!,
    token: process.env["UPSTASH_REDIS_REST_TOKEN"]!,
  });
}

export async function generateWeeklyDigests(logger: Logger): Promise<void> {
  const now = new Date();
  // Only run on Mondays (day 1) at 7am UTC
  if (now.getUTCDay() !== 1 || now.getUTCHours() !== 7) {
    // Check if we're within the 30-min window
    if (now.getUTCDay() !== 1 || now.getUTCHours() !== 7) return;
  }

  const digestSettings = await prisma.weeklyDigestSettings.findMany({
    where: { isEnabled: true },
    include: { org: { select: { id: true, name: true } } },
  });

  logger.info({ count: digestSettings.length }, "Generating weekly digests");

  for (const settings of digestSettings) {
    try {
      await generateOrgDigest(settings.orgId, settings.org.name, settings, logger);
    } catch (err: unknown) {
      logger.error({ orgId: settings.orgId, err }, "Weekly digest failed");
    }
  }
}

async function generateOrgDigest(
  orgId: string,
  orgName: string,
  settings: { recipientEmails: string[]; sendSlack: boolean; sendEmail: boolean },
  logger: Logger
): Promise<void> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Biggest cost spikes this week
  const costLeaders = await prisma.dailyCustomerAggregate.groupBy({
    by: ["customerId"],
    where: { orgId, date: { gte: weekAgo } },
    _sum: { totalCostUsd: true },
    orderBy: { _sum: { totalCostUsd: "desc" } },
    take: 5,
  });

  // Week total spend
  const weekTotal = await prisma.dailyCustomerAggregate.aggregate({
    where: { orgId, date: { gte: weekAgo } },
    _sum: { totalCostUsd: true, requestCount: true },
  });

  // Customers that triggered alerts
  const alertCount = await prisma.alert.count({
    where: { orgId, createdAt: { gte: weekAgo } },
  });

  const digest = {
    orgName,
    weekTotal: parseFloat(weekTotal._sum.totalCostUsd?.toString() ?? "0").toFixed(2),
    requestCount: weekTotal._sum.requestCount ?? 0,
    alertCount,
    topCustomers: costLeaders.length,
    dashboardUrl: "https://app.tokonomics.dev/overview",
  };

  // Send to Slack if connected
  if (settings.sendSlack) {
    const slackConn = await prisma.slackConnection.findFirst({
      where: { orgId, isActive: true },
      select: { webhookUrl: true, webhookIv: true, webhookAuthTag: true },
    });

    if (slackConn) {
      try {
        const { decryptApiKey } = await import("@tokonomics/shared");
        const url = decryptApiKey({
          encryptedValue: slackConn.webhookUrl,
          iv: slackConn.webhookIv,
          authTag: slackConn.webhookAuthTag,
        });

        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `📊 *Weekly AI Spend Digest — ${orgName}*\n>Total spend: $${digest.weekTotal} | Requests: ${digest.requestCount} | Alerts fired: ${alertCount}\n<${digest.dashboardUrl}|View dashboard →>`,
          }),
        });
      } catch (err: unknown) {
        logger.error({ orgId, err }, "Failed to send Slack digest");
      }
    }
  }

  // Mark digest as sent
  await prisma.weeklyDigestSettings.update({
    where: { orgId },
    data: { lastSentAt: new Date() },
  });

  logger.info({ orgId, weekTotal: digest.weekTotal }, "Weekly digest sent");
}
