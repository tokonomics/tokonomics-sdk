import { auth } from "@clerk/nextjs/server";
import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  const { userId, orgId } = auth();
  if (!userId || !orgId) return unauthorized();

  const org = await prisma.organization.findFirst({
    where: { clerkOrgId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org) return unauthorized();

  const connection = await prisma.providerConnection.findFirst({
    where: { id: params.id, orgId: org.id },
  });
  if (!connection) return notFound("Provider connection");

  await prisma.providerConnection.delete({ where: { id: params.id } });

  return ok({ deleted: true });
}
