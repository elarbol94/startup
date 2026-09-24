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
