import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
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
import { calendarEventAttendees, calendarEvents, calendars } from "./schema";
import { listCalendarWorkspace } from "./queries";

beforeAll(() => {
  const now = new Date();
  db.insert(user).values([
    { id: "owner", name: "Owner", email: "o@example.com", role: "member", createdAt: now, updatedAt: now },
    { id: "guest", name: "Guest", email: "g@example.com", role: "member", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(calendars).values({ id: "cal", ownerId: "owner", name: "Mine" }).run();
  db.insert(calendarEvents).values([
    { id: "invite", calendarId: "cal", title: "Invite", timezone: "UTC", startAt: new Date("2026-10-02T10:00:00Z"), endAt: new Date("2026-10-02T11:00:00Z"), createdBy: "guest" },
    { id: "solo", calendarId: "cal", title: "Solo", timezone: "UTC", startAt: new Date("2026-10-02T12:00:00Z"), endAt: new Date("2026-10-02T13:00:00Z"), createdBy: "owner" },
  ]).run();
  db.insert(calendarEventAttendees).values([
    { eventId: "invite", userId: "owner", response: "tentative" },
    { eventId: "invite", userId: "guest", response: "accepted" },
  ]).run();
});
afterAll(() => sqlite.close());

it("exposes the current user's RSVP and every attendee's response", () => {
  const { items } = listCalendarWorkspace({ userId: "owner", from: "2026-10-01", to: "2026-10-05" });
  const invite = items.find((item) => item.sourceId === "invite");
  const solo = items.find((item) => item.sourceId === "solo");
  expect(invite?.myResponse).toBe("tentative");
  expect(invite?.attendeeResponses).toEqual({ owner: "tentative", guest: "accepted" });
  expect(solo?.myResponse).toBeNull();
  expect(solo?.attendeeResponses).toEqual({});
});
