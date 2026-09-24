// Dependency arrow routing for the portfolio Gantt: per-link path geometry and the per-render
// layout pass (endpoint fan-out, bar obstacles, lane spreading). Used by portfolio-client.tsx and dependency-lines.tsx.
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { dependencyEndpoints } from "@/modules/projects/schedule";
import {
  routeGanttDependency,
  type GanttRouteObstacle,
  type GanttRoutePoint,
} from "@/modules/projects/gantt-routing";
import { ROW_HEIGHT } from "./portfolio-constants";
import type { DependencyDraft, PortfolioDependency, Row } from "./portfolio-types";
import { calendarDistance } from "./portfolio-utils";

export function dependencyPathGeometry({
  dependency,
  predecessor,
  successor,
  predecessorIndex,
  successorIndex,
  rangeStart,
  dayWidth,
  sourceOffsetY = 0,
  targetOffsetY = 0,
  laneOffset = 0,
  obstacles = [],
  occupiedRoutes = [],
}: {
  dependency: PortfolioDependency;
  predecessor: Row;
  successor: Row;
  predecessorIndex: number;
  successorIndex: number;
  rangeStart: string;
  dayWidth: number;
  sourceOffsetY?: number;
  targetOffsetY?: number;
  laneOffset?: number;
  obstacles?: GanttRouteObstacle[];
  occupiedRoutes?: GanttRoutePoint[][];
}) {
  const endpoints = dependencyEndpoints(dependency);
  const predecessorDate =
    endpoints.predecessor === "start"
      ? predecessor.startDate
      : predecessor.dueDate;
  const successorDate =
    endpoints.successor === "start"
      ? successor.startDate
      : successor.dueDate;
  if (!predecessorDate || !successorDate) return null;
  const x1 =
    (calendarDistance(rangeStart, predecessorDate) +
      (endpoints.predecessor === "finish" ? 1 : 0)) *
    dayWidth;
  const x2 =
    (calendarDistance(rangeStart, successorDate) +
      (endpoints.successor === "finish" ? 1 : 0)) *
    dayWidth;
  const y1 =
    predecessorIndex * ROW_HEIGHT + ROW_HEIGHT / 2 + sourceOffsetY;
  const y2 =
    successorIndex * ROW_HEIGHT + ROW_HEIGHT / 2 + targetOffsetY;
  const sourceDirection = endpoints.predecessor === "finish" ? 1 as const : -1 as const;
  const targetDirection = endpoints.successor === "start" ? -1 as const : 1 as const;
  const stub = Math.max(12, Math.min(24, dayWidth));
  const manual =
    dependency.routeOffsetDays !== null ||
    dependency.routeOffsetRows !== null;
  const route = routeGanttDependency({
    source: { x: x1, y: y1 },
    target: { x: x2, y: y2 },
    sourceDirection,
    targetDirection,
    stub,
    obstacles,
    occupiedRoutes,
    excludedObstacleIds: new Set([
      dependency.predecessorTaskId,
      dependency.successorTaskId,
    ]),
    laneBias: laneOffset,
    manualOffset: manual
      ? {
          x: (dependency.routeOffsetDays ?? 0) * dayWidth,
          y: (dependency.routeOffsetRows ?? 0) * (ROW_HEIGHT / 4),
        }
      : null,
  });
  return {
    path: route.path,
    points: route.points,
    labelX: route.handle.x,
    labelY: route.handle.y,
    handles: route.handles,
  };
}

/**
 * Routes every rendered dependency arrow for the current rows. Arrows are routed in
 * order so later ones avoid earlier ones.
 */
export function layoutDependencyRoutes({
  rows,
  effectiveSchedule,
  visibleFocusDependencyIds,
  dependencyDraft,
  range,
  dayWidth,
}: {
  rows: Row[];
  effectiveSchedule: PortfolioSchedule;
  visibleFocusDependencyIds: Set<string> | null;
  dependencyDraft: DependencyDraft | null;
  range: { start: string; end: string };
  dayWidth: number;
}) {
  // Summaries can sit at either end of a dependency (R6), so they need to be
  // addressable here too or their arrows would never be drawn.
  const rowIndex = new Map(
    rows.flatMap((row, index) => (row.task ? [[row.id, index] as const] : [])),
  );
  const taskRows = new Map(rows.filter((row) => row.task).map((row) => [row.id, row]));
  const renderedDependencies = effectiveSchedule.dependencies.filter(
    (dependency) =>
      !visibleFocusDependencyIds ||
      visibleFocusDependencyIds.has(dependency.id) ||
      dependencyDraft?.id === dependency.id,
  );
  const dependencySourceGroups = new Map<string, string[]>();
  const dependencyTargetGroups = new Map<string, string[]>();
  for (const dependency of renderedDependencies) {
    const endpoints = dependencyEndpoints(dependency);
    const sourceKey = `${dependency.predecessorTaskId}:${endpoints.predecessor}`;
    const targetKey = `${dependency.successorTaskId}:${endpoints.successor}`;
    dependencySourceGroups.set(sourceKey, [
      ...(dependencySourceGroups.get(sourceKey) ?? []),
      dependency.id,
    ]);
    dependencyTargetGroups.set(targetKey, [
      ...(dependencyTargetGroups.get(targetKey) ?? []),
      dependency.id,
    ]);
  }
  function endpointFanOffset(
    groups: Map<string, string[]>,
    key: string,
    dependencyId: string,
  ) {
    const group = groups.get(key) ?? [];
    const index = group.indexOf(dependencyId);
    if (index < 0 || group.length < 2) return 0;
    return Math.max(
      -10,
      Math.min(10, (index - (group.length - 1) / 2) * 10),
    );
  }
  const dependencyRoutes = new Map(
    renderedDependencies.map((dependency, index) => {
      const endpoints = dependencyEndpoints(dependency);
      const laneStep =
        index === 0
          ? 0
          : (index % 5) * 4 * (index % 2 === 1 ? 1 : -1);
      return [
        dependency.id,
        {
          sourceOffsetY: endpointFanOffset(
            dependencySourceGroups,
            `${dependency.predecessorTaskId}:${endpoints.predecessor}`,
            dependency.id,
          ),
          targetOffsetY: endpointFanOffset(
            dependencyTargetGroups,
            `${dependency.successorTaskId}:${endpoints.successor}`,
            dependency.id,
          ),
          laneOffset: laneStep,
        },
      ] as const;
    }),
  );
  const dependencyObstacles: GanttRouteObstacle[] = rows.flatMap(
    (row, index) => {
      if (!row.task || !row.startDate || !row.dueDate) return [];
      return [
        {
          id: row.id,
          left:
            calendarDistance(range.start, row.startDate) * dayWidth - 6,
          right:
            (calendarDistance(range.start, row.dueDate) + 1) * dayWidth + 6,
          top: index * ROW_HEIGHT + 8,
          bottom: (index + 1) * ROW_HEIGHT - 8,
        },
      ];
    },
  );
  const dependencyGeometries = new Map<
    string,
    NonNullable<ReturnType<typeof dependencyPathGeometry>>
  >();
  const occupiedDependencyRoutes: GanttRoutePoint[][] = [];
  for (const dependency of renderedDependencies) {
    const fromIndex = rowIndex.get(dependency.predecessorTaskId);
    const toIndex = rowIndex.get(dependency.successorTaskId);
    const from = taskRows.get(dependency.predecessorTaskId);
    const to = taskRows.get(dependency.successorTaskId);
    if (
      fromIndex === undefined ||
      toIndex === undefined ||
      !from ||
      !to
    ) {
      continue;
    }
    const geometry = dependencyPathGeometry({
      dependency,
      predecessor: from,
      successor: to,
      predecessorIndex: fromIndex,
      successorIndex: toIndex,
      rangeStart: range.start,
      dayWidth,
      obstacles: dependencyObstacles,
      occupiedRoutes: occupiedDependencyRoutes,
      ...dependencyRoutes.get(dependency.id),
    });
    if (!geometry) continue;
    dependencyGeometries.set(dependency.id, geometry);
    occupiedDependencyRoutes.push(geometry.points);
  }
  return {
    rowIndex,
    taskRows,
    renderedDependencies,
    dependencyObstacles,
    dependencyGeometries,
    occupiedDependencyRoutes,
  };
}
