import { prisma } from "@tokonomics/db";
import { ok, err, unauthorized, notFound } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type Params = { params: { userId: string } };

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const myMembership = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
    });
    if (myMembership?.role !== "OWNER") {
      return err("FORBIDDEN", "Only owners can change roles", 403);
    }

    const body = (await req.json()) as { role?: string };
    if (!body.role || !["ADMIN", "VIEWER", "OWNER"].includes(body.role)) {
      return err("VALIDATION_ERROR", "Invalid role");
    }

    const membership = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId: params.userId },
    });
    if (!membership) return notFound("Team member");

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { role: body.role as "ADMIN" | "VIEWER" | "OWNER" },
    });
    return ok(updated);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const myMembership = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
    });
    if (myMembership?.role !== "OWNER") {
      return err("FORBIDDEN", "Only owners can remove members", 403);
    }

    if (params.userId === ctx.userId) {
      return err("VALIDATION_ERROR", "You cannot remove yourself from the org");
    }

    const membership = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, userId: params.userId },
    });
    if (!membership) return notFound("Team member");

    await prisma.membership.delete({ where: { id: membership.id } });
    return ok({ removed: true });
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
