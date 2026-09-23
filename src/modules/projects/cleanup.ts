import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contextLinks, projectDependencies, tasks } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Returns the given tasks plus every descendant, walking `parentTaskId`. */
export function taskSubtreeIds(tx: Transaction, rootTaskIds: string[]): string[] {
  const seen = new Set(rootTaskIds);
  let frontier = [...seen];
  while (frontier.length > 0) {
    const children = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.parentTaskId, frontier))
      .all()
      .map((row) => row.id)
      .filter((id) => !seen.has(id));
    children.forEach((id) => seen.add(id));
    frontier = children;
  }
  return [...seen];
}

/**
 * Removes rows that point at tasks by a polymorphic id and therefore are not
 * covered by foreign-key cascades: project dependencies whose predecessor is
 * one of the tasks and the tasks' own context links. Call it inside the delete
 * transaction BEFORE deleting the tasks, with the root ids being deleted;
 * subtasks are included automatically because they cascade with their parent.
 */
export function deleteTaskSubtreeSideRows(tx: Transaction, rootTaskIds: string[]): void {
  if (rootTaskIds.length === 0) return;
  const ids = taskSubtreeIds(tx, rootTaskIds);
  tx.delete(projectDependencies)
    .where(and(eq(projectDependencies.predecessorType, "task"), inArray(projectDependencies.predecessorId, ids)))
    .run();
  tx.delete(contextLinks)
    .where(and(eq(contextLinks.ownerType, "task"), inArray(contextLinks.ownerId, ids)))
    .run();
}

/**
 * Same cleanup for a whole project: its tasks' side rows, project dependencies
 * that use the project as predecessor, and the project's own context links.
 * Call it inside the delete transaction BEFORE deleting the project.
 */
export function deleteProjectSideRows(tx: Transaction, projectId: string): void {
  const taskIds = tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .all()
    .map((row) => row.id);
  deleteTaskSubtreeSideRows(tx, taskIds);
  tx.delete(projectDependencies)
    .where(and(eq(projectDependencies.predecessorType, "project"), eq(projectDependencies.predecessorId, projectId)))
    .run();
  tx.delete(contextLinks)
    .where(and(eq(contextLinks.ownerType, "project"), eq(contextLinks.ownerId, projectId)))
    .run();
}
