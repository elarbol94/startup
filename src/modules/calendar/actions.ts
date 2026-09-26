"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { tasks } from "@/modules/projects/schema";
import {
  calendarEventAttendees,
  calendarEvents,
  calendarReminders,
} from "./schema";
import { validateRecurrenceRule } from "./recurrence";
import { syncProjectLinks } from "@/modules/context/project-link-refs";
import {
  accessibleUserIds,
  datePattern,
  eventInputSchema,
  requireCalendarEditor,
  timedConflicts,
  type CalendarEventInput,
} from "./event-action-helpers";

export async function upsertCalendarEvent(input: CalendarEventInput) {
  const currentUser = await requireUserOrThrow();
  const data = eventInputSchema.parse(input);
  requireCalendarEditor(data.calendarId, currentUser.id);
  const recurrenceRule = validateRecurrenceRule(data.recurrenceRule);
  const attendeeIds = accessibleUserIds(data.attendeeIds).filter(
    (id) => id !== currentUser.id,
  );
  const startAt = data.startAt ? new Date(data.startAt) : null;
  const endAt = data.endAt ? new Date(data.endAt) : null;
  const conflicts =
    !data.allDay && data.availability === "busy" && startAt && endAt
      ? timedConflicts({
          eventId: data.id,
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
  const id = data.id ?? createId();
  db.transaction((tx) => {
    // RSVPs survive ordinary edits; a moved event asks everyone again.
    let keepResponses = false;
    if (data.id) {
      const existing = tx
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, data.id))
        .get();
      if (!existing) throw new Error("Event not found");
      keepResponses =
        existing.allDay === data.allDay &&
        existing.startDate === (data.allDay ? data.startDate : null) &&
        existing.endDate === (data.allDay ? data.endDate : null) &&
        (existing.startAt?.getTime() ?? null) === (data.allDay ? null : startAt?.getTime() ?? null) &&
        (existing.endAt?.getTime() ?? null) === (data.allDay ? null : endAt?.getTime() ?? null) &&
        existing.recurrenceRule === recurrenceRule;
      requireCalendarEditor(existing.calendarId, currentUser.id);
      if (
        data.expectedUpdatedAt &&
        existing.updatedAt.toISOString() !== data.expectedUpdatedAt
      ) {
        throw new Error("Event changed in another session");
      }
      tx.update(calendarEvents)
        .set({
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
          recurrenceRule,
          linkedTaskId: data.linkedTaskId,
          updatedAt: now,
        })
        .where(eq(calendarEvents.id, id))
        .run();
    } else {
      tx.insert(calendarEvents)
        .values({
          id,
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
          recurrenceRule,
          linkedTaskId: data.linkedTaskId,
          createdBy: currentUser.id,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    const previousResponses = new Map(
      keepResponses
        ? tx.select({ userId: calendarEventAttendees.userId, response: calendarEventAttendees.response })
            .from(calendarEventAttendees)
            .where(eq(calendarEventAttendees.eventId, id))
            .all()
            .map((row) => [row.userId, row.response] as const)
        : [],
    );
    tx.delete(calendarEventAttendees)
      .where(eq(calendarEventAttendees.eventId, id))
      .run();
    if (attendeeIds.length > 0) {
      tx.insert(calendarEventAttendees)
        .values(
          attendeeIds.map((userId) => ({
            eventId: id,
            userId,
            response: previousResponses.get(userId) ?? ("needs_action" as const),
          })),
        )
        .run();
    }
    tx.delete(calendarReminders)
      .where(
        and(
          eq(calendarReminders.eventId, id),
          eq(calendarReminders.userId, currentUser.id),
        ),
      )
      .run();
    if (data.projectIds) {
      syncProjectLinks(tx, {
        targetType: "calendarEvent",
        targetId: id,
        projectIds: data.projectIds,
        userId: currentUser.id,
        label: data.title,
      });
    }
    const reminderMinutes = [...new Set(data.reminderMinutes)];
    if (reminderMinutes.length > 0) {
      tx.insert(calendarReminders)
        .values(
          reminderMinutes.map((minutesBefore) => ({
            eventId: id,
            userId: currentUser.id,
            minutesBefore,
          })),
        )
        .run();
    }
  });
  revalidatePath("/calendar");
  revalidatePath("/");
  if (data.projectIds) revalidatePath("/projects", "layout");
  return { status: "saved" as const, id, updatedAt: now.toISOString() };
}

export async function deleteCalendarEvent(id: string) {
  const currentUser = await requireUserOrThrow();
  const event = db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .get();
  if (!event) throw new Error("Event not found");
  requireCalendarEditor(event.calendarId, currentUser.id);
  db.update(calendarEvents)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(calendarEvents.id, id))
    .run();
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function moveCalendarEvent(input: {
  id: string;
  startAt?: string;
  endAt?: string;
  startDate?: string;
  endDate?: string;
  expectedUpdatedAt: string;
  allowConflicts?: boolean;
}) {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      id: z.string().min(1),
      startAt: z.string().datetime().optional(),
      endAt: z.string().datetime().optional(),
      startDate: z.string().regex(datePattern).optional(),
      endDate: z.string().regex(datePattern).optional(),
      expectedUpdatedAt: z.string().datetime(),
      allowConflicts: z.boolean().default(false),
    })
    .parse(input);
  const event = db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, data.id))
    .get();
  if (!event) throw new Error("Event not found");
  requireCalendarEditor(event.calendarId, currentUser.id);
  if (event.updatedAt.toISOString() !== data.expectedUpdatedAt) {
    throw new Error("Event changed in another session");
  }
  const attendees = db
    .select({ userId: calendarEventAttendees.userId })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, event.id))
    .all()
    .map((row) => row.userId);
  const startAt = data.startAt ? new Date(data.startAt) : null;
  const endAt = data.endAt ? new Date(data.endAt) : null;
  if (event.allDay) {
    if (!data.startDate || !data.endDate || data.endDate <= data.startDate) throw new Error("Invalid all-day range");
  } else if (!startAt || !endAt || endAt <= startAt) {
    throw new Error("Invalid event time range");
  }
  const conflicts =
    !event.allDay && startAt && endAt
      ? timedConflicts({
          eventId: event.id,
          startAt,
          endAt,
          attendeeIds: attendees,
          userId: event.createdBy,
        })
      : [];
  if (conflicts.length > 0 && !data.allowConflicts) {
    return { status: "conflict" as const, conflicts };
  }
  const now = new Date();
  db.update(calendarEvents)
    .set(
      event.allDay
        ? {
            startDate: data.startDate,
            endDate: data.endDate,
            updatedAt: now,
          }
        : { startAt, endAt, updatedAt: now },
    )
    .where(eq(calendarEvents.id, event.id))
    .run();
  revalidatePath("/calendar");
  return { status: "saved" as const, updatedAt: now.toISOString() };
}

export async function respondToCalendarEvent(input: {
  eventId: string;
  response: "accepted" | "tentative" | "declined";
}) {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      eventId: z.string().min(1),
      response: z.enum(["accepted", "tentative", "declined"]),
    })
    .parse(input);
  const result = db
    .update(calendarEventAttendees)
    .set({ response: data.response, updatedAt: new Date() })
    .where(
      and(
        eq(calendarEventAttendees.eventId, data.eventId),
        eq(calendarEventAttendees.userId, currentUser.id),
      ),
    )
    .run();
  if (result.changes === 0) throw new Error("Invitation not found");
  revalidatePath("/calendar");
}

export async function createTaskFocusBlock(input: {
  taskId: string;
  calendarId: string;
  startAt: string;
  endAt: string;
  timezone: string;
}) {
  await requireUserOrThrow();
  const data = z
    .object({
      taskId: z.string().min(1),
      calendarId: z.string().min(1),
      startAt: z.string().datetime(),
      endAt: z.string().datetime(),
      timezone: z.string().min(1).max(120),
    })
    .parse(input);
  const task = db
    .select({ id: tasks.id, title: tasks.title, description: tasks.description })
    .from(tasks)
    .where(eq(tasks.id, data.taskId))
    .get();
  if (!task) throw new Error("Task not found");
  return upsertCalendarEvent({
    calendarId: data.calendarId,
    kind: "focus",
    title: task.title,
    description: task.description,
    location: "",
    address: "",
    allDay: false,
    startDate: null,
    endDate: null,
    startAt: data.startAt,
    endAt: data.endAt,
    timezone: data.timezone,
    availability: "busy",
    recurrenceRule: null,
    linkedTaskId: task.id,
    attendeeIds: [],
    reminderMinutes: [5],
    expectedUpdatedAt: null,
    allowConflicts: false,
  });
}
