import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
vi.mock("server-only", () => ({}));
const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(message: string, public statusCode: number) { super(message); }
  }
  return { default: { sendNotification }, WebPushError };
});
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
import webpush from "web-push";
import { db, sqlite } from "@/db";
import { calendarEvents, calendarReminders, calendars, taskAssignees, tasks, user, wikiNotifications } from "@/db/schema";
import { pushDeliveries, pushPreferences, pushSubscriptions } from "./schema";
import { pushActivity, pushCalendarReminders, pushTasksDue } from "./worker";

const payloads = () => vi.mocked(webpush.sendNotification).mock.calls.map((call) => JSON.parse(call[1] as string));

beforeAll(() => {
  process.env.VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  const now = new Date();
  db.insert(user).values([
    { id: "anna", name: "Anna", email: "a@example.com", role: "member", createdAt: now, updatedAt: now },
    { id: "ben", name: "Ben", email: "b@example.com", role: "member", createdAt: now, updatedAt: now },
  ]).run();
});
beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue({});
  db.delete(pushDeliveries).run();
  db.delete(pushPreferences).run();
  db.delete(pushSubscriptions).run();
  db.insert(pushSubscriptions).values({ userId: "anna", endpoint: "https://fcm.googleapis.com/fcm/send/anna", p256dh: "k", auth: "a", locale: "en" }).run();
});
afterEach(() => vi.useRealTimers());
afterAll(() => sqlite.close());

it("pushes each new inbox notification once, linked to its task", async () => {
  const task = db.insert(tasks).values({ title: "Write grant report", createdBy: "ben" }).returning().get();
  db.insert(wikiNotifications).values([
    { userId: "anna", actorId: "ben", type: "assignment", taskId: task.id },
    // Older than the push window: already seen in the inbox, never pushed.
    { userId: "anna", actorId: "ben", type: "mention", createdAt: new Date(Date.now() - 60 * 60_000) },
    // Ben has no device.
    { userId: "ben", actorId: "anna", type: "assignment", taskId: task.id },
  ]).run();
  await pushActivity();
  await pushActivity();
  expect(payloads()).toEqual([expect.objectContaining({
    title: "Write grant report",
    body: "Ben assigned you on Write grant report",
    url: expect.stringContaining(`task=${task.id}`),
  })]);
});

it("respects category preferences", async () => {
  db.insert(pushPreferences).values({ userId: "anna", activity: false, calendar: true, tasksDue: true }).run();
  db.insert(wikiNotifications).values({ userId: "anna", actorId: "ben", type: "reply" }).run();
  await pushActivity();
  expect(sendNotification).not.toHaveBeenCalled();
});

it("sends due calendar reminders and claims them so the in-app toast skips them", async () => {
  db.insert(calendars).values({ id: "cal", ownerId: "anna", name: "Mine" }).run();
  db.insert(calendarEvents).values({
    id: "standup", calendarId: "cal", title: "Standup", timezone: "Europe/Vienna",
    startAt: new Date("2026-10-14T07:00:00Z"), endAt: new Date("2026-10-14T07:15:00Z"), createdBy: "anna",
  }).run();
  db.insert(calendarReminders).values({ eventId: "standup", userId: "anna", minutesBefore: 10 }).run();
  const now = new Date("2026-10-14T06:50:30Z");
  await pushCalendarReminders(now);
  await pushCalendarReminders(now);
  expect(payloads()).toEqual([{ title: "Standup", body: "Starting at 9:00 AM", url: "/calendar?date=2026-10-14", tag: "calendar:standup:2026-10-14T07:00:00.000Z" }]);
});

it("sends one morning summary of open tasks and deadlines due today", async () => {
  const today = "2026-10-15";
  const task = db.insert(tasks).values({ title: "Submit invoice", dueDate: today, createdBy: "ben" }).returning().get();
  db.insert(taskAssignees).values({ taskId: task.id, userId: "anna" }).run();
  db.insert(tasks).values([
    { title: "Funding deadline", kind: "deadline", assigneeId: "anna", dueDate: today, createdBy: "ben" },
    { title: "Already done", kind: "deadline", assigneeId: "anna", dueDate: today, status: "done", createdBy: "ben" },
    { title: "Tomorrow", kind: "deadline", assigneeId: "anna", dueDate: "2026-10-16", createdBy: "ben" },
  ]).run();
  await pushTasksDue(new Date("2026-10-15T05:30:00Z")); // 07:30 in Vienna: too early
  expect(sendNotification).not.toHaveBeenCalled();
  await pushTasksDue(new Date("2026-10-15T06:00:00Z")); // 08:00 in Vienna
  await pushTasksDue(new Date("2026-10-15T09:00:00Z"));
  expect(payloads()).toEqual([{ title: "2 tasks due today", body: "Funding deadline, Submit invoice", url: "/", tag: `tasks-due:${today}` }]);
});

it("drops subscriptions the push service reports as gone", async () => {
  const { WebPushError } = await import("web-push");
  sendNotification.mockRejectedValue(new (WebPushError as unknown as new (m: string, s: number) => Error)("Gone", 410));
  db.insert(wikiNotifications).values({ userId: "anna", actorId: "ben", type: "reply" }).run();
  await pushActivity();
  expect(db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, "anna")).all()).toEqual([]);
});
