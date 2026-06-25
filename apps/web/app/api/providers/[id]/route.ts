import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();

  const connection = await prisma.providerConnection.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
  });
  if (!connection) return notFound("Provider connection");

  await prisma.providerConnection.delete({ where: { id: params.id } });

  return ok({ deleted: true });
}
