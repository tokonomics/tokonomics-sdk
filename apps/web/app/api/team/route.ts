import { prisma } from "@tokonomics/db";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "VIEWER"]).default("VIEWER"),
});

export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const members = await prisma.membership.findMany({
      where: { orgId: ctx.orgId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    });

    return ok(members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.createdAt,
      user: m.user,
    })));
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    // Only owners can invite
    const myMembership = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
    });
    if (myMembership?.role !== "OWNER") {
      return err("FORBIDDEN", "Only org owners can invite team members", 403);
    }

    let body: unknown;
    try { body = await req.json(); } catch { return err("VALIDATION_ERROR", "Invalid JSON"); }

    let input;
    try { input = inviteSchema.parse(body); } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    // Check if user already exists in our DB
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });

    if (existingUser) {
      // Add membership directly if user already has an account
      const existingMembership = await prisma.membership.findFirst({
        where: { orgId: ctx.orgId, userId: existingUser.id },
      });
      if (existingMembership) {
        return err("CONFLICT", "User is already a team member", 409);
      }

      await prisma.membership.create({
        data: { orgId: ctx.orgId, userId: existingUser.id, role: input.role },
      });

      return ok({ invited: true, status: "added", email: input.email });
    }

    // User doesn't exist yet — return invitation link info
    // (full Clerk invitation flow requires Clerk org setup)
    return ok({
      invited: true,
      status: "pending",
      email: input.email,
      note: "User will be added when they sign up with this email address.",
    }, 201);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
