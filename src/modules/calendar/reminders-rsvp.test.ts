import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: async () => ({ id: "owner", role: "member" }) }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});
import { db, sqlite } from "@/db";
import { user } from "@/db/schema";
import { calendarEventAttendees, calendarEvents, calendarReminders, calendars } from "./schema";
import { claimDueCalendarReminders } from "./reminder-actions";
import { upsertCalendarEvent } from "./actions";

beforeAll(() => {
  const now = new Date();
  db.insert(user).values([
    { id: "owner", name: "Owner", email: "o@example.com", role: "member", createdAt: now, updatedAt: now },
    { id: "guest", name: "Guest", email: "g@example.com", role: "member", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(calendars).values({ id: "cal", ownerId: "owner", name: "Mine" }).run();
});
afterEach(() => vi.useRealTimers());
afterAll(() => sqlite.close());

it("reminds for every occurrence of a series and for reminders set days ahead", async () => {
  db.insert(calendarEvents).values([
    { id: "weekly", calendarId: "cal", title: "Weekly", timezone: "UTC", startAt: new Date("2026-06-03T10:00:00Z"), endAt: new Date("2026-06-03T11:00:00Z"), recurrenceRule: "FREQ=WEEKLY", createdBy: "owner" },
    { id: "trip", calendarId: "cal", title: "Trip", timezone: "UTC", startAt: new Date("2026-06-26T09:46:00Z"), endAt: new Date("2026-06-26T12:00:00Z"), createdBy: "owner" },
  ]).run();
  db.insert(calendarReminders).values([
    { eventId: "weekly", userId: "owner", minutesBefore: 15 },
    { eventId: "trip", userId: "owner", minutesBefore: 2 * 24 * 60 },
  ]).run();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-24T09:46:00Z")); // fourth weekly occurrence, reminder due at 09:45
  expect((await claimDueCalendarReminders()).map((item) => [item.id, item.startAt])).toEqual([
    ["weekly", "2026-06-24T10:00:00.000Z"],
    ["trip", "2026-06-26T09:46:00.000Z"],
  ]);
  expect(await claimDueCalendarReminders()).toEqual([]);
});

it("keeps RSVPs on ordinary edits and asks again when the event moves", async () => {
  const input = {
    calendarId: "cal", title: "Review", allDay: false, startDate: null, endDate: null,
    startAt: "2026-07-01T09:00:00.000Z", endAt: "2026-07-01T10:00:00.000Z", timezone: "Europe/Vienna",
    recurrenceRule: null, attendeeIds: ["guest"], allowConflicts: true,
  };
  const created = await upsertCalendarEvent(input as Parameters<typeof upsertCalendarEvent>[0]);
  const id = (created as { id: string }).id;
  const response = () => db.select().from(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, id)).get()?.response;
  db.update(calendarEventAttendees).set({ response: "accepted" }).where(eq(calendarEventAttendees.eventId, id)).run();
  await upsertCalendarEvent({ ...input, id, title: "Review (typo fixed)" } as Parameters<typeof upsertCalendarEvent>[0]);
  expect(response()).toBe("accepted");
  await upsertCalendarEvent({ ...input, id, startAt: "2026-07-01T11:00:00.000Z", endAt: "2026-07-01T12:00:00.000Z" } as Parameters<typeof upsertCalendarEvent>[0]);
  expect(response()).toBe("needs_action");
});
