/**
 * PowerPoint's Edit Points as pure operations on a path model: move vertices and Bézier
 * handles (respecting the vertex type), change vertex and segment types, add and delete
 * vertices, open and close paths, and hit-test. Every operation returns a new model.
 *
 * Vertex types follow PowerPoint: a smooth point keeps its handles opposite and of equal
 * length, a straight point keeps them opposite but lets their lengths differ, a corner
 * point moves them independently, and an auto point recomputes them from its neighbours.
 */
import {
  classifyNode, clonePath, cubicAt, isCurvedSegment, segmentCount, segmentCubic,
  type Cubic, type PathModel, type PathNode, type PathNodeType, type PathPoint, type Subpath,
} from "./presentation-path-model";

export * from "./presentation-path-model";
export { fitFreeform, freeformPathModel, freeformTransform, shapeLocalPath, shapeLocalPaths, isLineLike, toEditableFreeform } from "./presentation-path-freeform";

/** A vertex: subpath index and node index. */
export type NodeRef = { subpath: number; node: number };
/** A segment: subpath index and segment index (segment i runs from node i to node i+1). */
export type SegmentRef = { subpath: number; segment: number };

const add = (a: PathPoint, b: PathPoint): PathPoint => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: PathPoint, b: PathPoint): PathPoint => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: PathPoint, k: number): PathPoint => ({ x: a.x * k, y: a.y * k });
const length = (a: PathPoint) => Math.hypot(a.x, a.y);
const lerp = (a: PathPoint, b: PathPoint, t: number): PathPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function neighbours(path: Subpath, index: number): { prev?: PathNode; next?: PathNode } {
  const n = path.nodes.length;
  return {
    prev: index > 0 ? path.nodes[index - 1] : path.closed && n > 1 ? path.nodes[n - 1] : undefined,
    next: index < n - 1 ? path.nodes[index + 1] : path.closed && n > 1 ? path.nodes[0] : undefined,
  };
}

/** Handles of an auto vertex: along the line between its neighbours, a third of each segment. */
function autoHandles(path: Subpath, index: number) {
  const node = path.nodes[index];
  const { prev, next } = neighbours(path, index);
  if (!prev || !next) {
    // An open end: aim at the one neighbour, so the curve leaves it straight.
    if (prev) node.in = lerp(node, prev, 1 / 3);
    if (next) node.out = lerp(node, next, 1 / 3);
    return;
  }
  const direction = sub(next, prev), size = length(direction);
  if (size < 1e-9) { node.in = undefined; node.out = undefined; return; }
  const unit = scale(direction, 1 / size);
  node.in = sub(node, scale(unit, length(sub(node, prev)) / 3));
  node.out = add(node, scale(unit, length(sub(next, node)) / 3));
}

/** Recomputes the handles of every auto vertex at or next to `index`. */
function refreshAuto(path: Subpath, index: number) {
  const n = path.nodes.length;
  for (const i of [index - 1, index, index + 1]) {
    const j = path.closed ? (i + n) % n : i;
    if (j >= 0 && j < n && path.nodes[j].type === "auto") autoHandles(path, j);
  }
}

/** Moves a vertex (with its handles) to `to`. */
export function moveNode(model: PathModel, ref: NodeRef, to: PathPoint): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath], node = path?.nodes[ref.node];
  if (!node) return model;
  const delta = sub(to, node);
  node.x = to.x; node.y = to.y;
  if (node.in) node.in = add(node.in, delta);
  if (node.out) node.out = add(node.out, delta);
  refreshAuto(path, ref.node);
  return next;
}

/**
 * Moves a vertex's `in` or `out` handle to `to`. The opposite handle follows the vertex
 * type: mirrored for smooth, opposite at its own length for straight, untouched for a
 * corner. Dragging an auto vertex's handle makes it a smooth point, as in PowerPoint.
 */
export function moveHandle(model: PathModel, ref: NodeRef, which: "in" | "out", to: PathPoint): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath], node = path?.nodes[ref.node];
  if (!node) return model;
  if (node.type === "auto") node.type = "smooth";
  node[which] = { ...to };
  const other = which === "in" ? "out" : "in";
  const opposite = node[other];
  const arm = sub(to, node), armLength = length(arm);
  if (opposite && armLength > 1e-9 && (node.type === "smooth" || node.type === "straight")) {
    const keep = node.type === "smooth" ? armLength : length(sub(opposite, node));
    node[other] = sub(node, scale(arm, keep / armLength));
  }
  return next;
}

/** The handles a vertex needs to become smooth/straight when it has none or one. */
function ensureHandles(path: Subpath, index: number) {
  const node = path.nodes[index], { prev, next } = neighbours(path, index);
  if (node.in && node.out) return;
  const probe: Subpath = { closed: path.closed, nodes: path.nodes.map((n) => ({ ...n })) };
  autoHandles(probe, index);
  const computed = probe.nodes[index];
  if (!node.in && prev) node.in = computed.in;
  if (!node.out && next) node.out = computed.out;
}

/** Changes a vertex's type, aligning its handles the way PowerPoint does. */
export function setNodeType(model: PathModel, ref: NodeRef, type: PathNodeType): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath], node = path?.nodes[ref.node];
  if (!node) return model;
  node.type = type;
  if (type === "auto") { autoHandles(path, ref.node); return next; }
  if (type === "corner") return next;
  ensureHandles(path, ref.node);
  if (!node.in || !node.out) return next;
  const inArm = sub(node.in, node), outArm = sub(node.out, node);
  const inLength = length(inArm), outLength = length(outArm);
  // The tangent runs from the in handle to the out handle, so the curve keeps its direction.
  let direction = sub(outArm, inArm);
  if (length(direction) < 1e-9) direction = { x: 1, y: 0 };
  const unit = scale(direction, 1 / length(direction));
  const [lin, lout] = type === "smooth" ? [(inLength + outLength) / 2, (inLength + outLength) / 2] : [inLength, outLength];
  node.in = sub(node, scale(unit, lin));
  node.out = add(node, scale(unit, lout));
  return next;
}

/** Splits segment `ref` at `t` (de Casteljau for curves), returning the new vertex's ref. */
export function addNodeOnSegment(model: PathModel, ref: SegmentRef, t: number): { model: PathModel; node: NodeRef } | null {
  const next = clonePath(model), path = next.subpaths[ref.subpath];
  if (!path || ref.segment < 0 || ref.segment >= segmentCount(path)) return null;
  t = Math.min(0.999, Math.max(0.001, t));
  const a = path.nodes[ref.segment], b = path.nodes[(ref.segment + 1) % path.nodes.length];
  let node: PathNode;
  if (!isCurvedSegment(path, ref.segment)) {
    node = { ...lerp(a, b, t), type: "corner" };
  } else {
    const [p0, p1, p2, p3] = segmentCubic(path, ref.segment);
    const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t);
    const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t), s = lerp(r0, r1, t);
    a.out = q0; b.in = q2;
    node = { ...s, type: "corner", in: r0, out: r1 };
    node.type = classifyNode(node) === "corner" ? "corner" : "smooth";
    if (a.type === "auto") a.type = "smooth";
    if (b.type === "auto") b.type = "smooth";
  }
  path.nodes.splice(ref.segment + 1, 0, node);
  return { model: next, node: { subpath: ref.subpath, node: ref.segment + 1 } };
}

/**
 * Deletes a vertex; its neighbours join with a segment keeping their outer handles. A
 * subpath left with one vertex disappears, but the last subpath is never emptied (null).
 */
export function deleteNode(model: PathModel, ref: NodeRef): PathModel | null {
  const next = clonePath(model), path = next.subpaths[ref.subpath];
  if (!path?.nodes[ref.node]) return null;
  const minimum = path.closed ? 3 : 2;
  if (path.nodes.length <= minimum) {
    if (next.subpaths.length === 1) return null;
    next.subpaths.splice(ref.subpath, 1);
    return next;
  }
  path.nodes.splice(ref.node, 1);
  if (!path.closed) {
    path.nodes[0].in = undefined;
    path.nodes[path.nodes.length - 1].out = undefined;
  }
  refreshAuto(path, Math.min(ref.node, path.nodes.length - 1));
  refreshAuto(path, ref.node - 1);
  return next;
}

/** Makes segment `ref` straight (drops its handles; auto ends become corners). */
export function setSegmentStraight(model: PathModel, ref: SegmentRef): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath];
  if (!path || ref.segment < 0 || ref.segment >= segmentCount(path)) return model;
  const a = path.nodes[ref.segment], b = path.nodes[(ref.segment + 1) % path.nodes.length];
  a.out = undefined; b.in = undefined;
  for (const node of [a, b]) if (node.type !== "corner") node.type = "corner";
  return next;
}

/** Makes segment `ref` a curve, with handles a third of the way along it. */
export function setSegmentCurved(model: PathModel, ref: SegmentRef): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath];
  if (!path || ref.segment < 0 || ref.segment >= segmentCount(path)) return model;
  const a = path.nodes[ref.segment], b = path.nodes[(ref.segment + 1) % path.nodes.length];
  if (!a.out) a.out = lerp(a, b, 1 / 3);
  if (!b.in) b.in = lerp(a, b, 2 / 3);
  return next;
}

/** Opens a closed subpath at a vertex: the path then starts and ends there (two vertices). */
export function openPath(model: PathModel, ref: NodeRef): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath];
  if (!path?.closed || !path.nodes[ref.node]) return model;
  const rotated = [...path.nodes.slice(ref.node), ...path.nodes.slice(0, ref.node)];
  const first = rotated[0];
  const end: PathNode = { x: first.x, y: first.y, type: "corner", in: first.in };
  rotated[0] = { ...first, type: "corner", in: undefined };
  next.subpaths[ref.subpath] = { closed: false, nodes: [...rotated, end] };
  return next;
}

/** Opens a closed subpath by removing segment `ref` (Open Path on a segment). */
export function openSegment(model: PathModel, ref: SegmentRef): PathModel {
  const next = clonePath(model), path = next.subpaths[ref.subpath];
  if (!path?.closed || ref.segment < 0 || ref.segment >= path.nodes.length) return model;
  const start = (ref.segment + 1) % path.nodes.length;
  const nodes = [...path.nodes.slice(start), ...path.nodes.slice(0, start)];
  nodes[0] = { ...nodes[0], in: undefined };
  nodes[nodes.length - 1] = { ...nodes[nodes.length - 1], out: undefined };
  next.subpaths[ref.subpath] = { closed: false, nodes };
  return next;
}

/** Closes an open subpath with a straight segment (merging ends that already meet). */
export function closePath(model: PathModel, subpath: number): PathModel {
  const next = clonePath(model), path = next.subpaths[subpath];
  if (!path || path.closed || path.nodes.length < 2) return model;
  path.closed = true;
  const first = path.nodes[0], last = path.nodes[path.nodes.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-3 && path.nodes.length > 2) {
    first.in = last.in;
    path.nodes.pop();
  }
  return next;
}

/** The vertex nearest `point` within `maxDistance`. */
export function nearestNode(model: PathModel, point: PathPoint, maxDistance = Infinity): (NodeRef & { distance: number }) | null {
  let best: (NodeRef & { distance: number }) | null = null;
  model.subpaths.forEach((path, s) => path.nodes.forEach((node, i) => {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { subpath: s, node: i, distance };
  }));
  return best;
}

function closestOnCubic(cubic: Cubic, point: PathPoint): { t: number; point: PathPoint; distance: number } {
  const distanceAt = (t: number) => { const p = cubicAt(cubic, t); return Math.hypot(p.x - point.x, p.y - point.y); };
  const samples = 48;
  let bestT = 0, bestD = Infinity;
  for (let i = 0; i <= samples; i++) { const d = distanceAt(i / samples); if (d < bestD) { bestD = d; bestT = i / samples; } }
  let lo = Math.max(0, bestT - 1 / samples), hi = Math.min(1, bestT + 1 / samples);
  for (let i = 0; i < 30; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (distanceAt(m1) < distanceAt(m2)) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, point: cubicAt(cubic, t), distance: distanceAt(t) };
}

function closestOnLine(a: PathPoint, b: PathPoint, point: PathPoint): { t: number; point: PathPoint; distance: number } {
  const d = sub(b, a), size = d.x * d.x + d.y * d.y;
  const t = size < 1e-12 ? 0 : Math.min(1, Math.max(0, ((point.x - a.x) * d.x + (point.y - a.y) * d.y) / size));
  const at = lerp(a, b, t);
  return { t, point: at, distance: Math.hypot(at.x - point.x, at.y - point.y) };
}

/** The point on the outline nearest `point` within `maxDistance`, with its segment and t. */
export function nearestSegmentPoint(model: PathModel, point: PathPoint, maxDistance = Infinity): (SegmentRef & { t: number; point: PathPoint; distance: number }) | null {
  let best: (SegmentRef & { t: number; point: PathPoint; distance: number }) | null = null;
  model.subpaths.forEach((path, s) => {
    for (let i = 0; i < segmentCount(path); i++) {
      const cubic = segmentCubic(path, i);
      // Straight segments are parameterised linearly, as addNodeOnSegment splits them.
      const hit = isCurvedSegment(path, i) ? closestOnCubic(cubic, point) : closestOnLine(cubic[0], cubic[3], point);
      if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = { subpath: s, segment: i, ...hit };
    }
  });
  return best;
}
