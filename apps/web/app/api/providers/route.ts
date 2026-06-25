import { prisma } from "@tokonomics/db";
import { encryptApiKey } from "@tokonomics/shared";
import { ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { createProviderSchema } from "@/lib/validators/providers";
import { validateProviderKey } from "@/lib/providers/validate-key";
import { getAuthContext } from "@/lib/auth";

export async function GET(): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();

  const connections = await prisma.providerConnection.findMany({
    where: { orgId: ctx.orgId },
    select: {
      id: true,
      provider: true,
      displayName: true,
      keyLastFour: true,
      status: true,
      lastSyncedAt: true,
      lastSyncError: true,
      lastSpendUsd: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return ok(
    connections.map((c) => ({
      ...c,
      lastSpendUsd: c.lastSpendUsd?.toString() ?? null,
    }))
  );
}

export async function POST(req: Request): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body");
  }

  let input;
  try {
    input = createProviderSchema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) return fromZodError(e);
    throw e;
  }

  const validation = await validateProviderKey(input.provider, input.apiKey);
  if (!validation.valid) {
    return err("VALIDATION_ERROR", `API key validation failed: ${validation.message}`);
  }

  const existing = await prisma.providerConnection.findFirst({
    where: { orgId: ctx.orgId, provider: input.provider, displayName: input.displayName },
  });
  if (existing) {
    return err("CONFLICT", `A connection named "${input.displayName}" already exists`, 409);
  }

  const encrypted = encryptApiKey(input.apiKey);

  const connection = await prisma.providerConnection.create({
    data: {
      orgId: ctx.orgId,
      provider: input.provider,
      displayName: input.displayName,
      encryptedKey: encrypted.encryptedValue,
      keyIv: encrypted.iv,
      keyAuthTag: encrypted.authTag,
      keyLastFour: encrypted.lastFour,
      status: "CONNECTED",
    },
    select: {
      id: true,
      provider: true,
      displayName: true,
      keyLastFour: true,
      status: true,
    },
  });

  return ok(connection, 201);
}
