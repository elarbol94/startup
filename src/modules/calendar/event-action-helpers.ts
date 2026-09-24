// Shared validation schema, permission check and conflict detection for calendar event actions.
// Used by actions.ts and series-actions.ts.
import "server-only";

import { and, eq, inArray, lt, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/core-schema";
import {
  calendarEventAttendees,
  calendarEvents,
  calendars,
} from "./schema";
import { calendarRoleForUser } from "./queries";
import { isValidTimezone } from "./date-utils";

export const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const eventInputSchema = z
  .object({
    id: z.string().optional(),
    calendarId: z.string().min(1),
    kind: z.enum(["event", "focus", "absence"]).default("event"),
    title: z.string().trim().min(1).max(240),
    description: z.string().max(10_000).default(""),
    location: z.string().max(500).default(""),
    address: z.string().max(1_000).default(""),
    allDay: z.boolean(),
    startDate: z.string().regex(datePattern).nullable(),
    endDate: z.string().regex(datePattern).nullable(),
    startAt: z.string().datetime().nullable(),
    endAt: z.string().datetime().nullable(),
    // An invalid zone would throw while rendering every viewer's calendar.
    timezone: z.string().trim().min(1).max(120).refine(isValidTimezone),
    availability: z.enum(["busy", "free"]).default("busy"),
    recurrenceRule: z.string().max(1000).nullable(),
    linkedTaskId: z.string().nullable().default(null),
    attendeeIds: z.array(z.string()).max(100).default([]),
    reminderMinutes: z.array(z.number().int().min(0).max(43_200)).max(8).default([]),
    expectedUpdatedAt: z.string().datetime().nullable().default(null),
    allowConflicts: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.allDay) {
      if (!value.startDate || !value.endDate || value.endDate <= value.startDate) {
        ctx.addIssue({
          code: "custom",
          message: "All-day events require an end date after the start date",
          path: ["endDate"],
        });
      }
    } else {
      if (!value.startAt || !value.endAt) {
        ctx.addIssue({
          code: "custom",
          message: "Timed events require a start and end",
          path: ["startAt"],
        });
      } else if (new Date(value.endAt) <= new Date(value.startAt)) {
        ctx.addIssue({
          code: "custom",
          message: "The end must be after the start",
          path: ["endAt"],
        });
      }
    }
  });

export type CalendarEventInput = z.input<typeof eventInputSchema>;

export function requireCalendarEditor(calendarId: string, userId: string) {
  const role = calendarRoleForUser(calendarId, userId);
  if (role !== "owner" && role !== "editor") {
    throw new Error("You do not have permission to edit this calendar");
  }
  return role;
}

export function accessibleUserIds(ids: string[]) {
  if (ids.length === 0) return [];
  const valid = new Set(
    db
      .select({ id: user.id })
      .from(user)
      .where(and(inArray(user.id, ids), isNull(user.removedAt)))
      .all()
      .map((row) => row.id),
  );
  return [...new Set(ids)].filter((id) => valid.has(id));
}

export function timedConflicts(input: {
  eventId?: string;
  startAt: Date;
  endAt: Date;
  attendeeIds: string[];
  userId: string;
}) {
  const relevantUsers = [...new Set([input.userId, ...input.attendeeIds])];
  if (relevantUsers.length === 0) return [];
  const busyEvents = db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      createdBy: calendarEvents.createdBy,
      calendarId: calendarEvents.calendarId,
      calendarVisibility: calendars.visibility,
    })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
    .where(
      and(
        eq(calendarEvents.allDay, false),
        eq(calendarEvents.availability, "busy"),
        eq(calendarEvents.status, "confirmed"),
        lt(calendarEvents.startAt, input.endAt),
        gt(calendarEvents.endAt, input.startAt),
      ),
    )
    .all()
    .filter((event) => event.id !== input.eventId);
  if (busyEvents.length === 0) return [];
  const attendeeRows = db
    .select()
    .from(calendarEventAttendees)
    .where(
      and(
        inArray(
          calendarEventAttendees.eventId,
          busyEvents.map((event) => event.id),
        ),
        inArray(calendarEventAttendees.userId, relevantUsers),
      ),
    )
    .all();
  const conflictedIds = new Set(
    busyEvents
      .filter((event) => relevantUsers.includes(event.createdBy))
      .map((event) => event.id),
  );
  for (const attendee of attendeeRows) conflictedIds.add(attendee.eventId);
  // Conflicts span other people's calendars: expose free/busy time, but the
  // title only where the caller could read it in their own calendar view.
  const ownEventIds = new Set(
    attendeeRows.filter((row) => row.userId === input.userId).map((row) => row.eventId),
  );
  const roles = new Map<string, ReturnType<typeof calendarRoleForUser>>();
  const titleVisible = (event: (typeof busyEvents)[number]) => {
    if (event.createdBy === input.userId || ownEventIds.has(event.id)) return true;
    if (!roles.has(event.calendarId)) roles.set(event.calendarId, calendarRoleForUser(event.calendarId, input.userId));
    const role = roles.get(event.calendarId);
    return Boolean(role) && !(role === "viewer" && event.calendarVisibility === "busy");
  };
  return busyEvents
    .filter((event) => conflictedIds.has(event.id))
    .map((event) => ({
      id: event.id,
      title: titleVisible(event) ? event.title : "Busy",
      startAt: event.startAt?.toISOString() ?? "",
      endAt: event.endAt?.toISOString() ?? "",
    }));
}
