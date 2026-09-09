"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { removeUserSchema, inviteUserSchema, type InviteUserInput, type AcceptInvitationInput } from "./user-input";
import { removeUserAccount } from "./user-removal";
import { acceptInvitation, issueInvitation } from "./invitations";

export async function invitePlatformUser(input: InviteUserInput) {
  const admin = await requireAdmin();
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" as const };
  const result = await issueInvitation(parsed.data, admin.id, await getLocale());
  if (!result.error) revalidatePath("/settings/users");
  return result;
}

export async function acceptPlatformInvitation(input: AcceptInvitationInput) {
  const result = await acceptInvitation(input);
  if (!result.error) revalidatePath("/settings/users");
  return result;
}

export async function removePlatformUser(input: { userId: string }) {
  const admin = await requireAdmin();
  const parsed = removeUserSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidRemoval" as const };
  const result = removeUserAccount(parsed.data.userId, admin.id);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}
