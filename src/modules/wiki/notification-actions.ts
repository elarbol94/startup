"use server";

import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { wikiNotifications } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";

const idsSchema = z.array(z.string().min(1)).max(500).optional();

/** Marks the current user's notifications read: the given ones, or all when no ids are passed. */
export async function markNotificationsRead(ids?: string[]) {
  const currentUser = await requireUserOrThrow();
  const parsed = idsSchema.parse(ids);
  const own = and(eq(wikiNotifications.userId, currentUser.id), isNull(wikiNotifications.readAt));
  const where = parsed?.length ? and(own, inArray(wikiNotifications.id, parsed)) : own;
  const { changes } = db.update(wikiNotifications).set({ readAt: new Date() }).where(where).run();
  if (!changes) return;
  revalidatePath("/wiki", "layout");
  // The dashboard's "Unread news" card and news widget read the same rows.
  revalidatePath("/");
}
