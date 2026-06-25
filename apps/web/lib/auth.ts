import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@tokonomics/db";
import type { Organization } from "@tokonomics/db";

export type AuthContext = {
  userId: string;       // our DB user id
  orgId: string;        // our DB org id
  org: Organization;
};

/**
 * Returns auth context for the current request.
 *
 * Handles three cases in order:
 * 1. Clerk organization active → find org by clerkOrgId
 * 2. No Clerk org but user exists in DB → use their first membership's org
 * 3. First-ever login → upsert user + create personal org + membership
 *
 * This supports solo founders who sign up without setting up a Clerk organization.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const { userId: clerkUserId, orgId: clerkOrgId } = auth();
  if (!clerkUserId) return null;

  // ── Case 1: Clerk organization is active ──────────────────────────────────
  if (clerkOrgId) {
    const org = await prisma.organization.findFirst({
      where: { clerkOrgId, deletedAt: null },
    });
    if (org) {
      const user = await prisma.user.findUnique({ where: { clerkId: clerkUserId } });
      if (user) return { userId: user.id, orgId: org.id, org };
    }
  }

  // ── Case 2 & 3: No Clerk org — solo founder flow ──────────────────────────
  // Ensure user exists in DB (webhook may not have fired yet)
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await prisma.user.upsert({
    where: { clerkId: clerkUserId },
    update: {
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: clerkUser.imageUrl || null,
    },
    create: {
      clerkId: clerkUserId,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: clerkUser.imageUrl || null,
    },
  });

  // Check if they already have a personal org via membership
  const existingMembership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (existingMembership?.org && !existingMembership.org.deletedAt) {
    return { userId: user.id, orgId: existingMembership.org.id, org: existingMembership.org };
  }

  // First login: create personal org + owner membership atomically
  const displayName =
    user.name ??
    (user.email.split("@")[0] ?? "My Organization");

  const slug = `personal-${user.id.slice(-8)}`;

  const org = await prisma.organization.create({
    data: {
      name: displayName,
      slug,
      plan: "FREE",
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  return { userId: user.id, orgId: org.id, org };
}

/** Convenience wrapper — returns 401 response instead of throwing. */
export async function getOrCreateUser(): Promise<void> {
  const clerkUser = await currentUser();
  if (!clerkUser) return;

  await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: clerkUser.imageUrl || null,
    },
    create: {
      clerkId: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      avatarUrl: clerkUser.imageUrl || null,
    },
  });
}
