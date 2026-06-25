import { auth } from "@clerk/nextjs/server";
import { prisma } from "@tokonomics/db";
import { encryptApiKey } from "@tokonomics/shared";
import { ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { createProviderSchema } from "@/lib/validators/providers";
import { validateProviderKey } from "@/lib/providers/validate-key";

export async function GET(): Promise<Response> {
  const { userId, orgId } = auth();
  if (!userId || !orgId) return unauthorized();

  const org = await prisma.organization.findFirst({
    where: { clerkOrgId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org) return unauthorized();

  const connections = await prisma.providerConnection.findMany({
    where: { orgId: org.id },
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
  const { userId, orgId } = auth();
  if (!userId || !orgId) return unauthorized();

  const org = await prisma.organization.findFirst({
    where: { clerkOrgId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org) return unauthorized();

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

  // Validate API key against the provider before storing anything
  const validation = await validateProviderKey(input.provider, input.apiKey);
  if (!validation.valid) {
    return err("VALIDATION_ERROR", `API key validation failed: ${validation.message}`);
  }

  // Check for duplicate displayName per org+provider
  const existing = await prisma.providerConnection.findFirst({
    where: { orgId: org.id, provider: input.provider, displayName: input.displayName },
  });
  if (existing) {
    return err("CONFLICT", `A connection named "${input.displayName}" already exists`, 409);
  }

  const encrypted = encryptApiKey(input.apiKey);

  const connection = await prisma.providerConnection.create({
    data: {
      orgId: org.id,
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
