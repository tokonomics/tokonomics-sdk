import { prisma } from "@tokonomics/db";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  controlModel: z.string().min(1),
  treatmentModel: z.string().min(1),
  feature: z.string().max(100).optional(),
});

export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const tests = await prisma.modelRoutingTest.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
    });
    return ok(tests);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    let body: unknown;
    try { body = await req.json(); } catch { return err("VALIDATION_ERROR", "Invalid JSON"); }

    let input;
    try { input = createSchema.parse(body); } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    const test = await prisma.modelRoutingTest.create({
      data: {
        orgId: ctx.orgId,
        name: input.name,
        controlModel: input.controlModel,
        treatmentModel: input.treatmentModel,
        feature: input.feature ?? null,
        status: "DRAFT",
      },
    });
    return ok(test, 201);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
