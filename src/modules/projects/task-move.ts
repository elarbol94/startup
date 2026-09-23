import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  contextLinks,
  projectColumns,
  projectDependencies,
  projectTaskDependencies,
  projects,
  taskDependencies,
  tasks,
} from "@/db/schema";
import { taskAncestors, taskDescendants } from "@/modules/projects/schedule";
import {
  SORT_GAP,
  nextSortOrder,
  projectHierarchyRows,
  syncParentSummary,
  syncProjectBounds,
  syncTaskAncestors,
} from "./task-sync";

/** Error codes the task dialogs translate. Thrown as `Error(code)`. */
export const taskMoveErrorCodes = [
  "task_not_found",
  "project_not_found",
  "project_archived",
  "project_without_columns",
  "detach_has_subtasks",
  "detach_has_dependencies",
] as const;
export type TaskMoveErrorCode = (typeof taskMoveErrorCodes)[number];

export class TaskMoveError extends Error {
  constructor(readonly code: TaskMoveErrorCode) {
    super(code);
    this.name = "TaskMoveError";
  }
}

type Column = typeof projectColumns.$inferSelect;

/**
 * Picks the destination column for a task whose column lives in another
 * project: a completed column stays completed, an open column keeps its
 * workflow stage, and otherwise the first open (then first) column is used.
 */
export function matchTargetColumn(source: Pick<Column, "isCompleted" | "workflowStage"> | undefined, targetColumns: Column[]): Column | undefined {
  const open = targetColumns.filter((column) => !column.isCompleted);
  if (source?.isCompleted) {
    const completed = targetColumns.find((column) => column.isCompleted);
    if (completed) return completed;
  }
  return (
    open.find((column) => column.workflowStage === source?.workflowStage) ??
    open[0] ??
    targetColumns[0]
  );
}

/**
 * Moves a task and its whole subtree into another project. The task becomes a
 * top-level task there, every task in the subtree lands in the column with the
 * matching workflow stage, the old ancestors are rolled up again, and the new
 * project's bounds grow around the moved work. Dependencies are kept: links
 * between projects are allowed, and detaching from a parent can never create a
 * cycle or an ancestor link.
 *
 * Runs synchronously; call it inside `db.transaction` to keep it atomic.
 */
export function moveTaskSubtreeToProject(taskId: string, targetProjectId: string): {
  sourceProjectId: string;
  movedTaskIds: string[];
} {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task || task.kind !== "task" || !task.projectId) throw new TaskMoveError("task_not_found");
  const sourceProjectId = task.projectId;
  const target = db.select().from(projects).where(eq(projects.id, targetProjectId)).get();
  if (!target) throw new TaskMoveError("project_not_found");
  if (target.status === "archived") throw new TaskMoveError("project_archived");
  if (sourceProjectId === targetProjectId) return { sourceProjectId, movedTaskIds: [] };

  const targetColumns = db
    .select()
    .from(projectColumns)
    .where(eq(projectColumns.projectId, targetProjectId))
    .orderBy(asc(projectColumns.sortOrder))
    .all();
  if (targetColumns.length === 0) throw new TaskMoveError("project_without_columns");
  const sourceColumns = new Map(
    db
      .select()
      .from(projectColumns)
      .where(eq(projectColumns.projectId, sourceProjectId))
      .all()
      .map((column) => [column.id, column]),
  );

  const subtree = [
    task,
    ...taskDescendants(projectHierarchyRows(sourceProjectId), task.id)
      .map((row) => db.select().from(tasks).where(eq(tasks.id, row.id)).get())
      .filter((row): row is typeof task => Boolean(row)),
  ];
  const rootColumn = matchTargetColumn(
    task.columnId ? sourceColumns.get(task.columnId) : undefined,
    targetColumns,
  )!;
  const rootSortOrder = nextSortOrder(rootColumn.id, null);
  const now = new Date();

  for (const row of subtree) {
    const sourceColumn = row.columnId ? sourceColumns.get(row.columnId) : undefined;
    const column = row.id === task.id
      ? rootColumn
      : matchTargetColumn(sourceColumn, targetColumns)!;
    const lastOpenSource = row.lastOpenColumnId ? sourceColumns.get(row.lastOpenColumnId) : undefined;
    const lastOpen = column.isCompleted
      ? matchTargetColumn(
          { isCompleted: false, workflowStage: lastOpenSource?.workflowStage ?? "todo" },
          targetColumns.filter((candidate) => !candidate.isCompleted),
        )
      : column;
    db.update(tasks)
      .set({
        projectId: targetProjectId,
        columnId: column.id,
        lastOpenColumnId: lastOpen?.id ?? null,
        // Legacy phases belong to the old project.
        phaseId: null,
        status: column.isCompleted ? "done" : "open",
        completedAt: column.isCompleted ? row.completedAt ?? now : null,
        progress: column.isCompleted ? 100 : row.progress,
        ...(row.id === task.id ? { parentTaskId: null, sortOrder: rootSortOrder } : {}),
        updatedAt: now,
      })
      .where(eq(tasks.id, row.id))
      .run();
  }

  if (task.parentTaskId) syncTaskAncestors(task.parentTaskId);
  // Summaries inside the subtree now roll up against the target's columns,
  // deepest first so every parent sees already-synced children.
  const targetRows = projectHierarchyRows(targetProjectId);
  const movedIds = new Set(subtree.map((row) => row.id));
  const movedParents = [...new Set(
    targetRows
      .filter((row) => row.parentTaskId && movedIds.has(row.parentTaskId))
      .map((row) => row.parentTaskId!),
  )].sort(
    (left, right) => taskAncestors(targetRows, right).length - taskAncestors(targetRows, left).length,
  );
  movedParents.forEach((id) => syncParentSummary(id));
  syncProjectBounds(sourceProjectId);
  syncProjectBounds(targetProjectId);
  return { sourceProjectId, movedTaskIds: subtree.map((row) => row.id) };
}

/**
 * Removes a task from its project. Only a task without subtasks and without
 * dependencies can be detached: project-less tasks have no hierarchy, and
 * their links would disappear from the timeline.
 */
export function detachTaskFromProject(taskId: string): { sourceProjectId: string | null } {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new TaskMoveError("task_not_found");
  if (!task.projectId) return { sourceProjectId: null };
  const child = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentTaskId, task.id)).get();
  if (child) throw new TaskMoveError("detach_has_subtasks");
  const dependency = db
    .select({ id: taskDependencies.id })
    .from(taskDependencies)
    .where(or(eq(taskDependencies.predecessorTaskId, task.id), eq(taskDependencies.successorTaskId, task.id)))
    .get() ??
    db
      .select({ id: projectTaskDependencies.id })
      .from(projectTaskDependencies)
      .where(eq(projectTaskDependencies.successorTaskId, task.id))
      .get();
  if (dependency) throw new TaskMoveError("detach_has_dependencies");
  const max = db
    .select({ sortOrder: tasks.sortOrder })
    .from(tasks)
    .where(and(isNull(tasks.projectId), ne(tasks.id, task.id)))
    .orderBy(asc(tasks.sortOrder))
    .all()
    .at(-1)?.sortOrder ?? 0;
  db.update(tasks)
    .set({
      projectId: null,
      columnId: null,
      lastOpenColumnId: null,
      phaseId: null,
      parentTaskId: null,
      sortOrder: max + SORT_GAP,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
    .run();
  if (task.parentTaskId) syncTaskAncestors(task.parentTaskId);
  return { sourceProjectId: task.projectId };
}

/**
 * Deletes a task but keeps its direct children: they take the task's place
 * under its parent (or at the top level), in the task's position, before the
 * task itself is deleted. Runs synchronously; call it inside a transaction.
 */
export function deleteTaskLiftingChildren(taskId: string): { projectId: string | null } {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new TaskMoveError("task_not_found");
  const children = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.parentTaskId, task.id))
    .orderBy(asc(tasks.sortOrder))
    .all();
  if (children.length > 0 && task.projectId) {
    const siblings = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, task.projectId),
          task.parentTaskId ? eq(tasks.parentTaskId, task.parentTaskId) : isNull(tasks.parentTaskId),
        ),
      )
      .orderBy(asc(tasks.sortOrder))
      .all()
      .map((row) => row.id);
    const index = siblings.indexOf(task.id);
    const ordered = [...siblings];
    ordered.splice(index < 0 ? ordered.length : index, 1, ...children.map((child) => child.id));
    const now = new Date();
    ordered.forEach((id, position) => {
      db.update(tasks)
        .set({
          sortOrder: (position + 1) * SORT_GAP,
          ...(children.some((child) => child.id === id)
            ? { parentTaskId: task.parentTaskId, updatedAt: now }
            : {}),
        })
        .where(eq(tasks.id, id))
        .run();
    });
  }
  // The children were lifted above, so only the task's own side rows remain.
  db.delete(projectDependencies)
    .where(and(eq(projectDependencies.predecessorType, "task"), eq(projectDependencies.predecessorId, task.id)))
    .run();
  db.delete(contextLinks)
    .where(and(eq(contextLinks.ownerType, "task"), eq(contextLinks.ownerId, task.id)))
    .run();
  db.delete(tasks).where(eq(tasks.id, task.id)).run();
  if (task.parentTaskId) syncTaskAncestors(task.parentTaskId);
  if (task.projectId) syncProjectBounds(task.projectId);
  return { projectId: task.projectId };
}

/** Ids of every task below `taskId`, across the whole hierarchy. */
export function descendantIds(taskId: string): string[] {
  const result: string[] = [];
  let frontier = [taskId];
  while (frontier.length > 0) {
    const children = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.parentTaskId, frontier))
      .all()
      .map((row) => row.id)
      .filter((id) => !result.includes(id) && id !== taskId);
    result.push(...children);
    frontier = children;
  }
  return result;
}
