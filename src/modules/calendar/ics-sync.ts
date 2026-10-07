// Writes parsed iCalendar events into a calendar: one-time imports and the
// periodic mirror of subscribed feeds (e.g. Google Calendar's secret iCal address).
// Used by subscription-actions.ts, the import API route and src/instrumentation.ts.
import "server-only";

import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { unzipSync } from "fflate";
import { db } from "@/db";
import { fetchPublicText } from "@/lib/public-fetch";
import {
  calendarEventExceptions,
  calendarEvents,
  calendarPreferences,
  calendarSubscriptions,
  calendars,
} from "./schema";
import { requireCalendarEditor } from "./event-action-helpers";
import { looksLikeIcs, parseIcsFeed, type IcsEvent } from "./ics-feed";

const DEFAULT_TIMEZONE = "Europe/Berlin";
const FEED_MAX_BYTES = 20 * 1024 * 1024;
const IMPORT_MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;
const MAX_EVENTS = 20_000;
/** Single events that ended longer ago are not mirrored; series are always kept. */
const SUBSCRIPTION_HISTORY_DAYS = 365;
export const SUBSCRIPTION_SYNC_INTERVAL_MS = 30 * 60_000;
const WORKER_TICK_MS = 5 * 60_000;

export const subscriptionErrorCodes = [
  "invalid_url",
  "private_url",
  "too_large",
  "http_error",
  "not_calendar",
  "fetch_failed",
] as const;
export type SubscriptionErrorCode = (typeof subscriptionErrorCodes)[number];

export class CalendarFeedError extends Error {
  constructor(readonly code: SubscriptionErrorCode) {
    super(code);
  }
}

export type IcsApplyResult = {
  created: number;
  updated: number;
  removed: number;
  skipped: number;
};

/** Accepts `webcal://` links and bare hosts; only public HTTP(S) URLs remain. */
export function normalizeFeedUrl(value: string) {
  const trimmed = value.trim().replace(/^webcals?:\/\//i, "https://");
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new CalendarFeedError("invalid_url");
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) {
    throw new CalendarFeedError("invalid_url");
  }
  return url.toString();
}

function ownerTimezone(ownerId: string) {
  return (
    db
      .select({ timezone: calendarPreferences.timezone })
      .from(calendarPreferences)
      .where(eq(calendarPreferences.userId, ownerId))
      .get()?.timezone ?? DEFAULT_TIMEZONE
  );
}

function eventValues(event: IcsEvent) {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    allDay: event.allDay,
    startDate: event.startDate,
    endDate: event.endDate,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    availability: event.availability,
    recurrenceRule: event.recurrenceRule,
    status: "confirmed" as const,
  };
}

type EventRow = typeof calendarEvents.$inferSelect;

function sameValues(row: EventRow, values: ReturnType<typeof eventValues>) {
  return (
    row.title === values.title &&
    row.description === values.description &&
    row.location === values.location &&
    row.allDay === values.allDay &&
    row.startDate === values.startDate &&
    row.endDate === values.endDate &&
    (row.startAt?.getTime() ?? null) === (values.startAt?.getTime() ?? null) &&
    (row.endAt?.getTime() ?? null) === (values.endAt?.getTime() ?? null) &&
    row.timezone === values.timezone &&
    row.availability === values.availability &&
    row.recurrenceRule === values.recurrenceRule &&
    row.status === values.status
  );
}

function chunks<T>(values: T[], size = 500) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Upserts events by iCalendar UID. `mirror` makes the calendar match the feed
 * (changed rows are updated, vanished ones deleted); `import` only adds UIDs the
 * calendar does not have yet, so local edits of earlier imports are kept.
 * Unchanged rows are not rewritten, which keeps the version journal quiet.
 */
export function applyIcsEvents(input: {
  calendarId: string;
  userId: string;
  events: IcsEvent[];
  mode: "mirror" | "import";
}): IcsApplyResult {
  const result: IcsApplyResult = { created: 0, updated: 0, removed: 0, skipped: 0 };
  const now = new Date();
  db.transaction((tx) => {
    const existing = new Map(
      tx
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.calendarId, input.calendarId), isNotNull(calendarEvents.externalUid)))
        .all()
        .map((row) => [row.externalUid!, row]),
    );
    const exceptionsByEvent = new Map<string, (typeof calendarEventExceptions.$inferSelect)[]>();
    if (input.mode === "mirror") {
      for (const ids of chunks([...existing.values()].map((row) => row.id))) {
        for (const exception of tx
          .select()
          .from(calendarEventExceptions)
          .where(inArray(calendarEventExceptions.eventId, ids))
          .all()) {
          const list = exceptionsByEvent.get(exception.eventId) ?? [];
          list.push(exception);
          exceptionsByEvent.set(exception.eventId, list);
        }
      }
    }

    const seen = new Set<string>();
    for (const event of input.events) {
      if (seen.has(event.uid)) continue;
      seen.add(event.uid);
      const values = eventValues(event);
      const row = existing.get(event.uid);
      let eventId: string;
      if (row) {
        if (input.mode === "import") {
          result.skipped += 1;
          continue;
        }
        eventId = row.id;
        let changed = false;
        if (!sameValues(row, values)) {
          tx.update(calendarEvents).set({ ...values, updatedAt: now }).where(eq(calendarEvents.id, row.id)).run();
          changed = true;
        }
        const current = new Map((exceptionsByEvent.get(row.id) ?? []).map((exception) => [exception.occurrenceKey, exception]));
        const desired = new Map(event.exceptions.map((exception) => [exception.occurrenceKey, exception]));
        const stale = [...current.values()].filter((exception) => !desired.has(exception.occurrenceKey)).map((exception) => exception.id);
        for (const ids of chunks(stale)) {
          tx.delete(calendarEventExceptions).where(inArray(calendarEventExceptions.id, ids)).run();
        }
        changed ||= stale.length > 0;
        for (const exception of desired.values()) {
          const overrideJson = JSON.stringify(exception.override);
          const previous = current.get(exception.occurrenceKey);
          if (previous && previous.cancelled === exception.cancelled && previous.overrideJson === overrideJson) continue;
          changed = true;
          if (previous) {
            tx.update(calendarEventExceptions)
              .set({ cancelled: exception.cancelled, overrideJson, updatedAt: now })
              .where(eq(calendarEventExceptions.id, previous.id))
              .run();
          } else {
            tx.insert(calendarEventExceptions)
              .values({ eventId, occurrenceKey: exception.occurrenceKey, cancelled: exception.cancelled, overrideJson })
              .run();
          }
        }
        if (changed) result.updated += 1;
        continue;
      }
      eventId = tx
        .insert(calendarEvents)
        .values({
          ...values,
          calendarId: input.calendarId,
          kind: "event",
          externalUid: event.uid,
          createdBy: input.userId,
        })
        .returning({ id: calendarEvents.id })
        .get().id;
      for (const exception of event.exceptions) {
        tx.insert(calendarEventExceptions)
          .values({
            eventId,
            occurrenceKey: exception.occurrenceKey,
            cancelled: exception.cancelled,
            overrideJson: JSON.stringify(exception.override),
          })
          .run();
      }
      result.created += 1;
    }

    if (input.mode === "mirror") {
      const vanished = [...existing.values()].filter((row) => !seen.has(row.externalUid!)).map((row) => row.id);
      for (const ids of chunks(vanished)) {
        tx.delete(calendarEvents).where(inArray(calendarEvents.id, ids)).run();
      }
      result.removed = vanished.length;
    }
  });
  return result;
}

function feedErrorCode(error: unknown): SubscriptionErrorCode {
  if (error instanceof CalendarFeedError) return error.code;
  const message = error instanceof Error ? error.message : "";
  if (/private network/i.test(message)) return "private_url";
  if (/too large/i.test(message)) return "too_large";
  if (/returned \d+|redirect/i.test(message)) return "http_error";
  if (/invalid url/i.test(message)) return "invalid_url";
  return "fetch_failed";
}

export type FetchFeed = (url: string) => Promise<string>;

const fetchFeed: FetchFeed = async (url) =>
  (
    await fetchPublicText(url, {
      maxBytes: FEED_MAX_BYTES,
      redirects: 3,
      headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.1" },
    })
  ).body;

/** Downloads a feed and checks it is iCalendar; throws CalendarFeedError. */
export async function downloadFeed(url: string, fetcher: FetchFeed = fetchFeed) {
  let body: string;
  try {
    body = await fetcher(normalizeFeedUrl(url));
  } catch (error) {
    throw new CalendarFeedError(feedErrorCode(error));
  }
  if (!looksLikeIcs(body)) throw new CalendarFeedError("not_calendar");
  return body;
}

export type SubscriptionSyncResult =
  | ({ ok: true } & IcsApplyResult)
  | { ok: false; error: SubscriptionErrorCode };

const running = new Map<string, Promise<SubscriptionSyncResult>>();

async function runSync(calendarId: string, fetcher: FetchFeed, feedText?: string): Promise<SubscriptionSyncResult> {
  const subscription = db
    .select({ url: calendarSubscriptions.url, ownerId: calendars.ownerId })
    .from(calendarSubscriptions)
    .innerJoin(calendars, eq(calendarSubscriptions.calendarId, calendars.id))
    .where(eq(calendarSubscriptions.calendarId, calendarId))
    .get();
  if (!subscription) return { ok: false, error: "fetch_failed" };
  const attemptAt = new Date();
  try {
    const text = feedText ?? (await downloadFeed(subscription.url, fetcher));
    const feed = parseIcsFeed(text, {
      fallbackTimezone: ownerTimezone(subscription.ownerId),
      endsAfter: new Date(attemptAt.getTime() - SUBSCRIPTION_HISTORY_DAYS * 86_400_000),
      maxEvents: MAX_EVENTS,
    });
    const result = applyIcsEvents({ calendarId, userId: subscription.ownerId, events: feed.events, mode: "mirror" });
    db.update(calendarSubscriptions)
      .set({ lastAttemptAt: attemptAt, lastSyncedAt: new Date(), lastError: null })
      .where(eq(calendarSubscriptions.calendarId, calendarId))
      .run();
    return { ok: true, ...result };
  } catch (error) {
    const code = feedErrorCode(error);
    db.update(calendarSubscriptions)
      .set({ lastAttemptAt: attemptAt, lastError: code })
      .where(eq(calendarSubscriptions.calendarId, calendarId))
      .run();
    console.warn(JSON.stringify({ event: "calendar_subscription_sync_failed", calendarId, code }));
    return { ok: false, error: code };
  }
}

/**
 * Mirrors one subscribed calendar from its feed. Concurrent calls for the same
 * calendar share one run. `feedText` skips the download (already fetched).
 */
export function syncCalendarSubscription(
  calendarId: string,
  options: { fetcher?: FetchFeed; feedText?: string } = {},
) {
  const pending = running.get(calendarId);
  if (pending) return pending;
  const run = runSync(calendarId, options.fetcher ?? fetchFeed, options.feedText).finally(() => running.delete(calendarId));
  running.set(calendarId, run);
  return run;
}

/** Syncs every subscription whose last attempt is older than the interval. */
export async function syncDueSubscriptions(now = new Date(), fetcher?: FetchFeed) {
  const due = db
    .select({ calendarId: calendarSubscriptions.calendarId })
    .from(calendarSubscriptions)
    .where(
      or(
        isNull(calendarSubscriptions.lastAttemptAt),
        lt(calendarSubscriptions.lastAttemptAt, new Date(now.getTime() - SUBSCRIPTION_SYNC_INTERVAL_MS)),
      ),
    )
    .all();
  for (const { calendarId } of due) await syncCalendarSubscription(calendarId, { fetcher });
  return due.length;
}

/** Startup: re-syncs subscribed calendars in the background every few minutes. */
export function startCalendarSubscriptionSync() {
  const state = globalThis as typeof globalThis & { __calendarSubscriptionSync?: ReturnType<typeof setInterval> };
  if (state.__calendarSubscriptionSync) return;
  const tick = () => {
    syncDueSubscriptions().catch((error) =>
      console.warn(JSON.stringify({ event: "calendar_subscription_tick_failed", reason: error instanceof Error ? error.message : String(error) })),
    );
  };
  setTimeout(tick, 30_000).unref?.();
  state.__calendarSubscriptionSync = setInterval(tick, WORKER_TICK_MS);
  state.__calendarSubscriptionSync.unref?.();
}

/** Reads `.ics` files, or the `.ics` entries of a zip such as Google's export. */
export function icsTextsFromUpload(name: string, bytes: Uint8Array) {
  if (/\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    let total = 0;
    const entries = unzipSync(bytes, {
      filter: (file) => {
        if (!/\.ics$/i.test(file.name)) return false;
        total += file.originalSize;
        if (total > IMPORT_MAX_UNZIPPED_BYTES) throw new Error("too_large");
        return true;
      },
    });
    return Object.entries(entries).map(([entryName, content]) => ({
      name: entryName.split("/").pop() ?? entryName,
      text: new TextDecoder().decode(content),
    }));
  }
  return [{ name, text: new TextDecoder().decode(bytes) }];
}

/** One-time import of iCalendar files into a calendar the user may edit. */
export function importIcsTexts(input: {
  calendarId: string;
  userId: string;
  timezone: string;
  files: { name: string; text: string }[];
}) {
  const calendarFiles = input.files.filter((file) => looksLikeIcs(file.text));
  if (calendarFiles.length === 0) throw new CalendarFeedError("not_calendar");
  const events: IcsEvent[] = [];
  let skipped = 0;
  for (const file of calendarFiles) {
    const feed = parseIcsFeed(file.text, { fallbackTimezone: input.timezone, maxEvents: MAX_EVENTS - events.length });
    events.push(...feed.events);
    skipped += feed.skipped;
  }
  const result = applyIcsEvents({ calendarId: input.calendarId, userId: input.userId, events, mode: "import" });
  return { ...result, invalid: skipped, files: calendarFiles.length };
}

/** Imports an uploaded `.ics`/`.zip` into a calendar the user can edit. */
export function importCalendarFile(input: {
  calendarId: string;
  userId: string;
  name: string;
  bytes: Uint8Array;
}) {
  requireCalendarEditor(input.calendarId, input.userId);
  let files: { name: string; text: string }[];
  try {
    files = icsTextsFromUpload(input.name, input.bytes);
  } catch (error) {
    throw new CalendarFeedError(error instanceof Error && error.message === "too_large" ? "too_large" : "not_calendar");
  }
  return importIcsTexts({
    calendarId: input.calendarId,
    userId: input.userId,
    timezone: ownerTimezone(input.userId),
    files,
  });
}
