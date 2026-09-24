import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { projects, tasks, timeEntries } from "@/db/schema";
import { overlaps } from "./lib/entry-time";
import { listNeighbourEntries } from "./queries";
import { timeEntryKinds } from "./schema";

export type TimeActionError =
  | "notFound"
  | "forbidden"
  | "invalid"
  | "overlap"
  | "timerRunning"
  | "noTimer"
  | "breakTooLong"
  | "invalidWork";

export type TimeActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: TimeActionError };

export const fail = (error: TimeActionError) => ({ ok: false as const, error });

export const assignmentSchema = z.object({
  projectId: z.string().min(1).max(100).nullish(),
  taskId: z.string().min(1).max(100).nullish(),
  kind: z.enum(timeEntryKinds).default("work"),
  note: z.string().trim().max(1000).default(""),
});

/**
 * Validates project/task references and derives the project from the task so
 * the two can never disagree. Returns null when the references are invalid.
 */
export function resolveAssignment(input: { projectId?: string | null; taskId?: string | null }) {
  if (input.taskId) {
    const task = db
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .where(eq(tasks.id, input.taskId))
      .get();
    if (!task?.projectId) return null;
    if (input.projectId && input.projectId !== task.projectId) return null;
    return { projectId: task.projectId, taskId: task.id };
  }
  if (input.projectId) {
    const project = db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).get();
    if (!project) return null;
    return { projectId: project.id, taskId: null };
  }
  return { projectId: null, taskId: null };
}

export function hasOverlap(
  userId: string,
  workDate: string,
  interval: { startedAt: Date; endedAt: Date | null },
  now: Date,
  excludeId?: string,
) {
  return listNeighbourEntries(userId, workDate, excludeId).some((other) => overlaps(interval, other, now));
}

export function loadEntry(id: string) {
  return db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
}

export function revalidateTime() {
  revalidatePath("/time");
}
