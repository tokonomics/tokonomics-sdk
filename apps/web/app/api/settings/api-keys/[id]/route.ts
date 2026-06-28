import { prisma } from "@tokonomics/db";
import { ok, unauthorized, notFound } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const key = await prisma.sdkApiKey.findFirst({
      where: { id: params.id, orgId: ctx.orgId, revokedAt: null, keyPrefix: { startsWith: "tok_api_" } },
    });
    if (!key) return notFound("API key");

    await prisma.sdkApiKey.update({
      where: { id: params.id },
      data: { revokedAt: new Date() },
    });
    return ok({ revoked: true });
  } catch {
    return notFound("API key");
  }
}
