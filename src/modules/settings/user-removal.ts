import "server-only";

import { randomUUID } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user, userInvitations, userProfilePreferences } from "@/db/schema";

/** Keep the author row for business history; remove all account access atomically. */
export function removeUserAccount(userId: string, adminId: string) {
  return db.transaction((tx) => {
    // Recheck under the write lock: two admins cannot remove each other concurrently.
    const admin = tx.select().from(user).where(eq(user.id, adminId)).get();
    if (!admin || admin.role !== "admin" || admin.banned || admin.removedAt) {
      throw new Error("Forbidden: admin only");
    }
    if (userId === adminId) return { error: "cannotRemoveSelf" as const };
    const target = tx.select().from(user).where(eq(user.id, userId)).get();
    if (!target || target.removedAt) return { error: "userNotFound" as const };

    const now = new Date();
    tx.update(user).set({
      removedAt: now, updatedAt: now, banned: true, banExpires: null,
      banReason: "Account removed", role: "member", emailVerified: false,
      email: `${randomUUID()}@removed.invalid`, username: null,
      displayUsername: null, image: null,
    }).where(eq(user.id, userId)).run();
    tx.delete(session).where(or(eq(session.userId, userId), eq(session.impersonatedBy, userId))).run();
    tx.delete(account).where(eq(account.userId, userId)).run();
    tx.delete(userProfilePreferences).where(eq(userProfilePreferences.userId, userId)).run();
    // Revoke links issued by this user and old links addressed to their account.
    // In-flight sends cannot reactivate a deleted invitation row.
    tx.delete(userInvitations).where(or(
      eq(userInvitations.invitedBy, userId),
      sql`lower(${userInvitations.email}) = ${target.email.toLowerCase()}`,
    )).run();
    return { error: null };
  }, { behavior: "immediate" });
}
