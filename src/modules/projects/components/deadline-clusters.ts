/** Minimum horizontal distance (px) between two deadline diamonds before they merge. */
export const DEADLINE_CLUSTER_DISTANCE = 24;

export type MarkerCluster<T> = { x: number; items: T[] };

/**
 * Greedily groups markers whose x positions lie within `distance` of the
 * cluster's first marker, so overlapping deadline diamonds collapse into one
 * counted marker. A distance of 0 keeps every marker on its own.
 */
export function clusterDeadlineMarkers<T>(
  items: T[],
  position: (item: T) => number,
  distance = DEADLINE_CLUSTER_DISTANCE,
): MarkerCluster<T>[] {
  const sorted = items
    .map((item) => ({ item, x: position(item) }))
    .sort((a, b) => a.x - b.x);
  const clusters: Array<{ anchor: number; xs: number[]; items: T[] }> = [];
  for (const entry of sorted) {
    const current = clusters.at(-1);
    if (current && distance > 0 && entry.x - current.anchor < distance) {
      current.items.push(entry.item);
      current.xs.push(entry.x);
    } else {
      clusters.push({ anchor: entry.x, xs: [entry.x], items: [entry.item] });
    }
  }
  return clusters.map((cluster) => ({
    x: cluster.xs.reduce((sum, x) => sum + x, 0) / cluster.xs.length,
    items: cluster.items,
  }));
}

/**
 * Deadlines in the order they appear as individual rows when the Gantt
 * deadline lane is expanded: by due date, undated ones last, then by title.
 */
export function sortDeadlinesForRows<T extends { dueDate: string | null; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
}

/** Total height of the deadline lane: summary row plus one row per deadline when expanded. */
export function deadlineLaneTotalHeight(count: number, expanded: boolean, rowHeight: number): number {
  if (count <= 0) return 0;
  return rowHeight * (expanded ? count + 1 : 1);
}
