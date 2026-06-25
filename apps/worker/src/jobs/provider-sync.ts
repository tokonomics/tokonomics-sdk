import { prisma, Prisma } from "@tokonomics/db";
import type { LlmProvider } from "@tokonomics/shared";
import { decryptApiKey } from "@tokonomics/shared";
import type { Logger } from "pino";

type ProviderUsageDay = {
  date: Date;
  modelId: string;
  inputTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  costUsd: string;
  requestCount: number;
  rawResponse?: unknown;
};

// ─── OpenAI ──────────────────────────────────────────────────────────────────

async function fetchOpenAIUsage(
  apiKey: string,
  date: Date
): Promise<ProviderUsageDay[]> {
  const dateStr = date.toISOString().slice(0, 10);
  const res = await fetch(
    `https://api.openai.com/v1/usage?date=${dateStr}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`OpenAI usage API ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      snapshot_id: string;
      n_requests: number;
      n_context_tokens_total: number;
      n_generated_tokens_total: number;
      operation: string;
    }[];
  };

  const byModel = new Map<string, { input: number; output: number; calls: number }>();
  for (const entry of json.data ?? []) {
    const existing = byModel.get(entry.snapshot_id) ?? { input: 0, output: 0, calls: 0 };
    byModel.set(entry.snapshot_id, {
      input: existing.input + entry.n_context_tokens_total,
      output: existing.output + entry.n_generated_tokens_total,
      calls: existing.calls + entry.n_requests,
    });
  }

  return Array.from(byModel.entries()).map(([modelId, data]) => ({
    date,
    modelId,
    inputTokens: BigInt(data.input),
    outputTokens: BigInt(data.output),
    totalTokens: BigInt(data.input + data.output),
    costUsd: "0.000000", // cost recalculated server-side in Phase 1.4
    requestCount: data.calls,
    rawResponse: json,
  }));
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function fetchAnthropicUsage(
  apiKey: string,
  date: Date
): Promise<ProviderUsageDay[]> {
  const startTime = new Date(date);
  startTime.setHours(0, 0, 0, 0);
  const endTime = new Date(date);
  endTime.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
  });

  const res = await fetch(
    `https://api.anthropic.com/v1/usage/tokens?${params}`,
    {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!res.ok) throw new Error(`Anthropic usage API ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      model: string;
      input_tokens: number;
      output_tokens: number;
      request_count: number;
    }[];
  };

  return (json.data ?? []).map((entry) => ({
    date,
    modelId: entry.model,
    inputTokens: BigInt(entry.input_tokens),
    outputTokens: BigInt(entry.output_tokens),
    totalTokens: BigInt(entry.input_tokens + entry.output_tokens),
    costUsd: "0.000000",
    requestCount: entry.request_count,
    rawResponse: json,
  }));
}

// ─── Google (estimated from pricing) ─────────────────────────────────────────

async function fetchGoogleUsage(
  _apiKey: string,
  _date: Date
): Promise<ProviderUsageDay[]> {
  // TODO(agent): Google's usage API requires Cloud Billing setup.
  // For MVP, return empty and surface a warning on the connection.
  // Implement via Cloud Monitoring API in Phase 3.
  return [];
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

async function fetchUsageForProvider(
  provider: LlmProvider,
  apiKey: string,
  date: Date
): Promise<ProviderUsageDay[]> {
  if (provider === "OPENAI") return fetchOpenAIUsage(apiKey, date);
  if (provider === "ANTHROPIC") return fetchAnthropicUsage(apiKey, date);
  if (provider === "GOOGLE") return fetchGoogleUsage(apiKey, date);
  return [];
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncProviderConnection(
  connectionId: string,
  logger: Logger
): Promise<void> {
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      orgId: true,
      provider: true,
      encryptedKey: true,
      keyIv: true,
      keyAuthTag: true,
    },
  });

  if (!connection) {
    logger.warn({ connectionId }, "Provider connection not found");
    return;
  }

  const apiKey = decryptApiKey({
    encryptedValue: connection.encryptedKey,
    iv: connection.keyIv,
    authTag: connection.keyAuthTag,
  });

  // Sync last 3 days (catches any missed syncs)
  const today = new Date();
  const datesToSync = [0, 1, 2].map((offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  let totalSpend = 0;

  for (const date of datesToSync) {
    try {
      const records = await fetchUsageForProvider(connection.provider, apiKey, date);

      for (const record of records) {
        await prisma.providerUsageRecord.upsert({
          where: {
            connectionId_date_modelId: {
              connectionId: connection.id,
              date: record.date,
              modelId: record.modelId,
            },
          },
          update: {
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens,
            costUsd: record.costUsd,
            requestCount: record.requestCount,
          },
          create: {
            connectionId: connection.id,
            orgId: connection.orgId,
            date: record.date,
            modelId: record.modelId,
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens,
            costUsd: record.costUsd,
            requestCount: record.requestCount,
            rawResponse: record.rawResponse !== undefined
            ? (record.rawResponse as Prisma.InputJsonValue)
            : Prisma.DbNull,
          },
        });
        totalSpend += parseFloat(record.costUsd);
      }
    } catch (err: unknown) {
      logger.error({ connectionId, date, err }, "Failed to fetch usage for date");
    }
  }

  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: {
      lastSyncedAt: new Date(),
      lastSyncError: null,
      lastSpendUsd: totalSpend.toFixed(6),
      status: "CONNECTED",
    },
  });

  logger.info({ connectionId, totalSpend }, "Provider sync complete");
}

export async function syncAllProviderConnections(logger: Logger): Promise<void> {
  const connections = await prisma.providerConnection.findMany({
    where: { status: { not: "DISCONNECTED" } },
    select: { id: true, orgId: true },
    orderBy: { lastSyncedAt: "asc" },
    take: 100,
  });

  logger.info({ count: connections.length }, "Starting provider sync batch");

  for (const conn of connections) {
    try {
      await syncProviderConnection(conn.id, logger);
    } catch (err: unknown) {
      logger.error({ connectionId: conn.id, orgId: conn.orgId, err }, "Provider sync failed");
      await prisma.providerConnection.update({
        where: { id: conn.id },
        data: {
          status: "ERROR",
          lastSyncError: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }
  }
}
