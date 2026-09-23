"use server";

import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contextLinks, tasks } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { syncProjectBounds, syncTaskAncestors } from "./hierarchy-sync";
import { ScheduleError, scheduleFailure, type ScheduleFailure } from "./schedule-errors";

const SORT_GAP = 1000;

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
    result = db.transaction(() => deleteKeepingChildren(taskId));
  } catch (error) {
    return scheduleFailure(error);
  }
  if (result.projectId) revalidatePath(`/projects/${result.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true, movedChildIds: result.movedChildIds };
}

function deleteKeepingChildren(taskId: string) {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new ScheduleError("not-found", "Task not found");
  const parentTaskId = task.parentTaskId;
  const children = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.parentTaskId, task.id))
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
    .all();
  const siblings = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        task.projectId ? eq(tasks.projectId, task.projectId) : isNull(tasks.projectId),
        parentTaskId ? eq(tasks.parentTaskId, parentTaskId) : isNull(tasks.parentTaskId),
      ),
    )
    .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id))
    .all();
  const childIds = children.map((child) => child.id);
  const orderedIds = siblings.flatMap((sibling) =>
    sibling.id === task.id ? childIds : [sibling.id],
  );
  // Lifting a child out of its parent only removes ancestor links, so it can
  // neither create a hierarchy cycle nor put a dependency on its own branch.
  orderedIds.forEach((siblingId, index) => {
    const lifted = childIds.includes(siblingId);
    db.update(tasks)
      .set({
        sortOrder: (index + 1) * SORT_GAP,
        ...(lifted ? { parentTaskId, updatedAt: new Date() } : {}),
      })
      .where(eq(tasks.id, siblingId))
      .run();
  });
  db.delete(contextLinks)
    .where(and(eq(contextLinks.ownerType, "task"), eq(contextLinks.ownerId, task.id)))
    .run();
  db.delete(tasks).where(eq(tasks.id, task.id)).run();
  if (parentTaskId) syncTaskAncestors(parentTaskId);
  if (task.projectId) syncProjectBounds(task.projectId);
  return { projectId: task.projectId, movedChildIds: childIds };
}
