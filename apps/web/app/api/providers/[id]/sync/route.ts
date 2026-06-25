import { auth } from "@clerk/nextjs/server";
import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound } from "@/lib/api-response";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params): Promise<Response> {
  const { userId, orgId } = auth();
  if (!userId || !orgId) return unauthorized();

  const org = await prisma.organization.findFirst({
    where: { clerkOrgId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org) return unauthorized();

  const connection = await prisma.providerConnection.findFirst({
    where: { id: params.id, orgId: org.id },
    select: { id: true, provider: true },
  });
  if (!connection) return notFound("Provider connection");

  // TODO: enqueue BullMQ provider-sync job for this specific connection
  // For now returns queued — worker job implemented in step 1.3

  return ok({ jobId: `sync_${connection.id}`, status: "queued" }, 202);
}
