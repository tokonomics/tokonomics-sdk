import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { prisma } from "@tokonomics/db";
import { NextResponse } from "next/server";

const WEBHOOK_SECRET = process.env["CLERK_WEBHOOK_SECRET"];

export async function POST(req: Request): Promise<NextResponse> {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing webhook secret" }, { status: 500 });
  }

  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const eventType = evt.type;

  if (eventType === "user.created" || eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;
    const primaryEmail = email_addresses.find((e) => e.id === evt.data.primary_email_address_id);

    if (!primaryEmail) {
      return NextResponse.json({ error: "No primary email" }, { status: 400 });
    }

    await prisma.user.upsert({
      where: { clerkId: id },
      update: {
        email: primaryEmail.email_address,
        name: [first_name, last_name].filter(Boolean).join(" ") || null,
        avatarUrl: image_url || null,
      },
      create: {
        clerkId: id,
        email: primaryEmail.email_address,
        name: [first_name, last_name].filter(Boolean).join(" ") || null,
        avatarUrl: image_url || null,
      },
    });
  }

  if (eventType === "organization.created" || eventType === "organization.updated") {
    const { id, name, slug, image_url } = evt.data;

    await prisma.organization.upsert({
      where: { clerkOrgId: id },
      update: {
        name,
        slug: slug ?? id,
        logoUrl: image_url || null,
      },
      create: {
        clerkOrgId: id,
        name,
        slug: slug ?? id,
        logoUrl: image_url || null,
      },
    });
  }

  if (eventType === "organizationMembership.created") {
    const { organization, public_user_data, role } = evt.data;

    const [user, org] = await Promise.all([
      prisma.user.findUnique({ where: { clerkId: public_user_data.user_id } }),
      prisma.organization.findUnique({ where: { clerkOrgId: organization.id } }),
    ]);

    if (user && org) {
      const clerkRole = role === "org:admin" ? "ADMIN" : role === "org:member" ? "VIEWER" : "VIEWER";
      await prisma.membership.upsert({
        where: { userId_orgId: { userId: user.id, orgId: org.id } },
        update: { role: clerkRole },
        create: { userId: user.id, orgId: org.id, role: clerkRole },
      });
    }
  }

  return NextResponse.json({ received: true });
}
