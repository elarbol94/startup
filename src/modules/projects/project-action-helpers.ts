// Small shared helpers for the project server actions: id schema, task-view
// revalidation, completion timestamps, first project column and context sort order.
// Used by board-actions.ts, task-actions.ts, contextual-task-actions.ts and dependency-actions.ts.
import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectColumns, tasks } from "@/db/schema";
import { SORT_GAP } from "./task-sync";

export const idSchema = z.string().min(1);

/** Refreshes every page that lists project tasks, their status or their dates. */
export function revalidateTaskViews(projectId: string | null | undefined) {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/wiki", "layout");
}

export function firstProjectColumn(projectId: string, completed: boolean) {
  return db
    .select()
    .from(projectColumns)
    .where(
      and(
        eq(projectColumns.projectId, projectId),
        eq(projectColumns.isCompleted, completed),
      ),
    )
    .orderBy(asc(projectColumns.sortOrder))
    .get();
}

export function nextContextTaskSortOrder(columnId: string | null) {
  const max = db
    .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
    .from(tasks)
    .where(columnId ? eq(tasks.columnId, columnId) : isNull(tasks.projectId))
    .get()?.value ?? 0;
  return max + SORT_GAP;
}

/** Keeps the original completion time of a task that is already done. */
export function completionTime(task: { status: "open" | "done"; completedAt: Date | null }, now: Date) {
  return task.status === "done" && task.completedAt ? task.completedAt : now;
}
