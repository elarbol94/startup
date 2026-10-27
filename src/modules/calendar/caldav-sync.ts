// Two-way sync between app calendars and Nextcloud calendars over CalDAV.
// Each run pulls remote changes first (Nextcloud wins when both sides changed the
// same event), then pushes local creates, edits and deletions.
// Used by caldav-actions.ts and src/instrumentation.ts.
import "server-only";

import { and, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { decryptSecret } from "@/modules/mail/crypto";
import * as client from "./caldav-client";
import { CaldavError, resolveDavUrl, type CaldavAuth, type CaldavErrorCode } from "./caldav-client";
import { parseIcsFeed, type IcsEvent } from "./ics-feed";
import { applyIcsEvents, ownerTimezone } from "./ics-sync";
import { eventToIcs } from "./ics-write";
import {
  calendarCaldavAccounts,
  calendarCaldavLinks,
  calendarCaldavObjects,
  calendarEventExceptions,
  calendarEvents,
  calendars,
} from "./schema";

export const CALDAV_SYNC_INTERVAL_MS = 60_000;

export type CaldavApi = Pick<typeof client, "syncCollection" | "multigetObjects" | "putObject" | "deleteObject">;
export type CaldavSyncResult =
  | { ok: true; pulled: number; pushed: number; deleted: number }
  | { ok: false; error: CaldavErrorCode };

type LinkRow = typeof calendarCaldavLinks.$inferSelect;
type ObjectRow = typeof calendarCaldavObjects.$inferSelect;

export function caldavAuthFor(userId: string): CaldavAuth {
  const account = db.select().from(calendarCaldavAccounts).where(eq(calendarCaldavAccounts.userId, userId)).get();
  if (!account) throw new CaldavError("auth_failed", "no account");
  let password: string;
  try {
    password = decryptSecret(account.passwordEncrypted);
  } catch {
    throw new CaldavError("auth_failed", "unreadable password");
  }
  return { username: account.username, password };
}

function objectRows(calendarId: string) {
  return db.select().from(calendarCaldavObjects).where(eq(calendarCaldavObjects.calendarId, calendarId)).all();
}

function exceptionsByEvent(eventIds: string[]) {
  const result = new Map<string, (typeof calendarEventExceptions.$inferSelect)[]>();
  for (let index = 0; index < eventIds.length; index += 500) {
    for (const exception of db
      .select()
      .from(calendarEventExceptions)
      .where(inArray(calendarEventExceptions.eventId, eventIds.slice(index, index + 500)))
      .all()) {
      result.set(exception.eventId, [...(result.get(exception.eventId) ?? []), exception]);
    }
  }
  return result;
}

/** Latest local change of an event, including its moved/cancelled occurrences. */
function localVersion(event: { updatedAt: Date }, exceptions: { updatedAt: Date }[] = []) {
  return new Date(Math.max(event.updatedAt.getTime(), ...exceptions.map((exception) => exception.updatedAt.getTime())));
}

function saveObject(calendarId: string, row: Omit<ObjectRow, "calendarId">) {
  db.insert(calendarCaldavObjects)
    .values({ calendarId, ...row })
    .onConflictDoUpdate({
      target: [calendarCaldavObjects.calendarId, calendarCaldavObjects.href],
      set: { eventId: row.eventId, etag: row.etag, syncedAt: row.syncedAt },
    })
    .run();
}

function dropObject(calendarId: string, href: string) {
  db.delete(calendarCaldavObjects)
    .where(and(eq(calendarCaldavObjects.calendarId, calendarId), eq(calendarCaldavObjects.href, href)))
    .run();
}

async function pull(link: LinkRow, ownerId: string, auth: CaldavAuth, api: CaldavApi) {
  let changes: client.SyncChanges;
  let full = !link.syncToken;
  try {
    changes = await api.syncCollection(link.collectionUrl, link.syncToken, auth);
  } catch (error) {
    if (!(error instanceof CaldavError && error.code === "invalid_token")) throw error;
    changes = await api.syncCollection(link.collectionUrl, null, auth);
    full = true;
  }
  const known = new Map(objectRows(link.calendarId).map((row) => [row.href, row]));
  const removed = new Set(changes.removed);
  // A full listing names every object: anything we knew that is missing was deleted remotely.
  if (full) {
    const listed = new Set(changes.changed.map((change) => change.url));
    for (const href of known.keys()) if (!listed.has(href)) removed.add(href);
  }
  const stale = changes.changed.filter((change) => !change.etag || known.get(change.url)?.etag !== change.etag);
  const objects = stale.length ? await api.multigetObjects(link.collectionUrl, stale.map((change) => change.url), auth) : [];

  const timezone = ownerTimezone(ownerId);
  const parsed: { url: string; etag: string | null; event: IcsEvent | null }[] = objects.map((object) => ({
    url: object.url,
    etag: object.etag,
    event: parseIcsFeed(object.data, { fallbackTimezone: timezone }).events[0] ?? null,
  }));
  applyIcsEvents({
    calendarId: link.calendarId,
    userId: ownerId,
    events: parsed.flatMap((entry) => (entry.event ? [entry.event] : [])),
    mode: "merge",
  });

  const uids = parsed.flatMap((entry) => (entry.event ? [entry.event.uid] : []));
  const byUid = new Map<string, { id: string; updatedAt: Date }>();
  for (let index = 0; index < uids.length; index += 500) {
    for (const row of db
      .select({ id: calendarEvents.id, uid: calendarEvents.externalUid, updatedAt: calendarEvents.updatedAt })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.calendarId, link.calendarId), inArray(calendarEvents.externalUid, uids.slice(index, index + 500))))
      .all()) {
      byUid.set(row.uid!, row);
    }
  }
  const exceptions = exceptionsByEvent([...byUid.values()].map((row) => row.id));
  for (const entry of parsed) {
    const local = entry.event && byUid.get(entry.event.uid);
    // Cancelled or unreadable objects behave like deletions.
    if (!local) {
      removed.add(entry.url);
      continue;
    }
    saveObject(link.calendarId, { href: entry.url, eventId: local.id, etag: entry.etag, syncedAt: localVersion(local, exceptions.get(local.id)) });
  }
  for (const href of removed) {
    const row = known.get(href);
    if (row && !parsed.some((entry) => entry.url === href && entry.event)) {
      db.delete(calendarEvents).where(and(eq(calendarEvents.id, row.eventId), eq(calendarEvents.calendarId, link.calendarId))).run();
    }
    dropObject(link.calendarId, href);
  }
  db.update(calendarCaldavLinks).set({ syncToken: changes.syncToken }).where(eq(calendarCaldavLinks.calendarId, link.calendarId)).run();
  return parsed.length + removed.size;
}

/** Problems of the whole link (login, network, calendar gone) stop the run; others only skip that event. */
function linkWide(error: unknown) {
  return !(error instanceof CaldavError) || ["auth_failed", "unreachable", "not_found"].includes(error.code);
}

async function push(link: LinkRow, auth: CaldavAuth, api: CaldavApi) {
  let pushed = 0;
  let deleted = 0;
  let rejected = 0;
  const events = db.select().from(calendarEvents).where(eq(calendarEvents.calendarId, link.calendarId)).all();
  const exceptions = exceptionsByEvent(events.map((event) => event.id));
  const rows = objectRows(link.calendarId);
  const byEvent = new Map(rows.map((row) => [row.eventId, row]));
  const present = new Set(events.filter((event) => event.status !== "cancelled").map((event) => event.id));

  // Deleted locally (soft-cancelled, hard-deleted or moved to another calendar).
  for (const row of rows.filter((entry) => !present.has(entry.eventId))) {
    try {
      await api.deleteObject(row.href, row.etag, auth);
    } catch (error) {
      if (error instanceof CaldavError && error.code === "conflict") continue; // changed remotely: the next pull restores it
      if (linkWide(error)) throw error;
      rejected += 1;
      continue;
    }
    dropObject(link.calendarId, row.href);
    deleted += 1;
  }

  for (const event of events) {
    if (!present.has(event.id)) continue;
    if (event.allDay ? !event.startDate || !event.endDate : !event.startAt || !event.endAt) continue;
    const row = byEvent.get(event.id);
    const version = localVersion(event, exceptions.get(event.id));
    if (row && version <= row.syncedAt) continue;
    let uid = event.externalUid;
    if (!uid) {
      uid = `${event.id}@management-platform`;
      db.update(calendarEvents).set({ externalUid: uid }).where(eq(calendarEvents.id, event.id)).run();
    }
    // cuid2 ids are URL-safe, so the href we build matches the one the server reports back.
    const href = row?.href ?? resolveDavUrl(`${new URL(link.collectionUrl).pathname}${event.id}.ics`);
    let etag: string | null;
    try {
      etag = await api.putObject(href, eventToIcs(uid, event, exceptions.get(event.id)), row?.etag ?? null, auth);
    } catch (error) {
      if (error instanceof CaldavError && error.code === "conflict") continue; // Nextcloud wins; the next pull brings its version
      if (linkWide(error)) throw error;
      console.warn(JSON.stringify({ event: "calendar_caldav_push_rejected", calendarId: link.calendarId, eventId: event.id, reason: String(error) }));
      rejected += 1;
      continue;
    }
    saveObject(link.calendarId, { href, eventId: event.id, etag, syncedAt: version });
    pushed += 1;
  }
  if (rejected) throw new CaldavError("bad_response", `${rejected} changes rejected`);
  return { pushed, deleted };
}

async function runSync(calendarId: string, api: CaldavApi): Promise<CaldavSyncResult> {
  const found = db
    .select({ link: calendarCaldavLinks, ownerId: calendars.ownerId })
    .from(calendarCaldavLinks)
    .innerJoin(calendars, eq(calendarCaldavLinks.calendarId, calendars.id))
    .where(eq(calendarCaldavLinks.calendarId, calendarId))
    .get();
  if (!found) return { ok: false, error: "not_found" };
  const attemptAt = new Date();
  try {
    const auth = caldavAuthFor(found.link.userId);
    const pulled = await pull(found.link, found.ownerId, auth, api);
    const link = db.select().from(calendarCaldavLinks).where(eq(calendarCaldavLinks.calendarId, calendarId)).get();
    const { pushed, deleted } = link ? await push(link, auth, api) : { pushed: 0, deleted: 0 };
    db.update(calendarCaldavLinks)
      .set({ lastAttemptAt: attemptAt, lastSyncedAt: new Date(), lastError: null })
      .where(eq(calendarCaldavLinks.calendarId, calendarId))
      .run();
    return { ok: true, pulled, pushed, deleted };
  } catch (error) {
    const code = error instanceof CaldavError ? error.code : "bad_response";
    db.update(calendarCaldavLinks)
      .set({ lastAttemptAt: attemptAt, lastError: code })
      .where(eq(calendarCaldavLinks.calendarId, calendarId))
      .run();
    console.warn(JSON.stringify({ event: "calendar_caldav_sync_failed", calendarId, code, reason: error instanceof Error ? error.message : String(error) }));
    return { ok: false, error: code };
  }
}

const running = new Map<string, Promise<CaldavSyncResult>>();

/** Syncs one linked calendar both ways; concurrent calls for the same calendar share one run. */
export function syncCaldavCalendar(calendarId: string, api: CaldavApi = client) {
  const pending = running.get(calendarId);
  if (pending) return pending;
  const run = runSync(calendarId, api).finally(() => running.delete(calendarId));
  running.set(calendarId, run);
  return run;
}

/**
 * Syncs links not attempted within the interval. Links whose login failed wait for
 * a manual sync or a new app password, so Nextcloud's brute-force protection is not triggered.
 */
export async function syncDueCaldavCalendars(now = new Date(), api: CaldavApi = client) {
  const due = db
    .select({ calendarId: calendarCaldavLinks.calendarId })
    .from(calendarCaldavLinks)
    .where(and(
      or(isNull(calendarCaldavLinks.lastAttemptAt), lt(calendarCaldavLinks.lastAttemptAt, new Date(now.getTime() - CALDAV_SYNC_INTERVAL_MS + 5_000))),
      or(isNull(calendarCaldavLinks.lastError), ne(calendarCaldavLinks.lastError, "auth_failed")),
    ))
    .all();
  for (const { calendarId } of due) await syncCaldavCalendar(calendarId, api);
  return due.length;
}

/** Startup: two-way syncs linked Nextcloud calendars every minute. */
export function startCaldavSync() {
  const state = globalThis as typeof globalThis & { __calendarCaldavSync?: ReturnType<typeof setInterval> };
  if (state.__calendarCaldavSync) return;
  const tick = () => {
    syncDueCaldavCalendars().catch((error) =>
      console.warn(JSON.stringify({ event: "calendar_caldav_tick_failed", reason: error instanceof Error ? error.message : String(error) })),
    );
  };
  setTimeout(tick, 45_000).unref?.();
  state.__calendarCaldavSync = setInterval(tick, CALDAV_SYNC_INTERVAL_MS);
  state.__calendarCaldavSync.unref?.();
}
