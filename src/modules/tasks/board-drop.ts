// Pure drag-and-drop helpers for the dashboard task board (components/task-board.tsx).

export const boardStages = ["todo", "in_progress", "done"] as const;
export type BoardStage = typeof boardStages[number];

type Point = { x: number; y: number };
type LaneRect = { left: number; right: number; top: number; bottom: number };

/**
 * Picks the lane a dragged card should land in. Lanes are columns, so only the
 * horizontal position decides between them: the pointer may sit below a short
 * lane's cards or in the gap between two lanes and still hit the nearest one.
 * Returns null when the pointer is outside the lanes' vertical span or further
 * than `tolerance` pixels from every lane.
 */
export function laneAtPoint(point: Point | null, lanes: Array<{ id: string; rect: LaneRect }>, tolerance = 24): string | null {
  if (!point) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const { id, rect } of lanes) {
    if (point.y < rect.top || point.y > rect.bottom) continue;
    const distance = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
    if (distance < bestDistance) { best = id; bestDistance = distance; }
  }
  return bestDistance <= tolerance ? best : null;
}

/** Optimistic move: puts the task in its new stage and marks it as saving. */
export function applyBoardMove<T extends { id: string; boardStage: BoardStage }>(rows: T[], update: { id: string; stage: BoardStage }): Array<T & { moving?: boolean }> {
  return rows.map(row => row.id === update.id ? { ...row, boardStage: update.stage, moving: true } : row);
}
