import { createServer } from "http";
import pino from "pino";
import { syncAllProviderConnections } from "./jobs/provider-sync.js";
import { runAlertCheck } from "./jobs/alert-check.js";
import { aggregateDirtyCustomers } from "./jobs/aggregate-customers.js";
import { runMarginCalculation } from "./jobs/margin-calculate.js";
import { generateWeeklyDigests } from "./jobs/digest-generate.js";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  ...(process.env["NODE_ENV"] === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

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

// ─── Periodic jobs via setInterval (no native Redis needed) ───────────────────

// Aggregate dirty customers every 30 seconds
setInterval(() => {
  aggregateDirtyCustomers(logger).catch((err: unknown) => {
    logger.error({ err }, "Customer aggregation error");
  });
}, 30_000);

// Sync provider connections every 15 minutes
setInterval(() => {
  syncAllProviderConnections(logger).catch((err: unknown) => {
    logger.error({ err }, "Provider sync error");
  });
}, 15 * 60 * 1_000);

// Check spend spike alerts every 5 minutes
setInterval(() => {
  runAlertCheck(logger).catch((err: unknown) => {
    logger.error({ err }, "Alert check error");
  });
}, 5 * 60 * 1_000);

// Calculate margin scores every 15 minutes (after aggregation)
setInterval(() => {
  runMarginCalculation(logger).catch((err: unknown) => {
    logger.error({ err }, "Margin calculation error");
  });
}, 15 * 60 * 1_000);

// Weekly digest check — runs every hour, fires on Monday 7am UTC
setInterval(() => {
  generateWeeklyDigests(logger).catch((err: unknown) => {
    logger.error({ err }, "Weekly digest error");
  });
}, 60 * 60 * 1_000);

// Run aggregation immediately on startup to catch anything queued while offline
aggregateDirtyCustomers(logger).catch((err: unknown) => {
  logger.error({ err }, "Startup aggregation error");
});

logger.info("Worker started — aggregation every 30s, provider-sync every 15m, alerts every 5m");

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const signals = ["SIGINT", "SIGTERM"] as const;
for (const signal of signals) {
  process.on(signal, () => {
    logger.info({ signal }, "Shutting down worker");
    healthServer.close();
    process.exit(0);
  });
}
