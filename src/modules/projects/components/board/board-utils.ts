// Pure helpers and constants for board task cards (priority badge styles, subtask
// leaf collection). Used by board/task-card.tsx.
import type { BoardTaskDto } from "../task-dialog";

export const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function descendantLeaves(
  taskId: string,
  subtasksByParent: Record<string, BoardTaskDto[]>,
): BoardTaskDto[] {
  const children = subtasksByParent[taskId] ?? [];
  if (children.length === 0) return [];
  return children.flatMap((child) => {
    const descendants = descendantLeaves(child.id, subtasksByParent);
    return descendants.length > 0 ? descendants : [child];
  });
}
