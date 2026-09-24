"use server";

// Recurring-series actions: single-occurrence overrides, splitting and truncating a series.
// Used by components/calendar-client.tsx.
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import {
  calendarEventAttendees,
  calendarEventExceptions,
  calendarEvents,
  calendarReminders,
} from "./schema";
import { zonedParts } from "./date-utils";
import {
  accessibleUserIds,
  datePattern,
  eventInputSchema,
  requireCalendarEditor,
  timedConflicts,
  type CalendarEventInput,
} from "./event-action-helpers";

const occurrenceSchema = z.object({
  eventId: z.string().min(1),
  occurrenceKey: z.string().min(1).max(200),
  cancelled: z.boolean().default(false),
  override: z
    .object({
      title: z.string().trim().min(1).max(240).optional(),
      description: z.string().max(10_000).optional(),
      location: z.string().max(500).optional(),
      address: z.string().max(1_000).optional(),
      startDate: z.string().regex(datePattern).optional(),
      endDate: z.string().regex(datePattern).optional(),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
    })
    .default({}),
});

export async function upsertCalendarOccurrence(
  input: z.input<typeof occurrenceSchema>,
) {
  const currentUser = await requireUserOrThrow();
  const data = occurrenceSchema.parse(input);
  const event = db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, data.eventId))
    .get();
  if (!event) throw new Error("Event not found");
  requireCalendarEditor(event.calendarId, currentUser.id);
  const now = new Date();
  db.insert(calendarEventExceptions)
    .values({
      eventId: event.id,
      occurrenceKey: data.occurrenceKey,
      cancelled: data.cancelled,
      overrideJson: JSON.stringify(data.override),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        calendarEventExceptions.eventId,
        calendarEventExceptions.occurrenceKey,
      ],
      set: {
        cancelled: data.cancelled,
        overrideJson: JSON.stringify(data.override),
        updatedAt: now,
      },
    })
    .run();
  revalidatePath("/calendar");
}

function recurrenceWithoutBoundary(rule: string) {
  return rule
    .replace(/^RRULE:/, "")
    .split(";")
    .filter(
      (part) =>
        !part.toUpperCase().startsWith("UNTIL=") &&
        !part.toUpperCase().startsWith("COUNT="),
    )
    .join(";");
}

function formatRRuleUntil(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

function recurrenceRuleBefore(
  rule: string,
  occurrenceKey: string,
  allDay: boolean,
  timezone: string,
) {
  let wallClockOccurrence: Date;
  if (allDay) {
    wallClockOccurrence = new Date(`${occurrenceKey}T00:00:00.000Z`);
  } else {
    const parts = zonedParts(new Date(occurrenceKey), timezone);
    wallClockOccurrence = new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ),
    );
  }
  const until = new Date(wallClockOccurrence.getTime() - 1000);
  return `${recurrenceWithoutBoundary(rule)};UNTIL=${formatRRuleUntil(until)}`;
}

export async function splitCalendarEventSeries(input: {
  event: CalendarEventInput;
  occurrenceKey: string;
}) {
  const currentUser = await requireUserOrThrow();
  const occurrenceKey = z.string().min(1).max(200).parse(input.occurrenceKey);
  const data = eventInputSchema.parse(input.event);
  if (!data.id) throw new Error("Recurring event ID is required");
  const existing = db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, data.id))
    .get();
  if (!existing?.recurrenceRule) throw new Error("Recurring event not found");
  requireCalendarEditor(existing.calendarId, currentUser.id);
  requireCalendarEditor(data.calendarId, currentUser.id);
  if (
    data.expectedUpdatedAt &&
    existing.updatedAt.toISOString() !== data.expectedUpdatedAt
  ) {
    throw new Error("Event changed in another session");
  }
  const startAt = data.startAt ? new Date(data.startAt) : null;
  const endAt = data.endAt ? new Date(data.endAt) : null;
  const attendeeIds = accessibleUserIds(data.attendeeIds).filter(
    (id) => id !== currentUser.id,
  );
  const conflicts =
    !data.allDay && data.availability === "busy" && startAt && endAt
      ? timedConflicts({
          eventId: existing.id,
          startAt,
          endAt,
          attendeeIds,
          userId: currentUser.id,
        })
      : [];
  if (conflicts.length > 0 && !data.allowConflicts) {
    return { status: "conflict" as const, conflicts };
  }

  const now = new Date();
  const newId = createId();
  const futureRule = recurrenceWithoutBoundary(existing.recurrenceRule);
  const priorRule = recurrenceRuleBefore(
    existing.recurrenceRule,
    occurrenceKey,
    existing.allDay,
    existing.timezone,
  );
  db.transaction((tx) => {
    tx.update(calendarEvents)
      .set({ recurrenceRule: priorRule, updatedAt: now })
      .where(eq(calendarEvents.id, existing.id))
      .run();
    tx.insert(calendarEvents)
      .values({
        id: newId,
        calendarId: data.calendarId,
        kind: data.kind,
        title: data.title,
        description: data.description,
        location: data.location,
        address: data.address,
        allDay: data.allDay,
        startDate: data.allDay ? data.startDate : null,
        endDate: data.allDay ? data.endDate : null,
        startAt: data.allDay ? null : startAt,
        endAt: data.allDay ? null : endAt,
        timezone: data.timezone,
        availability: data.availability,
        recurrenceRule: futureRule,
        linkedTaskId: data.linkedTaskId,
        createdBy: currentUser.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (attendeeIds.length > 0) {
      tx.insert(calendarEventAttendees)
        .values(
          attendeeIds.map((userId) => ({
            eventId: newId,
            userId,
            response: "needs_action" as const,
          })),
        )
        .run();
    }
    const reminderMinutes = [...new Set(data.reminderMinutes)];
    if (reminderMinutes.length > 0) {
      tx.insert(calendarReminders)
        .values(
          reminderMinutes.map((minutesBefore) => ({
            eventId: newId,
            userId: currentUser.id,
            minutesBefore,
          })),
        )
        .run();
    }
  });
  revalidatePath("/calendar");
  return { status: "saved" as const, id: newId, updatedAt: now.toISOString() };
}

export async function truncateCalendarEventSeries(input: {
  eventId: string;
  occurrenceKey: string;
  expectedUpdatedAt: string;
}) {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      eventId: z.string().min(1),
      occurrenceKey: z.string().min(1).max(200),
      expectedUpdatedAt: z.string().datetime(),
    })
    .parse(input);
  const existing = db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, data.eventId))
    .get();
  if (!existing?.recurrenceRule) throw new Error("Recurring event not found");
  requireCalendarEditor(existing.calendarId, currentUser.id);
  if (existing.updatedAt.toISOString() !== data.expectedUpdatedAt) {
    throw new Error("Event changed in another session");
  }
  db.update(calendarEvents)
    .set({
      recurrenceRule: recurrenceRuleBefore(
        existing.recurrenceRule,
        data.occurrenceKey,
        existing.allDay,
        existing.timezone,
      ),
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, existing.id))
    .run();
  revalidatePath("/calendar");
}
