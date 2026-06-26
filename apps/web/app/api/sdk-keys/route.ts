import { prisma } from "@tokonomics/db";
import { generateSdkKey } from "@tokonomics/shared";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const keys = await prisma.sdkApiKey.findMany({
      where: { orgId: ctx.orgId, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return ok(keys);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
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
      input = createSchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    const { fullKey, prefix, hash } = generateSdkKey();

    const key = await prisma.sdkApiKey.create({
      data: {
        orgId: ctx.orgId,
        name: input.name,
        keyHash: hash,
        keyPrefix: prefix,
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    });

    // fullKey is returned ONCE — not stored, not logged
    return ok({ ...key, key: fullKey }, 201);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
