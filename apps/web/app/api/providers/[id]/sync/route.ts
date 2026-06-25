import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params): Promise<Response> {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorized();

  const connection = await prisma.providerConnection.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    select: { id: true, provider: true },
  });
  if (!connection) return notFound("Provider connection");

  // TODO: enqueue BullMQ provider-sync job for this specific connection
  return ok({ jobId: `sync_${connection.id}`, status: "queued" }, 202);
}
