import "server-only";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { assignedTo } from "@/modules/projects/assignees";
import { claimDueRemindersForUser } from "@/modules/calendar/reminder-delivery";
import { listNotifications } from "@/modules/wiki/research-queries";
import { notificationHref } from "@/modules/wiki/notification-href";
import { vapidConfig } from "./config";
import { activityPayload, businessClock, calendarPayload, tasksDuePayload } from "./messages";
import { pushDeliveries } from "./schema";
import { claimPushDelivery, pushRecipients, sendPushToUser } from "./send";

const TICK_MS = 30_000;
// Older unread notifications (e.g. from before a device subscribed) are not pushed.
const ACTIVITY_WINDOW_MS = 10 * 60_000;
// The daily digest goes out from 08:00 business time; a server that was down all day skips it.
const DIGEST_FROM_HOUR = 8;
const DIGEST_UNTIL_HOUR = 18;
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60_000;

/** Inbox notifications (task assignments, mentions, replies) as they are created. */
export async function pushActivity(now = new Date()) {
  for (const userId of pushRecipients("activity")) {
    const fresh = listNotifications(userId, true)
      .filter((item) => now.getTime() - item.createdAt.getTime() < ACTIVITY_WINDOW_MS);
    for (const item of fresh.reverse()) {
      if (!claimPushDelivery(userId, `notification:${item.id}`)) continue;
      await sendPushToUser(userId, (locale) => activityPayload(locale, { ...item, href: notificationHref(item) }));
    }
  }
}

/** Calendar reminders; claiming them here means the calendar page's in-app toast is skipped. */
export async function pushCalendarReminders(now = new Date()) {
  for (const userId of pushRecipients("calendar")) {
    for (const reminder of claimDueRemindersForUser(userId, now)) {
      await sendPushToUser(userId, (locale) => calendarPayload(locale, reminder));
    }
  }
}

export function openItemsDueOn(userId: string, date: string) {
  return db.select({ title: tasks.title }).from(tasks)
    .where(and(
      eq(tasks.status, "open"),
      eq(tasks.dueDate, date),
      or(
        and(eq(tasks.kind, "task"), assignedTo(userId)),
        and(eq(tasks.kind, "deadline"), eq(tasks.assigneeId, userId)),
      ),
    ))
    .orderBy(asc(tasks.title))
    .all()
    .map((row) => row.title);
}

/** One morning summary of the user's open tasks and deadlines due today. */
export async function pushTasksDue(now = new Date()) {
  const { date, hour } = businessClock(now);
  if (hour < DIGEST_FROM_HOUR || hour >= DIGEST_UNTIL_HOUR) return;
  for (const userId of pushRecipients("tasksDue")) {
    if (!claimPushDelivery(userId, `tasks-due:${date}`)) continue;
    const titles = openItemsDueOn(userId, date);
    if (titles.length) await sendPushToUser(userId, (locale) => tasksDuePayload(locale, date, titles));
  }
}

async function tick() {
  if (!vapidConfig()) return;
  const now = new Date();
  await pushActivity(now);
  await pushCalendarReminders(now);
  await pushTasksDue(now);
  db.delete(pushDeliveries)
    .where(lt(pushDeliveries.createdAt, new Date(now.getTime() - DELIVERY_RETENTION_MS))).run();
}

export function startPushWorker() {
  const state = globalThis as typeof globalThis & { __pushWorker?: ReturnType<typeof setInterval>; __pushWorkerBusy?: boolean };
  if (state.__pushWorker) return;
  const run = () => {
    if (state.__pushWorkerBusy) return;
    state.__pushWorkerBusy = true;
    tick()
      .catch((error) => console.warn(JSON.stringify({ event: "push_tick_failed", reason: error instanceof Error ? error.message : String(error) })))
      .finally(() => { state.__pushWorkerBusy = false; });
  };
  state.__pushWorker = setInterval(run, TICK_MS);
  state.__pushWorker.unref?.();
}
