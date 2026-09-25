// Pure filters that remove projects/tasks awaiting a delayed delete (see
// src/lib/use-pending-delete.ts) from the data the projects UI renders.
import type { PortfolioSchedule } from "./queries";

type TreeTask = { id: string; parentTaskId: string | null };

/**
 * Nearest ancestor of a hidden task that is still visible. Children of a task
 * hidden without its subtree (the "keep subtasks" delete) are shown there,
 * which is where the server moves them once the delete commits.
 */
function visibleParent<T extends TreeTask>(
  parentId: string | null,
  byId: Map<string, T>,
  hidden: ReadonlySet<string>,
): string | null {
  let current = parentId;
  while (current && hidden.has(current)) current = byId.get(current)?.parentTaskId ?? null;
  return current;
}

export function hidePendingFromSchedule(
  schedule: PortfolioSchedule,
  hidden: ReadonlySet<string>,
): PortfolioSchedule {
  if (hidden.size === 0) return schedule;
  const byId = new Map(schedule.tasks.map((task) => [task.id, task]));
  const tasks = schedule.tasks
    .filter((task) => !hidden.has(task.id) && !hidden.has(task.projectId))
    .map((task) =>
      task.parentTaskId && hidden.has(task.parentTaskId)
        ? { ...task, parentTaskId: visibleParent(task.parentTaskId, byId, hidden) }
        : task,
    );
  const visibleTaskIds = new Set(tasks.map((task) => task.id));
  return {
    ...schedule,
    projects: schedule.projects.filter((project) => !hidden.has(project.id)),
    tasks,
    deadlines: schedule.deadlines.filter((deadline) => !deadline.projectId || !hidden.has(deadline.projectId)),
    columns: schedule.columns.filter((column) => !hidden.has(column.projectId)),
    dependencies: schedule.dependencies.filter(
      (dependency) =>
        visibleTaskIds.has(dependency.predecessorTaskId) &&
        visibleTaskIds.has(dependency.successorTaskId),
    ),
  };
}

/** Board variant: top-level cards per column plus nested subtasks. */
export function hidePendingFromBoard<T extends TreeTask & { columnId: string }>(
  tasksByColumn: Record<string, T[]>,
  subtasksByParent: Record<string, T[]>,
  hidden: ReadonlySet<string>,
): { tasksByColumn: Record<string, T[]>; subtasksByParent: Record<string, T[]> } {
  if (hidden.size === 0) return { tasksByColumn, subtasksByParent };
  const all = [...Object.values(tasksByColumn), ...Object.values(subtasksByParent)].flat();
  const byId = new Map(all.map((task) => [task.id, task]));
  const columns: Record<string, T[]> = {};
  const subtasks: Record<string, T[]> = {};
  for (const [columnId, list] of Object.entries(tasksByColumn)) {
    columns[columnId] = list.filter((task) => !hidden.has(task.id));
  }
  for (const [parentId, list] of Object.entries(subtasksByParent)) {
    for (const task of list) {
      if (hidden.has(task.id)) continue;
      if (!hidden.has(parentId)) {
        (subtasks[parentId] ??= []).push(task);
        continue;
      }
      const target = visibleParent(parentId, byId, hidden);
      const lifted = { ...task, parentTaskId: target };
      if (target) (subtasks[target] ??= []).push(lifted);
      else (columns[task.columnId] ??= []).push(lifted);
    }
  }
  return { tasksByColumn: columns, subtasksByParent: subtasks };
}
