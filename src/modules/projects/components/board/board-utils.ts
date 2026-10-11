// Pure helpers and constants for board task cards (priority badge styles, subtask
// leaf collection). Used by board/task-card.tsx.
import type { BoardTaskDto } from "../task-dialog";

// Design 1b priority pills: Hoch stands out, Mittel is neutral, Niedrig is outlined.
export const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-muted text-text-secondary",
  low: "border border-line-strong font-medium text-text-secondary",
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
