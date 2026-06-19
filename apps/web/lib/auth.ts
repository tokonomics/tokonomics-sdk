import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@tokonomics/db";
import type { Organization } from "@tokonomics/db";

export type AuthContext = {
  userId: string;
  orgId: string;
  org: Organization;
};

export async function requireAuth(): Promise<AuthContext> {
  const { userId, orgId } = auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!orgId) {
    throw new Error("No organization selected");
  }

  const org = await prisma.organization.findFirst({
    where: {
      clerkOrgId: orgId,
      deletedAt: null,
    },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  return { userId, orgId: org.id, org };
}

export async function getOrCreateUser(): Promise<void> {
  const clerkUser = await currentUser();
  if (!clerkUser) return;

  await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
      avatarUrl: clerkUser.imageUrl || null,
    },
    create: {
      clerkId: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
      name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
      avatarUrl: clerkUser.imageUrl || null,
    },
  });
}
