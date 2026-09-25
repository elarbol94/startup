"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { timeEntries } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { isValidDate } from "@/modules/calendar/date-utils";
import { entryGrossMinutes } from "./lib/balance";
import { intervalFromClock } from "./lib/entry-time";
import {
  assignmentSchema,
  fail,
  hasOverlap,
  loadEntry,
  resolveAssignment,
  revalidateTime,
  type TimeActionResult,
} from "./action-helpers";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const entrySchema = assignmentSchema.extend({
  id: z.string().min(1).max(100).optional(),
  workDate: z.string().refine(isValidDate),
  start: clock,
  end: clock,
  breakMinutes: z.coerce.number().int().min(0).max(24 * 60).default(0),
});

export type TimeEntryInput = z.input<typeof entrySchema>;

/** Creates a manual entry or corrects an existing, finished one of the signed-in user. */
export async function saveTimeEntry(input: TimeEntryInput): Promise<TimeActionResult<{ id: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const data = parsed.data;

  const existing = data.id ? loadEntry(data.id) : undefined;
  if (data.id && !existing) return fail("notFound");
  if (existing && !existing.endedAt) return fail("timerRunning");
  // Time tracking is strictly personal: nobody (not even admins) edits another user's time.
  if (existing && existing.userId !== viewer.id) return fail("forbidden");
  const ownerId = viewer.id;

  const assignment = resolveAssignment(data);
  if (!assignment) return fail("invalidWork");
  const interval = intervalFromClock(data.workDate, data.start, data.end);
  const now = new Date();
  if (data.breakMinutes >= entryGrossMinutes(interval, now)) return fail("breakTooLong");
  if (hasOverlap(ownerId, data.workDate, interval, now, existing?.id)) return fail("overlap");

  const values = {
    workDate: data.workDate,
    ...interval,
    breakMinutes: data.breakMinutes,
    ...assignment,
    kind: data.kind,
    note: data.note,
    updatedAt: now,
  };
  let id: string;
  if (existing) {
    db.update(timeEntries).set(values).where(eq(timeEntries.id, existing.id)).run();
    id = existing.id;
  } else {
    id = db
      .insert(timeEntries)
      .values({ ...values, userId: ownerId, source: "manual", createdBy: viewer.id })
      .returning({ id: timeEntries.id })
      .get().id;
  }
  revalidateTime();
  return { ok: true, id };
}

export async function deleteTimeEntry(id: string): Promise<TimeActionResult> {
  const viewer = await requireUserOrThrow();
  const parsedId = z.string().min(1).max(100).safeParse(id);
  if (!parsedId.success) return fail("invalid");
  const existing = loadEntry(parsedId.data);
  if (!existing) return fail("notFound");
  if (existing.userId !== viewer.id) return fail("forbidden");
  db.delete(timeEntries).where(eq(timeEntries.id, existing.id)).run();
  revalidateTime();
  return { ok: true };
}
