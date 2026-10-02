"use server";

// Calendar subscription actions: subscribing to an iCal feed (e.g. Google
// Calendar's secret address), syncing it on demand and removing it.
// Used by components/calendar/calendar-feed-dialogs.tsx and calendar-filters-dialog.tsx.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { parseIcsFeed } from "./ics-feed";
import {
  CalendarFeedError,
  downloadFeed,
  normalizeFeedUrl,
  syncCalendarSubscription,
  type SubscriptionErrorCode,
} from "./ics-sync";
import { calendarRoleForUser } from "./queries";
import { calendarMemberships, calendarSubscriptions, calendars } from "./schema";

type SubscriptionActionResult =
  | { status: "ok"; calendarId: string; created: number; updated: number; removed: number }
  | { status: "error"; error: SubscriptionErrorCode | "already_subscribed" };

const calendarFields = {
  name: z.string().trim().max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  visibility: z.enum(["private", "busy", "company"]),
};

function errorResult(error: unknown): SubscriptionActionResult {
  if (error instanceof CalendarFeedError) return { status: "error", error: error.code };
  throw error;
}

function requireSubscribedOwner(calendarId: string, userId: string) {
  if (calendarRoleForUser(calendarId, userId) !== "owner") {
    throw new Error("Only the owner can manage this subscription");
  }
  const subscription = db
    .select()
    .from(calendarSubscriptions)
    .where(eq(calendarSubscriptions.calendarId, calendarId))
    .get();
  if (!subscription) throw new Error("Calendar is not a subscription");
  return subscription;
}

async function finishSync(calendarId: string, feedText?: string): Promise<SubscriptionActionResult> {
  const result = await syncCalendarSubscription(calendarId, { feedText });
  revalidatePath("/calendar");
  revalidatePath("/");
  return result.ok
    ? { status: "ok", calendarId, created: result.created, updated: result.updated, removed: result.removed }
    : { status: "error", error: result.error };
}

/** Creates a read-only calendar that mirrors the feed at `url`. */
export async function subscribeToCalendarFeed(input: {
  url: string;
  name: string;
  color: string;
  visibility: "private" | "busy" | "company";
}): Promise<SubscriptionActionResult> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ url: z.string().trim().min(1).max(2_000), ...calendarFields }).parse(input);
  let url: string;
  let feedText: string;
  try {
    url = normalizeFeedUrl(data.url);
    feedText = await downloadFeed(url);
  } catch (error) {
    return errorResult(error);
  }
  const duplicate = db
    .select({ calendarId: calendarSubscriptions.calendarId })
    .from(calendarSubscriptions)
    .innerJoin(calendars, eq(calendarSubscriptions.calendarId, calendars.id))
    .where(and(eq(calendarSubscriptions.url, url), eq(calendars.ownerId, currentUser.id)))
    .get();
  if (duplicate) return { status: "error", error: "already_subscribed" };

  const name = data.name || parseIcsFeed(feedText.slice(0, 64_000), { fallbackTimezone: "UTC" }).name || new URL(url).hostname;
  const calendarId = db.transaction((tx) => {
    const calendar = tx
      .insert(calendars)
      .values({ name, color: data.color, visibility: data.visibility, ownerId: currentUser.id })
      .returning({ id: calendars.id })
      .get();
    tx.insert(calendarMemberships).values({ calendarId: calendar.id, userId: currentUser.id, role: "owner" }).run();
    tx.insert(calendarSubscriptions).values({ calendarId: calendar.id, url }).run();
    return calendar.id;
  });
  return finishSync(calendarId, feedText);
}

/** Replaces the feed address, e.g. after the secret address was reset in Google Calendar. */
export async function updateCalendarSubscriptionUrl(input: {
  calendarId: string;
  url: string;
}): Promise<SubscriptionActionResult> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ calendarId: z.string().min(1), url: z.string().trim().min(1).max(2_000) }).parse(input);
  requireSubscribedOwner(data.calendarId, currentUser.id);
  let url: string;
  let feedText: string;
  try {
    url = normalizeFeedUrl(data.url);
    feedText = await downloadFeed(url);
  } catch (error) {
    return errorResult(error);
  }
  db.update(calendarSubscriptions)
    .set({ url, updatedAt: new Date() })
    .where(eq(calendarSubscriptions.calendarId, data.calendarId))
    .run();
  return finishSync(data.calendarId, feedText);
}

export async function syncCalendarSubscriptionNow(calendarId: string): Promise<SubscriptionActionResult> {
  const currentUser = await requireUserOrThrow();
  const id = z.string().min(1).parse(calendarId);
  requireSubscribedOwner(id, currentUser.id);
  return finishSync(id);
}

/** Deletes a subscribed calendar with its mirrored events; the feed itself is untouched. */
export async function removeCalendarSubscription(calendarId: string) {
  const currentUser = await requireUserOrThrow();
  const id = z.string().min(1).parse(calendarId);
  requireSubscribedOwner(id, currentUser.id);
  db.delete(calendars).where(eq(calendars.id, id)).run();
  revalidatePath("/calendar");
  revalidatePath("/");
}
