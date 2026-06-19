import { createServer } from "http";
import { Queue } from "bullmq";
import pino from "pino";

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

// Queue definitions — jobs registered incrementally in Phase 1+
export const queues = {
  providerSync: new Queue("provider-sync", { connection }),
  calculations: new Queue("calculations", { connection }),
  alerts: new Queue("alerts", { connection }),
  digest: new Queue("digest", { connection }),
  maintenance: new Queue("maintenance", { connection }),
} as const;

// Health check endpoint (Railway requires it)
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

logger.info("Worker bootstrap complete. Waiting for jobs...");

// Phase 1+: Register job processors here
// import { providerSyncProcessor } from "./jobs/provider-sync.js";
// new Worker("provider-sync", providerSyncProcessor, { connection, concurrency: 10 });

// Graceful shutdown
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
