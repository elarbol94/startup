export type GanttRoutePoint = {
  x: number;
  y: number;
};

export type GanttRouteObstacle = {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type GanttDependencyRoute = {
  points: GanttRoutePoint[];
  path: string;
  handle: GanttRoutePoint;
  handles: {
    x: GanttRoutePoint | null;
    y: GanttRoutePoint | null;
  };
  score: number;
};

type RouteInput = {
  source: GanttRoutePoint;
  target: GanttRoutePoint;
  sourceDirection: -1 | 1;
  targetDirection: -1 | 1;
  stub: number;
  obstacles?: GanttRouteObstacle[];
  occupiedRoutes?: GanttRoutePoint[][];
  excludedObstacleIds?: Set<string>;
  laneBias?: number;
  manualOffset?: GanttRoutePoint | null;
};

const OBSTACLE_PENALTY = 100_000;
const CROSSING_PENALTY = 1_200;
const OVERLAP_PENALTY = 4_000;
const BEND_PENALTY = 18;

function samePoint(a: GanttRoutePoint, b: GanttRoutePoint) {
  return a.x === b.x && a.y === b.y;
}

function collinear(
  a: GanttRoutePoint,
  b: GanttRoutePoint,
  c: GanttRoutePoint,
) {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}

export function compactOrthogonalPoints(points: GanttRoutePoint[]) {
  let compact = points.filter(
    (point, index) => index === 0 || !samePoint(point, points[index - 1]),
  );
  let changed = true;
  while (changed && compact.length > 2) {
    changed = false;
    const next = compact.filter((point, index) => {
      if (index === 0 || index === compact.length - 1) return true;
      const before = compact[index - 1];
      const after = compact[index + 1];
      const remove = collinear(before, point, after) &&
        point.x >= Math.min(before.x, after.x) && point.x <= Math.max(before.x, after.x) &&
        point.y >= Math.min(before.y, after.y) && point.y <= Math.max(before.y, after.y);
      if (remove) changed = true;
      return !remove;
    });
    compact = next.filter(
      (point, index) => index === 0 || !samePoint(point, next[index - 1]),
    );
  }
  return compact;
}

export function roundedOrthogonalPath(
  points: GanttRoutePoint[],
  cornerRadius = 6,
) {
  if (points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (!next) {
      path += ` L ${point.x} ${point.y}`;
      continue;
    }
    const previous = points[index - 1];
    const incomingLength =
      Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    const outgoingLength =
      Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
    const radius = Math.min(
      cornerRadius,
      incomingLength / 2,
      outgoingLength / 2,
    );
    if (radius <= 0) {
      path += ` L ${point.x} ${point.y}`;
      continue;
    }
    const before = {
      x: point.x - Math.sign(point.x - previous.x) * radius,
      y: point.y - Math.sign(point.y - previous.y) * radius,
    };
    const after = {
      x: point.x + Math.sign(next.x - point.x) * radius,
      y: point.y + Math.sign(next.y - point.y) * radius,
    };
    path += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }
  return path;
}

function segmentLength(a: GanttRoutePoint, b: GanttRoutePoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function segmentIntersectsObstacle(
  a: GanttRoutePoint,
  b: GanttRoutePoint,
  obstacle: GanttRouteObstacle,
) {
  if (a.y === b.y) {
    return (
      a.y >= obstacle.top &&
      a.y <= obstacle.bottom &&
      Math.max(a.x, b.x) >= obstacle.left &&
      Math.min(a.x, b.x) <= obstacle.right
    );
  }
  return (
    a.x >= obstacle.left &&
    a.x <= obstacle.right &&
    Math.max(a.y, b.y) >= obstacle.top &&
    Math.min(a.y, b.y) <= obstacle.bottom
  );
}

function segmentRelation(
  a: GanttRoutePoint,
  b: GanttRoutePoint,
  c: GanttRoutePoint,
  d: GanttRoutePoint,
) {
  const aHorizontal = a.y === b.y;
  const cHorizontal = c.y === d.y;
  if (aHorizontal !== cHorizontal) {
    const horizontalA = aHorizontal ? a : c;
    const horizontalB = aHorizontal ? b : d;
    const verticalA = aHorizontal ? c : a;
    const verticalB = aHorizontal ? d : b;
    const crosses =
      verticalA.x >= Math.min(horizontalA.x, horizontalB.x) &&
      verticalA.x <= Math.max(horizontalA.x, horizontalB.x) &&
      horizontalA.y >= Math.min(verticalA.y, verticalB.y) &&
      horizontalA.y <= Math.max(verticalA.y, verticalB.y);
    return crosses ? "cross" : "none";
  }
  if (aHorizontal) {
    if (a.y !== c.y) return "none";
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
      ? "overlap"
      : "none";
  }
  if (a.x !== c.x) return "none";
  return Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
    Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
    ? "overlap"
    : "none";
}

type AdjustableSegment = {
  index: number;
  midpoint: GanttRoutePoint;
  length: number;
};

function adjustableSegments(points: GanttRoutePoint[]) {
  const segments = points
    .slice(1, -2)
    .map((point, offset) => {
      const index = offset + 1;
      const next = points[index + 1];
      return {
        index,
        a: point,
        b: next,
        length: segmentLength(point, next),
        midpoint: {
          x: (point.x + next.x) / 2,
          y: (point.y + next.y) / 2,
        },
      };
    })
    .filter((segment) => segment.length > 0);
  const longest = (matches: typeof segments): AdjustableSegment | null =>
    matches.sort(
      (a, b) => b.length - a.length || a.index - b.index,
    )[0] ?? null;
  return {
    x: longest(segments.filter((segment) => segment.a.x === segment.b.x)),
    y: longest(segments.filter((segment) => segment.a.y === segment.b.y)),
  };
}

function routeHandles(points: GanttRoutePoint[]) {
  const segments = adjustableSegments(points);
  return {
    x: segments.x?.midpoint ?? null,
    y: segments.y?.midpoint ?? null,
  };
}

function fallbackRouteHandle(points: GanttRoutePoint[]) {
  const handles = routeHandles(points);
  if (handles.x) return handles.x;
  if (handles.y) return handles.y;
  return {
    x: (points[0].x + points.at(-1)!.x) / 2,
    y: (points[0].y + points.at(-1)!.y) / 2,
  };
}

function routeScore(
  points: GanttRoutePoint[],
  obstacles: GanttRouteObstacle[],
  occupiedRoutes: GanttRoutePoint[][],
  excludedObstacleIds: Set<string>,
) {
  let score = Math.max(0, points.length - 2) * BEND_PENALTY;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    score += segmentLength(start, end);
    for (const obstacle of obstacles) {
      if (
        !(excludedObstacleIds.has(obstacle.id) &&
          ((index === 1 && points[0].x >= obstacle.left && points[0].x <= obstacle.right && points[0].y >= obstacle.top && points[0].y <= obstacle.bottom) ||
           (index === points.length - 1 && points.at(-1)!.x >= obstacle.left && points.at(-1)!.x <= obstacle.right && points.at(-1)!.y >= obstacle.top && points.at(-1)!.y <= obstacle.bottom))) &&
        segmentIntersectsObstacle(start, end, obstacle)
      ) {
        score += OBSTACLE_PENALTY;
      }
    }
    for (const route of occupiedRoutes) {
      for (let routeIndex = 1; routeIndex < route.length; routeIndex += 1) {
        const relation = segmentRelation(
          start,
          end,
          route[routeIndex - 1],
          route[routeIndex],
        );
        if (relation === "cross") score += CROSSING_PENALTY;
        if (relation === "overlap") score += OVERLAP_PENALTY;
      }
    }
  }
  return score;
}

function candidateRoute(
  points: GanttRoutePoint[],
  input: RouteInput,
): GanttDependencyRoute {
  const compact = compactOrthogonalPoints(points);
  const handles = routeHandles(compact);
  return {
    points: compact,
    path: roundedOrthogonalPath(compact),
    handle: handles.x ?? handles.y ?? fallbackRouteHandle(compact),
    handles,
    score: routeScore(
      compact,
      input.obstacles ?? [],
      input.occupiedRoutes ?? [],
      input.excludedObstacleIds ?? new Set(),
    ),
  };
}

/**
 * Chooses a short orthogonal dependency route while strongly preferring paths
 * that do not cross scheduled bars and weakly preferring paths that do not
 * overlap existing dependency lines. Manual offsets move the route's longest
 * adjustable vertical and horizontal segments along their natural axes.
 */
export function routeGanttDependency(input: RouteInput): GanttDependencyRoute {
  const {
    source,
    target,
    sourceDirection,
    targetDirection,
    stub,
    laneBias = 0,
  } = input;
  const sourceExit = {
    x: source.x + sourceDirection * stub,
    y: source.y,
  };
  const targetExit = {
    x: target.x + targetDirection * stub,
    y: target.y,
  };
  const minX = Math.min(sourceExit.x, targetExit.x);
  const maxX = Math.max(sourceExit.x, targetExit.x);
  const minY = Math.min(source.y, target.y);
  const maxY = Math.max(source.y, target.y);
  const channelXs = [
    (sourceExit.x + targetExit.x) / 2 + laneBias,
    sourceExit.x + sourceDirection * (stub + Math.abs(laneBias)),
    targetExit.x + targetDirection * (stub + Math.abs(laneBias)),
    minX - stub - Math.abs(laneBias),
    maxX + stub + Math.abs(laneBias),
  ];
  const nearbyObstacles = (input.obstacles ?? []).filter((o) => o.bottom >= minY - 44 && o.top <= maxY + 44);
  channelXs.push(...nearbyObstacles.flatMap((o) => [o.left - 8, o.right + 8]));
  const bridgeYs = [
    (source.y + target.y) / 2 + laneBias / 2,
    minY - stub - Math.abs(laneBias),
    maxY + stub + Math.abs(laneBias),
    ...nearbyObstacles.flatMap((o) => [o.top - 6, o.bottom + 6]),
  ];
  const candidates: GanttDependencyRoute[] = [];

  for (const channelX of channelXs) {
    const candidate = candidateRoute(
        [
          source,
          sourceExit,
          { x: channelX, y: source.y },
          { x: channelX, y: target.y },
          targetExit,
          target,
        ],
        input,
      );
    const reversesSource =
      (channelX - sourceExit.x) * sourceDirection < 0;
    const reversesTarget =
      (channelX - targetExit.x) * targetDirection < 0;
    candidates.push({
      ...candidate,
      score:
        candidate.score +
        (reversesSource ? 5_000 : 0) +
        (reversesTarget ? 5_000 : 0),
    });
  }
  for (const bridgeY of bridgeYs) {
    const sourceChannelX =
      sourceExit.x;
    const targetChannelX =
      targetExit.x;
    candidates.push(
      candidateRoute(
        [
          source,
          sourceExit,
          { x: sourceChannelX, y: source.y },
          { x: sourceChannelX, y: bridgeY },
          { x: targetChannelX, y: bridgeY },
          { x: targetChannelX, y: target.y },
          targetExit,
          target,
        ],
        input,
      ),
    );
  }

  for (const candidate of candidates) {
    const points = candidate.points;
    for (let i = 1; i < points.length - 1; i++) {
      if (collinear(points[i - 1], points[i], points[i + 1])) candidate.score += OBSTACLE_PENALTY;
    }
  }
  const automatic = candidates.sort(
    (a, b) => a.score - b.score || a.path.localeCompare(b.path),
  )[0];
  if (!input.manualOffset) return automatic;

  const manualPoints = automatic.points.map((point) => ({ ...point }));
  const segments = adjustableSegments(manualPoints);
  if (segments.x && input.manualOffset.x !== 0) {
    manualPoints[segments.x.index].x += input.manualOffset.x;
    manualPoints[segments.x.index + 1].x += input.manualOffset.x;
  }
  if (segments.y && input.manualOffset.y !== 0) {
    manualPoints[segments.y.index].y += input.manualOffset.y;
    manualPoints[segments.y.index + 1].y += input.manualOffset.y;
  }
  const manual = candidateRoute(manualPoints, input);
  if (manual.score < OBSTACLE_PENALTY) return manual;
  // A manual handle must not send a line through a bar. Snap to the nearest
  // clear lane, preserving the endpoint anchors and orthogonal segments.
  const alternatives: GanttDependencyRoute[] = [];
  for (const offset of [-24, -16, -8, 8, 16, 24]) {
    for (const axis of ["x", "y"] as const) {
      const segment = segments[axis];
      if (!segment) continue;
      const points = manualPoints.map(point => ({ ...point }));
      points[segment.index][axis] += offset;
      points[segment.index + 1][axis] += offset;
      const route = candidateRoute(points, input);
      if (route.score < OBSTACLE_PENALTY) alternatives.push({ ...route, score: route.score + Math.abs(offset) });
    }
  }
  return alternatives.sort((a, b) => a.score - b.score)[0] ?? automatic;
}
