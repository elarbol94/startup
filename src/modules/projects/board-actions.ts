"use server";

// Kanban board editing actions: column create/update/delete (with column-driven task
// status sync) and drag-and-drop task moves. Column reordering is in column-actions.ts.
// Used by board-client.tsx.
import { z } from "zod";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectColumns, tasks } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { leafTasks, taskDescendants } from "@/modules/projects/schedule";
import { assertProjectEditable } from "./guards";
import { pickColumnDeletionTarget } from "./column-rules";
import {
  SORT_GAP,
  projectHierarchyRows,
  syncProjectParents,
  syncTaskAncestors,
} from "./task-sync";
import { idSchema, revalidateTaskViews, completionTime } from "./project-action-helpers";

/**
 * Brings the tasks of one column in line with its completed flag: a completed
 * column holds done tasks, an open column holds open tasks. `completedAt` is
 * only stamped on tasks that become done, so earlier completion dates survive.
 */
function syncColumnTaskStatus(columnId: string, isCompleted: boolean, onlyTaskIds?: string[]) {
  const now = new Date();
  const inColumn = onlyTaskIds
    ? and(eq(tasks.columnId, columnId), inArray(tasks.id, onlyTaskIds))
    : eq(tasks.columnId, columnId);
  if (isCompleted) {
    db.update(tasks)
      .set({ status: "done", completedAt: now, progress: 100, updatedAt: now })
      .where(and(inColumn, eq(tasks.status, "open")))
      .run();
    db.update(tasks)
      .set({ progress: 100, updatedAt: now })
      .where(and(inColumn, eq(tasks.status, "done"), sql`${tasks.progress} != 100`))
      .run();
  } else {
    db.update(tasks)
      .set({
        status: "open",
        completedAt: null,
        lastOpenColumnId: columnId,
        progress: sql`min(${tasks.progress}, 99)`,
        updatedAt: now,
      })
      .where(and(inColumn, eq(tasks.status, "done")))
      .run();
  }
}

const columnSchema = z.object({
  id: z.string().min(1).optional(),
  projectId: z.string().min(1),
  name: z.string().min(1).max(100),
  isCompleted: z.boolean().optional(),
  workflowStage: z.enum(["todo", "in_progress"]).optional(),
});

export async function upsertColumn(input: z.infer<typeof columnSchema>) {
  await requireUserOrThrow();
  const data = columnSchema.parse(input);
  assertProjectEditable(data.projectId);

  if (data.id) {
    const columnId = data.id;
    if (!db.select({ id: projectColumns.id }).from(projectColumns).where(and(eq(projectColumns.id, columnId), eq(projectColumns.projectId, data.projectId))).get()) {
      throw new Error("Column not found in project");
    }
    db.transaction(() => {
      db.update(projectColumns)
        .set({
          name: data.name,
          ...(data.workflowStage === undefined ? {} : { workflowStage: data.workflowStage }),
          ...(data.isCompleted === undefined
            ? {}
            : { isCompleted: data.isCompleted }),
        })
        .where(eq(projectColumns.id, columnId))
        .run();
      if (data.isCompleted !== undefined) {
        syncColumnTaskStatus(columnId, data.isCompleted);
        syncProjectParents(data.projectId);
      }
    });
  } else {
    const max =
      db
        .select({ value: sql<number>`coalesce(max(${projectColumns.sortOrder}), 0)` })
        .from(projectColumns)
        .where(eq(projectColumns.projectId, data.projectId))
        .get()?.value ?? 0;
    db.insert(projectColumns)
      .values({
        projectId: data.projectId,
        name: data.name,
        isCompleted: data.isCompleted ?? false,
        workflowStage: data.workflowStage ?? "in_progress",
        sortOrder: max + SORT_GAP,
      })
      .run();
  }
  revalidateTaskViews(data.projectId);
}

/** Deleting a column moves its tasks to the closest matching remaining column. */
export async function deleteColumn(id: string) {
  await requireUserOrThrow();
  const columnId = idSchema.parse(id);
  const column = db
    .select()
    .from(projectColumns)
    .where(eq(projectColumns.id, columnId))
    .get();
  if (!column) return;
  assertProjectEditable(column.projectId);

  const remaining = db
    .select()
    .from(projectColumns)
    .where(eq(projectColumns.projectId, column.projectId))
    .all();
  const fallback = pickColumnDeletionTarget(column, remaining);
  if (!fallback) throw new Error("Cannot delete the last column");

  db.transaction(() => {
    const movedIds = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.columnId, columnId))
      .all()
      .map((task) => task.id);
    if (movedIds.length > 0) {
      db.update(tasks)
        .set({ columnId: fallback.id, updatedAt: new Date() })
        .where(inArray(tasks.id, movedIds))
        .run();
      syncColumnTaskStatus(fallback.id, fallback.isCompleted, movedIds);
    }
    db.delete(projectColumns).where(eq(projectColumns.id, columnId)).run();
    syncProjectParents(column.projectId);
  });
  revalidateTaskViews(column.projectId);
}

const moveSchema = z.object({
  taskId: z.string().min(1),
  columnId: z.string().min(1),
  /** Task id to insert after, or null for the top of the column. */
  afterTaskId: z.string().nullable(),
});

/** Persists a drag-and-drop move with gap-based ordering; renumbers on collision. */
export async function moveTask(input: z.infer<typeof moveSchema>) {
  await requireUserOrThrow();
  const data = moveSchema.parse(input);

  const task = db.select().from(tasks).where(eq(tasks.id, data.taskId)).get();
  if (!task) throw new Error("Task not found");
  if (!task.projectId) throw new Error("Only project tasks can move between columns");
  const projectId = task.projectId;
  assertProjectEditable(projectId);
  const targetColumn = db
    .select({ projectId: projectColumns.projectId, isCompleted: projectColumns.isCompleted })
    .from(projectColumns)
    .where(eq(projectColumns.id, data.columnId))
    .get();
  if (!targetColumn) throw new Error("Column not found");
  if (targetColumn.projectId !== projectId) throw new Error("Column belongs to another project");
  const descendants = taskDescendants(projectHierarchyRows(projectId), task.id);
  const children = leafTasks(descendants);
  if (
    children.length > 0 &&
    targetColumn.isCompleted &&
    children.some((child) => !child.columnIsCompleted)
  ) {
    throw new Error("Complete all subtasks before completing the parent");
  }

  const columnTasks = db
    .select({ id: tasks.id, sortOrder: tasks.sortOrder })
    .from(tasks)
    .where(
      and(
        eq(tasks.columnId, data.columnId),
        task.parentTaskId
          ? eq(tasks.parentTaskId, task.parentTaskId)
          : isNull(tasks.parentTaskId),
        sql`${tasks.id} != ${data.taskId}`,
      ),
    )
    .orderBy(asc(tasks.sortOrder))
    .all();

  const afterIndex = data.afterTaskId
    ? columnTasks.findIndex((t) => t.id === data.afterTaskId)
    : -1;
  const prev = afterIndex >= 0 ? columnTasks[afterIndex] : null;
  const next =
    afterIndex + 1 < columnTasks.length ? columnTasks[afterIndex + 1] : null;

  let sortOrder: number;
  if (prev && next) sortOrder = Math.floor((prev.sortOrder + next.sortOrder) / 2);
  else if (prev) sortOrder = prev.sortOrder + SORT_GAP;
  else if (next) sortOrder = Math.floor(next.sortOrder / 2);
  else sortOrder = SORT_GAP;

  const collision =
    (prev && sortOrder <= prev.sortOrder) || (next && sortOrder >= next.sortOrder);

  // Status fields follow the target column. A task that is already done keeps
  // its completion time; a task leaving a completed column is reopened the same
  // way setTaskStatus reopens it (progress capped below 100).
  const now = new Date();
  const statusFields = targetColumn.isCompleted
    ? {
        columnId: data.columnId,
        status: "done" as const,
        completedAt: completionTime(task, now),
        lastOpenColumnId: task.status === "open" ? task.columnId : task.lastOpenColumnId ?? task.columnId,
        progress: 100,
      }
    : {
        columnId: data.columnId,
        status: "open" as const,
        completedAt: null,
        lastOpenColumnId: data.columnId,
        progress: task.status === "done" ? Math.min(task.progress, 99) : task.progress,
      };
  const changesStatus = statusFields.status !== task.status || data.columnId !== task.columnId;

  db.transaction((tx) => {
    if (collision) {
      // Renumber the whole column with fresh gaps, then place the task.
      const ordered = [...columnTasks];
      ordered.splice(afterIndex + 1, 0, { id: data.taskId, sortOrder: 0 });
      ordered.forEach((t, index) => {
        tx.update(tasks)
          .set({
            sortOrder: (index + 1) * SORT_GAP,
            ...(t.id === data.taskId ? { ...statusFields, updatedAt: now } : {}),
          })
          .where(eq(tasks.id, t.id))
          .run();
      });
    } else {
      tx.update(tasks)
        .set({ ...statusFields, sortOrder, updatedAt: now })
        .where(eq(tasks.id, data.taskId))
        .run();
    }
    if (task.parentTaskId && changesStatus) syncTaskAncestors(task.id);
  });

  revalidateTaskViews(projectId);
}
