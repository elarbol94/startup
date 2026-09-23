import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectColumns, projects, tasks } from "@/db/schema";
import {
  expandContainerEnvelope,
  leafTasks,
  taskAncestors,
  taskDescendants,
  weightedProgress,
} from "@/modules/projects/schedule";

/*
 * Rollup helpers shared by the project server actions. They live outside the
 * "use server" modules because every export of such a module is a public
 * endpoint; these must only run inside an authorised action.
 */

export function projectHierarchyRows(projectId: string) {
  return db
    .select({
      id: tasks.id,
      projectId: sql<string>`${tasks.projectId}`,
      parentTaskId: tasks.parentTaskId,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      progress: tasks.progress,
      isMilestone: tasks.isMilestone,
      columnId: tasks.columnId,
      columnIsCompleted: projectColumns.isCompleted,
    })
    .from(tasks)
    .innerJoin(projectColumns, eq(tasks.columnId, projectColumns.id))
    .where(eq(tasks.projectId, projectId))
    .all();
}

/**
 * Expands a summary around its children while preserving any authored slack.
 * Callers work deepest-first so every parent sees already-contained children.
 */
export function syncParentSummary(parentTaskId: string): void {
  const parent = db.select().from(tasks).where(eq(tasks.id, parentTaskId)).get();
  if (!parent?.projectId) return;
  const projectId = parent.projectId;
  const projectTasks = projectHierarchyRows(projectId);
  const descendants = taskDescendants(projectTasks, parentTaskId);
  if (descendants.length === 0) return;
  const leaves = leafTasks([projectTasks.find((task) => task.id === parentTaskId)!, ...descendants])
    .filter((task) => task.id !== parentTaskId);
  const children = projectTasks.filter((task) => task.parentTaskId === parentTaskId);
  const envelope = expandContainerEnvelope(parent, children);
  const columns = db
    .select()
    .from(projectColumns)
    .where(eq(projectColumns.projectId, projectId))
    .orderBy(asc(projectColumns.sortOrder))
    .all();
  const allComplete = leaves.length > 0 && leaves.every((child) => child.columnIsCompleted);
  const currentColumn = columns.find((column) => column.id === parent.columnId);
  const completedColumn = columns.find((column) => column.isCompleted);
  const activeFallback = columns.filter((column) => !column.isCompleted).at(-1);
  const columnId = allComplete
    ? completedColumn?.id ?? parent.columnId
    : currentColumn?.isCompleted
      ? activeFallback?.id ?? parent.columnId
      : parent.columnId;
  db.update(tasks)
    .set({
      startDate: envelope.startDate,
      dueDate: envelope.dueDate,
      progress: allComplete ? 100 : weightedProgress(leaves),
      columnId,
      status: allComplete ? "done" : "open",
      completedAt: allComplete ? parent.completedAt ?? new Date() : null,
      lastOpenColumnId: allComplete
        ? parent.lastOpenColumnId ?? (currentColumn?.isCompleted ? null : currentColumn?.id ?? null)
        : columnId,
      isMilestone: false,
      // A summary's dates are derived, so a constraint on it would never apply.
      constraintType: "asap",
      constraintDate: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, parentTaskId))
    .run();
}

export function syncProjectParents(projectId: string): void {
  const rows = projectHierarchyRows(projectId);
  const parentIds = [...new Set(
    rows
      .map((task) => task.parentTaskId)
      .filter((parentTaskId): parentTaskId is string => Boolean(parentTaskId)),
  )].sort(
    (left, right) =>
      taskAncestors(rows, right).length - taskAncestors(rows, left).length,
  );
  parentIds.forEach((id) => syncParentSummary(id));
}

/** Expands a project around all scheduled work without ever shrinking it. */
export function syncProjectBounds(projectId: string): void {
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) return;
  const projectTasks = db
    .select({
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .all();
  const envelope = expandContainerEnvelope(
    {
      id: project.id,
      startDate: project.plannedStartDate,
      dueDate: project.targetEndDate,
    },
    projectTasks,
  );
  const plannedStartDate = envelope.startDate;
  const targetEndDate = envelope.dueDate;
  if (
    plannedStartDate === project.plannedStartDate &&
    targetEndDate === project.targetEndDate
  ) {
    return;
  }
  db.update(projects)
    .set({
      plannedStartDate,
      targetEndDate,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .run();
}

export function syncTaskAncestors(taskId: string): void {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task?.projectId) return;
  const rows = projectHierarchyRows(task.projectId);
  if (rows.some((candidate) => candidate.parentTaskId === taskId)) {
    syncParentSummary(taskId);
  }
  taskAncestors(rows, taskId).forEach((ancestor) => syncParentSummary(ancestor.id));
}
