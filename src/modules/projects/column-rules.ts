type ColumnCandidate = {
  id: string;
  isCompleted: boolean;
  workflowStage: string;
  sortOrder: number;
};

/**
 * Picks where the tasks of a deleted column go: a column with the same meaning
 * (another completed column, or an open column of the same workflow stage),
 * then the open column nearest to "done", then whatever remains.
 */
export function pickColumnDeletionTarget<T extends ColumnCandidate>(
  column: T,
  remaining: T[],
): T | undefined {
  const ordered = [...remaining]
    .filter((candidate) => candidate.id !== column.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const open = ordered.filter((candidate) => !candidate.isCompleted);
  if (column.isCompleted) {
    return ordered.find((candidate) => candidate.isCompleted) ?? open.at(-1);
  }
  return open.find((candidate) => candidate.workflowStage === column.workflowStage) ??
    open[0] ??
    ordered[0];
}
