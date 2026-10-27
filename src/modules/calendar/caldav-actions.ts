"use server";

// Nextcloud two-way sync actions: connecting the user's Nextcloud with an app
// password, linking Nextcloud calendars to app calendars (either direction),
// syncing on demand and unlinking.
// Used by components/calendar/nextcloud-dialog.tsx and use-calendar-feeds.tsx.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { nextcloudUrl } from "@/modules/cloud/config";
import { encryptSecret } from "@/modules/mail/crypto";
import {
  CaldavError,
  discoverCalendarHome,
  listRemoteCalendars,
  makeCalendar,
  type CaldavErrorCode,
  type RemoteCalendar,
} from "./caldav-client";
import { caldavAuthFor, syncCaldavCalendar } from "./caldav-sync";
import { calendarRoleForUser, isSubscribedCalendar } from "./queries";
import {
  calendarCaldavAccounts,
  calendarCaldavLinks,
  calendarMemberships,
  calendars,
} from "./schema";

export type NextcloudErrorCode = CaldavErrorCode | "not_connected" | "already_linked" | "read_only";
type Failure = { status: "error"; error: NextcloudErrorCode };

export type NextcloudOverview =
  | { status: "ok"; server: string; username: string | null; calendars: (RemoteCalendar & { linked: boolean })[] }
  | Failure;

function failure(error: unknown): Failure {
  if (error instanceof CaldavError) return { status: "error", error: error.code };
  throw error;
}

function account(userId: string) {
  return db.select().from(calendarCaldavAccounts).where(eq(calendarCaldavAccounts.userId, userId)).get();
}

function requireOwner(calendarId: string, userId: string) {
  if (calendarRoleForUser(calendarId, userId) !== "owner") throw new Error("Only the owner can sync this calendar");
}

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

/** The connected login and its Nextcloud calendars; `username: null` before connecting. */
export async function getNextcloudOverview(): Promise<NextcloudOverview> {
  const currentUser = await requireUserOrThrow();
  const server = new URL(nextcloudUrl()).host;
  const row = account(currentUser.id);
  if (!row) return { status: "ok", server, username: null, calendars: [] };
  try {
    const remote = await listRemoteCalendars(row.homeUrl, caldavAuthFor(currentUser.id));
    const linked = new Set(
      db.select({ url: calendarCaldavLinks.collectionUrl }).from(calendarCaldavLinks)
        .where(eq(calendarCaldavLinks.userId, currentUser.id)).all().map((link) => link.url),
    );
    return { status: "ok", server, username: row.username, calendars: remote.map((calendar) => ({ ...calendar, linked: linked.has(calendar.url) })) };
  } catch (error) {
    return failure(error);
  }
}

/** Stores the login after checking it against Nextcloud; replaces an earlier one. */
export async function connectNextcloud(input: { username: string; password: string }): Promise<{ status: "ok" } | Failure> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ username: z.string().trim().min(1).max(200), password: z.string().min(1).max(500) }).parse(input);
  let homeUrl: string;
  try {
    homeUrl = await discoverCalendarHome(data);
  } catch (error) {
    return failure(error);
  }
  const values = { username: data.username, passwordEncrypted: encryptSecret(data.password), homeUrl, updatedAt: new Date() };
  db.transaction((tx) => {
    tx.insert(calendarCaldavAccounts).values({ userId: currentUser.id, ...values })
      .onConflictDoUpdate({ target: calendarCaldavAccounts.userId, set: values }).run();
    // The background sync skips links whose login failed; a new password resumes them.
    tx.update(calendarCaldavLinks).set({ lastError: null }).where(eq(calendarCaldavLinks.userId, currentUser.id)).run();
  });
  refresh();
  return { status: "ok" };
}

/** Forgets the login and stops every sync; calendars and events stay on both sides. */
export async function disconnectNextcloud() {
  const currentUser = await requireUserOrThrow();
  db.delete(calendarCaldavAccounts).where(eq(calendarCaldavAccounts.userId, currentUser.id)).run();
  refresh();
}

/** Creates an app calendar for a Nextcloud calendar and pulls its events. */
export async function linkNextcloudCalendar(input: {
  url: string;
  name: string;
  color: string;
  visibility: "private" | "busy" | "company";
}): Promise<{ status: "ok"; calendarId: string; pulled: number } | Failure> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({
    url: z.string().url().max(2_000),
    name: z.string().trim().min(1).max(120),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    visibility: z.enum(["private", "busy", "company"]),
  }).parse(input);
  const row = account(currentUser.id);
  if (!row) return { status: "error", error: "not_connected" };
  let remote: RemoteCalendar | undefined;
  try {
    // Only calendars Nextcloud lists for this login can be linked, never an arbitrary URL.
    remote = (await listRemoteCalendars(row.homeUrl, caldavAuthFor(currentUser.id))).find((calendar) => calendar.url === data.url);
  } catch (error) {
    return failure(error);
  }
  if (!remote) return { status: "error", error: "not_found" };
  if (!remote.writable) return { status: "error", error: "read_only" };
  const duplicate = db.select().from(calendarCaldavLinks)
    .where(and(eq(calendarCaldavLinks.userId, currentUser.id), eq(calendarCaldavLinks.collectionUrl, remote.url))).get();
  if (duplicate) return { status: "error", error: "already_linked" };

  const calendarId = db.transaction((tx) => {
    const calendar = tx.insert(calendars)
      .values({ name: data.name, color: data.color, visibility: data.visibility, ownerId: currentUser.id })
      .returning({ id: calendars.id }).get();
    tx.insert(calendarMemberships).values({ calendarId: calendar.id, userId: currentUser.id, role: "owner" }).run();
    tx.insert(calendarCaldavLinks).values({ calendarId: calendar.id, userId: currentUser.id, collectionUrl: remote.url }).run();
    return calendar.id;
  });
  const result = await syncCaldavCalendar(calendarId);
  refresh();
  return result.ok ? { status: "ok", calendarId, pulled: result.pulled } : { status: "error", error: result.error };
}

/** Creates a Nextcloud calendar for an existing app calendar; its events upload in the background. */
export async function pushCalendarToNextcloud(calendarId: string): Promise<{ status: "ok" } | Failure> {
  const currentUser = await requireUserOrThrow();
  const id = z.string().min(1).parse(calendarId);
  requireOwner(id, currentUser.id);
  if (isSubscribedCalendar(id)) return { status: "error", error: "read_only" };
  if (db.select().from(calendarCaldavLinks).where(eq(calendarCaldavLinks.calendarId, id)).get()) {
    return { status: "error", error: "already_linked" };
  }
  const row = account(currentUser.id);
  if (!row) return { status: "error", error: "not_connected" };
  const calendar = db.select().from(calendars).where(eq(calendars.id, id)).get()!;
  let collectionUrl: string;
  try {
    collectionUrl = await makeCalendar(row.homeUrl, calendar.name, calendar.color, caldavAuthFor(currentUser.id));
  } catch (error) {
    return failure(error);
  }
  db.insert(calendarCaldavLinks).values({ calendarId: id, userId: currentUser.id, collectionUrl }).run();
  void syncCaldavCalendar(id);
  refresh();
  return { status: "ok" };
}

export async function syncNextcloudCalendarNow(calendarId: string): Promise<{ status: "ok" } | Failure> {
  const currentUser = await requireUserOrThrow();
  const id = z.string().min(1).parse(calendarId);
  requireOwner(id, currentUser.id);
  const result = await syncCaldavCalendar(id);
  refresh();
  return result.ok ? { status: "ok" } : { status: "error", error: result.error };
}

/** Stops syncing one calendar; both copies are kept. */
export async function unlinkNextcloudCalendar(calendarId: string) {
  const currentUser = await requireUserOrThrow();
  const id = z.string().min(1).parse(calendarId);
  requireOwner(id, currentUser.id);
  db.delete(calendarCaldavLinks).where(eq(calendarCaldavLinks.calendarId, id)).run();
  refresh();
}
