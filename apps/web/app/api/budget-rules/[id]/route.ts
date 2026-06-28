import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const rule = await prisma.budgetRule.findFirst({
      where: { id: params.id, orgId: ctx.orgId },
    });
    if (!rule) return notFound("Budget rule");

    await prisma.budgetRule.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return ok({ deleted: true });
  } catch {
    return notFound("Budget rule");
  }
}
