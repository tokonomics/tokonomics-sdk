import { prisma } from "@tokonomics/db";
import { verifySdkKey } from "@tokonomics/shared";
import { getRedis } from "@/lib/redis";

const RATE_LIMIT = 1000; // requests per hour

export type PublicApiContext = {
  orgId: string;
};

export async function authenticatePublicApi(req: Request): Promise<PublicApiContext | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !apiKey.startsWith("tok_api_")) return null;

  // Rate limit check
  const redis = getRedis();
  const rateLimitKey = `pub_api_rate:${apiKey.slice(-16)}`;
  const current = await redis.incr(rateLimitKey);
  if (current === 1) await redis.expire(rateLimitKey, 3600);
  if (current > RATE_LIMIT) return null;

  // Validate key — check org API keys only
  const candidates = await prisma.sdkApiKey.findMany({
    where: { revokedAt: null, keyPrefix: { startsWith: "tok_api_" } },
    select: { id: true, orgId: true, keyHash: true },
    take: 100,
  });

  for (const candidate of candidates) {
    if (await verifySdkKey(apiKey, candidate.keyHash)) {
      await prisma.sdkApiKey.update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      });
      return { orgId: candidate.orgId };
    }
  }

  return null;
}
