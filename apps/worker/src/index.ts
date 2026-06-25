import { createServer } from "http";
import { Queue, Worker } from "bullmq";
import pino from "pino";
import { syncAllProviderConnections } from "./jobs/provider-sync.js";
import { runAlertCheck } from "./jobs/alert-check.js";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  ...(process.env["NODE_ENV"] === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

function parseRedisConnection(): {
  host: string;
  port: number;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
} {
  const url =
    process.env["UPSTASH_REDIS_URL"] ??
    process.env["REDIS_URL"] ??
    "redis://localhost:6379";

  try {
    const parsed = new URL(url);
    const isSecure = parsed.protocol === "rediss:";
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || (isSecure ? "6380" : "6379"), 10),
      ...(parsed.password ? { password: parsed.password } : {}),
      ...(isSecure ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  } catch {
    logger.warn("Invalid Redis URL, falling back to localhost");
    return { host: "localhost", port: 6379, maxRetriesPerRequest: null, enableReadyCheck: false };
  }
}

const connection = parseRedisConnection();

export const queues = {
  providerSync: new Queue("provider-sync", { connection }),
  alerts: new Queue("alerts", { connection }),
  calculations: new Queue("calculations", { connection }),
  digest: new Queue("digest", { connection }),
  maintenance: new Queue("maintenance", { connection }),
} as const;

async function bootstrap(): Promise<void> {
  // ─── Cron: provider sync every 15 min (free) ───────────────────────────────
  await queues.providerSync.upsertJobScheduler(
    "provider-sync-cron",
    { pattern: "*/15 * * * *" },
    { name: "sync-all", data: {} }
  );

  // ─── Cron: alert check every 5 min ─────────────────────────────────────────
  await queues.alerts.upsertJobScheduler(
    "alert-check-cron",
    { pattern: "*/5 * * * *" },
    { name: "check-all", data: {} }
  );

  logger.info("Cron schedules registered");
}

bootstrap().catch((err: unknown) => {
  logger.error({ err }, "Worker bootstrap failed");
  process.exit(1);
});

// ─── Workers ──────────────────────────────────────────────────────────────────
new Worker(
  "provider-sync",
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "Running provider sync");
    await syncAllProviderConnections(logger);
  },
  { connection, concurrency: 1 }
);

new Worker(
  "alerts",
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, "Running alert check");
    await runAlertCheck(logger);
  },
  { connection, concurrency: 1 }
);

// ─── Health check HTTP endpoint ───────────────────────────────────────────────
const PORT = parseInt(process.env["PORT"] ?? "3002", 10);

const healthServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ status: "ok", service: "worker", timestamp: new Date().toISOString() })
  );
});

healthServer.listen(PORT, () => {
  logger.info({ port: PORT }, "Worker health server listening");
});

logger.info("Worker bootstrap complete — provider-sync and alert-check crons registered");

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const signals = ["SIGINT", "SIGTERM"] as const;
for (const signal of signals) {
  process.on(signal, async () => {
    logger.info({ signal }, "Shutting down worker");
    for (const queue of Object.values(queues)) {
      await queue.close();
    }
    healthServer.close();
    process.exit(0);
  });
}
