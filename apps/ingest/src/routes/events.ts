import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@tokonomics/db";
import { calculateEventCost, verifySdkKey } from "@tokonomics/shared";
import { getRedis } from "../plugins/redis.js";

const eventSchema = z.object({
  customer_id: z.string().min(1).max(255),
  model: z.string().min(1).max(100),
  provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE"]),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  latency_ms: z.number().int().min(0).optional(),
  feature: z.string().max(100).optional(),
  workflow: z.string().max(100).optional(),
  sdk_version: z.string().max(50).optional(),
  idempotency_key: z.string().max(255).optional(),
});

type EventBody = z.infer<typeof eventSchema>;

// Resolve SDK key → orgId, using Redis cache (5-min TTL)
async function resolveOrgFromKey(rawKey: string): Promise<string | null> {
  const redis = getRedis();
  const cacheKey = `sdk:key:cache:${rawKey.slice(-16)}`; // safe: only last 16 chars as cache index

  const cachedOrgId = await redis.get<string>(cacheKey);
  if (cachedOrgId) return cachedOrgId;

  // DB lookup — find all active keys and bcrypt-compare
  const candidates = await prisma.sdkApiKey.findMany({
    where: { revokedAt: null },
    select: { id: true, orgId: true, keyHash: true },
    take: 200,
  });

  for (const candidate of candidates) {
    const valid = await verifySdkKey(rawKey, candidate.keyHash);
    if (valid) {
      await redis.set(cacheKey, candidate.orgId, { ex: 5 * 60 });
      // Update lastUsedAt asynchronously
      void prisma.sdkApiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });
      return candidate.orgId;
    }
  }

  return null;
}

export async function eventRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: EventBody }>("/ingest/v1/events", async (request, reply) => {
    // 1. Extract Bearer token
    const authHeader = request.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Bearer token required" } });
    }
    const rawKey = authHeader.slice(7);

    // 2. Validate key → orgId (with Redis cache)
    const orgId = await resolveOrgFromKey(rawKey);
    if (!orgId) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid SDK key" } });
    }

    // 3. Validate request body
    const parseResult = eventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid event payload",
          details: parseResult.error.errors,
        },
      });
    }
    const body = parseResult.data;

    // 4. Calculate cost server-side (never trust client)
    const costUsd = calculateEventCost({
      model: body.model,
      provider: body.provider,
      inputTokens: body.input_tokens,
      outputTokens: body.output_tokens,
    });

    // 5. Upsert customer
    const customer = await prisma.customer.upsert({
      where: { orgId_externalId: { orgId, externalId: body.customer_id } },
      update: {},
      create: { orgId, externalId: body.customer_id },
      select: { id: true },
    });

    // 6. Write usage event
    const event = await prisma.usageEvent.create({
      data: {
        orgId,
        customerId: customer.id,
        externalCustomerId: body.customer_id,
        model: body.model,
        provider: body.provider,
        inputTokens: body.input_tokens,
        outputTokens: body.output_tokens,
        costUsd,
        latencyMs: body.latency_ms ?? null,
        feature: body.feature ?? null,
        workflow: body.workflow ?? null,
        sdkVersion: body.sdk_version ?? null,
        idempotencyKey: body.idempotency_key ?? null,
      },
      select: { id: true },
    });

    // 7. Mark customer as dirty for aggregation
    const redis = getRedis();
    await redis.sadd(`dirty_customers:${orgId}`, customer.id);

    return reply.status(202).send({
      data: {
        eventId: event.id,
        costUsd,
        status: "accepted",
      },
    });
  });
}
