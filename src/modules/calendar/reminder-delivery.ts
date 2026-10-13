// Claims due calendar reminders (including recurring occurrences) for one user. Each
// occurrence is claimed once through calendar_reminder_deliveries, so the in-app toast
// (reminder-actions.ts) and the push worker (modules/push/worker.ts) never both deliver it.
import { and, eq, inArray, lt, gt, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEventExceptions,
  calendarEvents,
  calendarReminderDeliveries,
  calendarReminders,
} from "./schema";
import { expandEventOccurrences } from "./recurrence";

export function claimDueRemindersForUser(userId: string, now = new Date()) {
  const lower = new Date(now.getTime() - 2 * 60_000);
  // Reminders may be set up to 30 days ahead (reminderMinutes max).
  const upper = new Date(now.getTime() + 43_200 * 60_000 + 2 * 60_000);
  const candidates = db
    .select({ reminder: calendarReminders, event: calendarEvents })
    .from(calendarReminders)
    .innerJoin(calendarEvents, eq(calendarReminders.eventId, calendarEvents.id))
    .where(
      and(
        eq(calendarReminders.userId, userId),
        eq(calendarEvents.status, "confirmed"),
        eq(calendarEvents.allDay, false),
        lt(calendarEvents.startAt, upper),
        // Series are expanded below; single events must start in the window.
        or(isNotNull(calendarEvents.recurrenceRule), gt(calendarEvents.startAt, lower)),
      ),
    )
    .all();
  const recurringIds = [...new Set(candidates.filter(({ event }) => event.recurrenceRule).map(({ event }) => event.id))];
  const exceptions = recurringIds.length
    ? db.select().from(calendarEventExceptions).where(inArray(calendarEventExceptions.eventId, recurringIds)).all()
    : [];
  const due = candidates.flatMap(({ reminder, event }) =>
    expandEventOccurrences(event, exceptions.filter((row) => row.eventId === event.id), lower, upper)
      .filter((occurrence) => {
        if (!occurrence.startAt || occurrence.startAt <= lower) return false;
        const remindAt = occurrence.startAt.getTime() - reminder.minutesBefore * 60_000;
        return remindAt <= now.getTime() && remindAt >= lower.getTime();
      })
      .map((occurrence) => ({
        reminderId: reminder.id,
        eventId: event.id,
        title: occurrence.title,
        occurrenceKey: occurrence.occurrenceKey,
        startAt: occurrence.startAt!.toISOString(),
      })),
  );
  const delivered: { id: string; title: string; startAt: string }[] = [];
  db.transaction((tx) => {
    for (const reminder of due) {
      const result = tx
        .insert(calendarReminderDeliveries)
        .values({ reminderId: reminder.reminderId, occurrenceKey: reminder.occurrenceKey })
        .onConflictDoNothing()
        .run();
      if (result.changes > 0) {
        delivered.push({
          id: reminder.eventId,
          title: reminder.title,
          startAt: reminder.startAt,
        });
      }
    }
  });
  return delivered;
}
