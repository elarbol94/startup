import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEventExceptions,
  calendarEvents,
  calendarSubscriptions,
  calendars,
  user,
} from "@/db/schema";
import { requireCalendarEditor } from "./event-action-helpers";
import {
  icsTextsFromUpload,
  importIcsTexts,
  normalizeFeedUrl,
  syncCalendarSubscription,
  syncDueSubscriptions,
} from "./ics-sync";
import { listCalendarWorkspace } from "./queries";

const FEED_URL = "https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-secret/basic.ics";

const event = (uid: string, summary: string, extra: string[] = []) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  "DTSTART;TZID=Europe/Vienna:20261005T090000",
  "DTEND;TZID=Europe/Vienna:20261005T100000",
  `SUMMARY:${summary}`,
  ...extra,
  "END:VEVENT",
];
const feed = (...events: string[][]) =>
  ["BEGIN:VCALENDAR", "X-WR-TIMEZONE:Europe/Vienna", ...events.flat(), "END:VCALENDAR"].join("\r\n");

function rows(calendarId: string) {
  return db.select().from(calendarEvents).where(eq(calendarEvents.calendarId, calendarId)).all();
}

beforeAll(() => {
  const now = new Date();
  db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.com", createdAt: now, updatedAt: now }).run();
  db.insert(calendars).values([
    { id: "mine", ownerId: "owner", name: "Mine" },
    { id: "google", ownerId: "owner", name: "Google" },
  ]).run();
  db.insert(calendarSubscriptions).values({ calendarId: "google", url: FEED_URL }).run();
});

describe("normalizeFeedUrl", () => {
  it("turns webcal links into https and rejects other schemes", () => {
    expect(normalizeFeedUrl("webcal://example.org/feed.ics")).toBe("https://example.org/feed.ics");
    expect(normalizeFeedUrl(" example.org/feed.ics ")).toBe("https://example.org/feed.ics");
    expect(() => normalizeFeedUrl("file:///etc/passwd")).toThrow("invalid_url");
    expect(() => normalizeFeedUrl("https://user:pw@example.org/a.ics")).toThrow("invalid_url");
  });
});

describe("syncCalendarSubscription", () => {
  it("mirrors the feed: creates, updates in place, removes and skips unchanged rows", async () => {
    const first = await syncCalendarSubscription("google", {
      fetcher: async () =>
        feed(
          event("a", "Alpha"),
          event("b", "Beta"),
          event("s", "Series", ["RRULE:FREQ=WEEKLY", "EXDATE;TZID=Europe/Vienna:20261012T090000"]),
        ),
    });
    expect(first).toEqual({ ok: true, created: 3, updated: 0, removed: 0, skipped: 0 });
    const alpha = rows("google").find((row) => row.externalUid === "a")!;

    const unchanged = await syncCalendarSubscription("google", {
      fetcher: async () =>
        feed(
          event("a", "Alpha"),
          event("b", "Beta"),
          event("s", "Series", ["RRULE:FREQ=WEEKLY", "EXDATE;TZID=Europe/Vienna:20261012T090000"]),
        ),
    });
    expect(unchanged).toMatchObject({ created: 0, updated: 0, removed: 0 });

    const changed = await syncCalendarSubscription("google", {
      fetcher: async () =>
        feed(
          event("a", "Alpha renamed"),
          event("s", "Series", ["RRULE:FREQ=WEEKLY", "EXDATE;TZID=Europe/Vienna:20261019T090000"]),
        ),
    });
    expect(changed).toMatchObject({ created: 0, updated: 2, removed: 1 });
    const after = rows("google");
    expect(after.map((row) => row.externalUid).sort()).toEqual(["a", "s"]);
    // Updated in place, so reminders and links keyed by the event id survive.
    expect(after.find((row) => row.externalUid === "a")).toMatchObject({ id: alpha.id, title: "Alpha renamed" });
    const series = after.find((row) => row.externalUid === "s")!;
    expect(
      db.select().from(calendarEventExceptions).where(eq(calendarEventExceptions.eventId, series.id)).all()
        .map((exception) => exception.occurrenceKey),
    ).toEqual(["2026-10-19T07:00:00.000Z"]);
    expect(db.select().from(calendarSubscriptions).get()).toMatchObject({ lastError: null });
  });

  it("records a failed download without touching events", async () => {
    const before = rows("google").length;
    const result = await syncCalendarSubscription("google", {
      fetcher: async () => {
        throw new Error("The linked page returned 404");
      },
    });
    expect(result).toEqual({ ok: false, error: "http_error" });
    expect(rows("google")).toHaveLength(before);
    expect(db.select().from(calendarSubscriptions).get()).toMatchObject({ lastError: "http_error" });

    const html = await syncCalendarSubscription("google", { fetcher: async () => "<html></html>" });
    expect(html).toEqual({ ok: false, error: "not_calendar" });
  });

  it("only re-syncs subscriptions that are due", async () => {
    const fetcher = vi.fn(async () => feed(event("a", "Alpha renamed")));
    expect(await syncDueSubscriptions(new Date(), fetcher)).toBe(0);
    expect(await syncDueSubscriptions(new Date(Date.now() + 31 * 60_000), fetcher)).toBe(1);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("makes subscribed calendars read-only", () => {
    expect(() => requireCalendarEditor("google", "owner")).toThrow("read-only");
    expect(requireCalendarEditor("mine", "owner")).toBe("owner");
    const workspace = listCalendarWorkspace({ userId: "owner", from: "2026-10-05", to: "2026-10-12" });
    expect(workspace.calendars.find((calendar) => calendar.id === "google")?.subscription).toMatchObject({
      host: "calendar.google.com",
      lastError: null,
    });
    expect(JSON.stringify(workspace)).not.toContain("private-secret");
    expect(workspace.items.filter((item) => item.calendarId === "google").every((item) => !item.editable)).toBe(true);
  });
});

describe("importIcsTexts", () => {
  it("imports once and skips UIDs the calendar already has", () => {
    const files = [{ name: "a.ics", text: feed(event("x", "Import X"), event("y", "Import Y")) }];
    expect(importIcsTexts({ calendarId: "mine", userId: "owner", timezone: "Europe/Vienna", files })).toMatchObject({
      created: 2,
      skipped: 0,
      files: 1,
    });
    db.update(calendarEvents).set({ title: "Edited locally" }).where(eq(calendarEvents.externalUid, "x")).run();
    expect(importIcsTexts({ calendarId: "mine", userId: "owner", timezone: "Europe/Vienna", files })).toMatchObject({
      created: 0,
      skipped: 2,
    });
    expect(rows("mine").find((row) => row.externalUid === "x")?.title).toBe("Edited locally");
  });

  it("rejects files that are not iCalendar", () => {
    expect(() =>
      importIcsTexts({ calendarId: "mine", userId: "owner", timezone: "UTC", files: [{ name: "a.txt", text: "hello" }] }),
    ).toThrow("not_calendar");
  });
});

describe("icsTextsFromUpload", () => {
  it("reads the .ics entries of a Google export zip", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const zip = zipSync({
      "Takeout/Calendar/Work.ics": strToU8(feed(event("w", "Work"))),
      "Takeout/Calendar/readme.txt": strToU8("ignore me"),
    });
    const files = icsTextsFromUpload("calendar.zip", zip);
    expect(files.map((file) => file.name)).toEqual(["Work.ics"]);
    expect(files[0].text).toContain("SUMMARY:Work");
  });
});
