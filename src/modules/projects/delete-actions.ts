"use server";

import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { deleteTaskLiftingChildren } from "./task-move";
import { ScheduleError, scheduleFailure, type ScheduleFailure } from "./schedule-errors";

/**
 * Deletes a summary task but keeps its subtasks: the direct children move up
 * to the deleted task's parent and take its place in the sibling order. All of
 * it happens in one transaction, so a failure leaves the tree untouched.
 */
export async function deleteTaskKeepChildren(
  id: string,
): Promise<{ ok: true; movedChildIds: string[] } | ScheduleFailure> {
  await requireUserOrThrow();
  const taskId = z.string().min(1).parse(id);
  let result: { projectId: string | null; movedChildIds: string[] };
  try {
    result = db.transaction(() => {
      const task = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId)).get();
      if (!task) throw new ScheduleError("not-found", "Task not found");
      const movedChildIds = db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.parentTaskId, taskId))
        .orderBy(asc(tasks.sortOrder))
        .all()
        .map((child) => child.id);
      return { ...deleteTaskLiftingChildren(taskId), movedChildIds };
    });
  } catch (error) {
    return scheduleFailure(error);
  }
  if (result.projectId) revalidatePath(`/projects/${result.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true, movedChildIds: result.movedChildIds };
}
