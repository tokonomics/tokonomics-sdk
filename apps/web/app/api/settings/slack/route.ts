import { prisma } from "@tokonomics/db";
import { encryptApiKey } from "@tokonomics/shared";
import { z, ZodError } from "zod";
import { ok, err, fromZodError, unauthorized } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

const saveSchema = z.object({
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
  channelName: z.string().max(100).optional(),
});

export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    const conn = await prisma.slackConnection.findFirst({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, channelName: true, isActive: true },
    });
    return ok(conn ?? null);
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

    // Handle test action
    const rawBody = body as { action?: string; webhookUrl?: string; channelName?: string };
    if (rawBody.action === "test") {
      const conn = await prisma.slackConnection.findFirst({
        where: { orgId: ctx.orgId, isActive: true },
        select: { webhookUrl: true, webhookIv: true, webhookAuthTag: true },
      });
      if (!conn) return err("NOT_FOUND", "No Slack connection configured", 404);

      const { decryptApiKey } = await import("@tokonomics/shared");
      const url = decryptApiKey({ encryptedValue: conn.webhookUrl, iv: conn.webhookIv, authTag: conn.webhookAuthTag });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "✅ Tokonomics Slack integration is working!" }),
      });
      return ok({ sent: res.ok, status: res.status });
    }

    let input;
    try { input = saveSchema.parse(body); } catch (e) {
      if (e instanceof ZodError) return fromZodError(e);
      throw e;
    }

    // Test the webhook before saving
    const testRes = await fetch(input.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "✅ Tokonomics connected to this channel!" }),
    });
    if (!testRes.ok) return err("VALIDATION_ERROR", "Slack webhook test failed. Check the URL and try again.");

    // Encrypt and store
    const encrypted = encryptApiKey(input.webhookUrl);

    await prisma.slackConnection.upsert({
      where: { orgId: ctx.orgId },
      update: {
        webhookUrl: encrypted.encryptedValue,
        webhookIv: encrypted.iv,
        webhookAuthTag: encrypted.authTag,
        channelName: input.channelName ?? null,
        isActive: true,
      },
      create: {
        orgId: ctx.orgId,
        webhookUrl: encrypted.encryptedValue,
        webhookIv: encrypted.iv,
        webhookAuthTag: encrypted.authTag,
        channelName: input.channelName ?? null,
        isActive: true,
      },
    });

    return ok({ connected: true, channelName: input.channelName ?? null }, 201);
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return unauthorized();

    await prisma.slackConnection.updateMany({
      where: { orgId: ctx.orgId },
      data: { isActive: false },
    });
    return ok({ disconnected: true });
  } catch (e: unknown) {
    return err("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", 500);
  }
}
