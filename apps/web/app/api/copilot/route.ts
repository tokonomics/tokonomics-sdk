import { prisma } from "@tokonomics/db";
import { decryptApiKey } from "@tokonomics/shared";
import { ok, err, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

export async function POST(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    // Get Anthropic connection for this org
    const anthropicConn = await prisma.providerConnection.findFirst({
      where: { orgId: ctx.orgId, provider: "ANTHROPIC", status: "CONNECTED" },
      select: { encryptedKey: true, keyIv: true, keyAuthTag: true },
    });

    if (!anthropicConn) {
      return err("NOT_FOUND", "Connect an Anthropic API key first to use the Copilot", 404);
    }

    // Decrypt key server-side — NEVER returned to client
    const apiKey = decryptApiKey({
      encryptedValue: anthropicConn.encryptedKey,
      iv: anthropicConn.keyIv,
      authTag: anthropicConn.keyAuthTag,
    });

    // Gather margin context
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const customers = await prisma.customer.findMany({
      where: { orgId: ctx.orgId, deletedAt: null, manualMrr: { not: null } },
      select: { id: true, externalId: true, manualMrr: true },
    });

    const aggregates = await prisma.dailyCustomerAggregate.groupBy({
      by: ["customerId"],
      where: { orgId: ctx.orgId, date: { gte: monthStart } },
      _sum: { totalCostUsd: true },
    });
    const costMap = new Map(aggregates.map((a) => [a.customerId, parseFloat(a._sum.totalCostUsd?.toString() ?? "0")]));

    const marginData = customers.map((c) => {
      const mrr = parseFloat(c.manualMrr!.toString());
      const cost = costMap.get(c.id) ?? 0;
      const margin = mrr > 0 ? ((mrr - cost) / mrr) * 100 : -100;
      return { externalId: c.externalId, mrr, cost, marginPct: Math.round(margin * 10) / 10 };
    }).sort((a, b) => a.marginPct - b.marginPct);

    const latestScore = await prisma.orgMarginScore.findFirst({
      where: { orgId: ctx.orgId },
      orderBy: { date: "desc" },
      select: { score: true },
    });

    const unprofitable = marginData.filter((c) => c.marginPct < 0);
    const watching = marginData.filter((c) => c.marginPct >= 0 && c.marginPct < 60);

    const prompt = `You are an AI margin advisor for an AI SaaS company. Analyze this data and give 3 specific, actionable recommendations to improve gross margins.

BUSINESS CONTEXT:
- AI Margin Score: ${latestScore?.score ?? "N/A"}/100
- Customers tracked: ${marginData.length}
- Unprofitable customers (negative margin): ${unprofitable.length}
- Watch list customers (0-60% margin): ${watching.length}

WORST PERFORMING CUSTOMERS (anonymized):
${marginData.slice(0, 3).map((c, i) => `${i + 1}. Customer: MRR $${c.mrr.toFixed(0)}, LLM cost $${c.cost.toFixed(2)}/mo, Margin: ${c.marginPct}%`).join("\n")}

OVERALL:
- Total MRR: $${marginData.reduce((s, c) => s + c.mrr, 0).toFixed(0)}/mo
- Total LLM cost: $${marginData.reduce((s, c) => s + c.cost, 0).toFixed(2)}/mo

Give exactly 3 recommendations. Format each as:
RECOMMENDATION 1: [Title]
[2-3 sentences of specific action to take]

RECOMMENDATION 2: [Title]
[2-3 sentences]

RECOMMENDATION 3: [Title]
[2-3 sentences]

Be specific about numbers and actions. No generic advice.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return err("INTERNAL_ERROR", `Anthropic API error: ${response.status} — ${errBody.slice(0, 200)}`, 500);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content.find((b) => b.type === "text")?.text ?? "";

    // Parse recommendations
    const recs = text
      .split(/RECOMMENDATION \d+:/i)
      .filter((s) => s.trim())
      .map((s) => {
        const lines = s.trim().split("\n").filter((l) => l.trim());
        return { title: lines[0]?.trim() ?? "", body: lines.slice(1).join(" ").trim() };
      })
      .slice(0, 3);

    return ok({
      recommendations: recs,
      context: {
        marginScore: latestScore?.score ?? null,
        unprofitableCount: unprofitable.length,
        watchCount: watching.length,
        totalCustomers: marginData.length,
      },
      tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
    });
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
