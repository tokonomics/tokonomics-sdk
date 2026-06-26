import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { healthRoutes } from "./routes/health.js";
import { eventRoutes } from "./routes/events.js";

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";

const fastify = Fastify({
  logger: {
    level: process.env["LOG_LEVEL"] ?? "info",
    ...(process.env["NODE_ENV"] === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  },
});

async function bootstrap(): Promise<void> {
  await fastify.register(cors, {
    origin: false,
  });

  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    keyGenerator: (request) =>
      // Rate limit by org ID (extracted from auth in Phase 2+)
      // For now, rate limit by IP as fallback
      (request.headers["x-forwarded-for"] as string) ?? request.ip,
  });

  await fastify.register(healthRoutes);
  await fastify.register(eventRoutes);

  await fastify.listen({ port: PORT, host: HOST });
}

bootstrap().catch((err: unknown) => {
  fastify.log.error(err);
  process.exit(1);
});

// Graceful shutdown
const signals = ["SIGINT", "SIGTERM"] as const;
for (const signal of signals) {
  process.on(signal, async () => {
    await fastify.close();
    process.exit(0);
  });
}
