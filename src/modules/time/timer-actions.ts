"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { timeEntries } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { entryGrossMinutes } from "./lib/balance";
import { TIME_ZONE } from "./lib/entry-time";
import { getRunningEntry } from "./queries";
import {
  assignmentSchema,
  fail,
  hasOverlap,
  resolveAssignment,
  revalidateTime,
  type TimeActionResult,
} from "./action-helpers";

export async function startTimer(input: z.input<typeof assignmentSchema>): Promise<TimeActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const assignment = resolveAssignment(parsed.data);
  if (!assignment) return fail("invalidWork");
  if (getRunningEntry(viewer.id)) return fail("timerRunning");

  const now = new Date();
  const workDate = localDateInZone(now, TIME_ZONE);
  // Refuse to start inside an already recorded period (e.g. a manual entry for today).
  if (hasOverlap(viewer.id, workDate, { startedAt: now, endedAt: new Date(now.getTime() + 60_000) }, now)) {
    return fail("overlap");
  }
  try {
    db.insert(timeEntries)
      .values({
        userId: viewer.id,
        workDate,
        startedAt: now,
        endedAt: null,
        ...assignment,
        kind: parsed.data.kind,
        note: parsed.data.note,
        source: "timer",
        createdBy: viewer.id,
      })
      .run();
  } catch {
    // The partial unique index rejects a second running timer (e.g. two tabs).
    return fail("timerRunning");
  }
  revalidateTime();
  return { ok: true };
}

/** Changes what the running timer is booked on without stopping it. */
export async function updateRunningTimer(input: z.input<typeof assignmentSchema>): Promise<TimeActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const assignment = resolveAssignment(parsed.data);
  if (!assignment) return fail("invalidWork");
  const updated = db
    .update(timeEntries)
    .set({ ...assignment, kind: parsed.data.kind, note: parsed.data.note, updatedAt: new Date() })
    .where(and(eq(timeEntries.userId, viewer.id), isNull(timeEntries.endedAt)))
    .returning({ id: timeEntries.id })
    .get();
  if (!updated) return fail("noTimer");
  revalidateTime();
  return { ok: true };
}

const stopSchema = z.object({
  breakMinutes: z.coerce.number().int().min(0).max(24 * 60).default(0),
});

export async function stopTimer(input: z.input<typeof stopSchema> = {}): Promise<TimeActionResult<{ discarded: boolean }>> {
  const viewer = await requireUserOrThrow();
  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const running = getRunningEntry(viewer.id);
  if (!running) return fail("noTimer");

  const now = new Date();
  const gross = entryGrossMinutes({ startedAt: running.startedAt, endedAt: now }, now);
  // A timer stopped within the first minute was most likely started by mistake.
  if (gross < 1) {
    db.delete(timeEntries).where(eq(timeEntries.id, running.id)).run();
    revalidateTime();
    return { ok: true, discarded: true };
  }
  if (parsed.data.breakMinutes >= gross) return fail("breakTooLong");
  db.update(timeEntries)
    .set({ endedAt: now, breakMinutes: parsed.data.breakMinutes, updatedAt: now })
    .where(eq(timeEntries.id, running.id))
    .run();
  revalidateTime();
  return { ok: true, discarded: false };
}
