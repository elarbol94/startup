/**
 * An SVG path as PowerPoint's Edit Points sees it: subpaths of vertices joined by straight
 * or cubic Bézier segments. Every SVG command (M L H V C S Q T A Z, absolute and relative)
 * parses into this model; quadratics and arcs become cubics. Used by Edit Points
 * (presentation-path-edit) and Merge Shapes (presentation-merge-shapes).
 */

export type PathPoint = { x: number; y: number };
/** PowerPoint's vertex kinds: Auto keeps computed handles, the others keep the user's. */
export type PathNodeType = "auto" | "smooth" | "straight" | "corner";
/** A vertex: `in` is the control point of the segment arriving here, `out` of the one leaving. */
export type PathNode = PathPoint & { type: PathNodeType; in?: PathPoint; out?: PathPoint };
export type Subpath = { closed: boolean; nodes: PathNode[] };
export type PathModel = { subpaths: Subpath[] };
/** A cubic segment's four points; a straight segment has its controls on its ends. */
export type Cubic = [PathPoint, PathPoint, PathPoint, PathPoint];

const EPSILON = 1e-6;
const same = (a: PathPoint, b: PathPoint, tolerance = 1e-3) => Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
const pt = (x: number, y: number): PathPoint => ({ x, y });

/**
 * The type a parsed vertex gets from its handles: collinear handles of equal length make a
 * smooth point, collinear ones of different lengths a straight point, anything else a corner.
 */
export function classifyNode(node: PathNode): PathNodeType {
  if (!node.in || !node.out) return "corner";
  const ax = node.in.x - node.x, ay = node.in.y - node.y, bx = node.out.x - node.x, by = node.out.y - node.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < EPSILON || lb < EPSILON) return "corner";
  const cross = (ax * by - ay * bx) / (la * lb), dot = (ax * bx + ay * by) / (la * lb);
  if (Math.abs(cross) > 0.01 || dot > 0) return "corner";
  return Math.abs(la - lb) <= Math.max(la, lb) * 0.01 ? "smooth" : "straight";
}

/** Splits a path string into commands and their numbers (handles "1.5.5", "1e-3", "-1-2"). */
function tokenize(d: string): { command: string; args: number[] }[] {
  const out: { command: string; args: number[] }[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    if (match[1]) out.push({ command: match[1], args: [] });
    else if (out.length) out[out.length - 1].args.push(Number(match[2]));
  }
  return out;
}

/** Cubic Béziers for an SVG elliptical arc (SVG 1.1 F.6.5), as [c1, c2, end] triples. */
export function arcToCubics(from: PathPoint, rx: number, ry: number, rotationDeg: number, largeArc: boolean, sweep: boolean, to: PathPoint): [PathPoint, PathPoint, PathPoint][] {
  if (same(from, to, EPSILON)) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx < EPSILON || ry < EPSILON) return [[from, to, to]];
  const phi = rotationDeg * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = factor * (rx * y1) / ry, cyp = -factor * (ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from.x + to.x) / 2, cy = sin * cxp + cos * cyp + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count, k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number) => pt(cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos);
  const derivative = (t: number) => pt(-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos);
  const result: [PathPoint, PathPoint, PathPoint][] = [];
  for (let i = 0; i < count; i++) {
    const t0 = theta1 + i * step, t1 = t0 + step;
    const p0 = at(t0), p3 = i === count - 1 ? to : at(t1), d0 = derivative(t0), d1 = derivative(t1);
    result.push([pt(p0.x + k * d0.x, p0.y + k * d0.y), pt(p3.x - k * d1.x, p3.y - k * d1.y), p3]);
  }
  return result;
}

/** Parses an SVG path string into subpaths of vertices with cubic handles. */
export function parsePath(d: string): PathModel {
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let cursor = pt(0, 0), start = pt(0, 0);
  let lastCubic: PathPoint | null = null, lastQuad: PathPoint | null = null;

  const begin = (p: PathPoint) => { current = { closed: false, nodes: [{ ...p, type: "corner" }] }; subpaths.push(current); start = p; };
  const ensure = () => { if (!current || current.closed) begin(cursor); return current!; };
  const lineTo = (p: PathPoint) => { ensure().nodes.push({ ...p, type: "corner" }); cursor = p; };
  const cubicTo = (c1: PathPoint, c2: PathPoint, p: PathPoint) => {
    const sub = ensure();
    sub.nodes[sub.nodes.length - 1].out = c1;
    sub.nodes.push({ ...p, type: "corner", in: c2 });
    cursor = p;
  };

  for (const { command, args } of tokenize(d)) {
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const ox = () => (relative ? cursor.x : 0), oy = () => (relative ? cursor.y : 0);
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[upper] ?? 0;
    if (upper === "Z") {
      const sub = current as Subpath | null;
      if (sub && !sub.closed) closeSubpath(sub);
      cursor = start; lastCubic = lastQuad = null;
      continue;
    }
    for (let i = 0; i + arity <= args.length; i += arity) {
      const a = args.slice(i, i + arity);
      let nextCubic: PathPoint | null = null, nextQuad: PathPoint | null = null;
      if (upper === "M") {
        const p = pt(a[0] + ox(), a[1] + oy());
        if (i === 0) { begin(p); cursor = p; } else lineTo(p);
      } else if (upper === "L") lineTo(pt(a[0] + ox(), a[1] + oy()));
      else if (upper === "H") lineTo(pt(a[0] + ox(), cursor.y));
      else if (upper === "V") lineTo(pt(cursor.x, a[0] + oy()));
      else if (upper === "C") {
        const c1 = pt(a[0] + ox(), a[1] + oy()), c2 = pt(a[2] + ox(), a[3] + oy()), p = pt(a[4] + ox(), a[5] + oy());
        cubicTo(c1, c2, p); nextCubic = c2;
      } else if (upper === "S") {
        const c1 = lastCubic ? pt(2 * cursor.x - lastCubic.x, 2 * cursor.y - lastCubic.y) : cursor;
        const c2 = pt(a[0] + ox(), a[1] + oy()), p = pt(a[2] + ox(), a[3] + oy());
        cubicTo(c1, c2, p); nextCubic = c2;
      } else if (upper === "Q" || upper === "T") {
        const q: PathPoint = upper === "Q" ? pt(a[0] + ox(), a[1] + oy()) : lastQuad ? pt(2 * cursor.x - lastQuad.x, 2 * cursor.y - lastQuad.y) : cursor;
        const p = upper === "Q" ? pt(a[2] + ox(), a[3] + oy()) : pt(a[0] + ox(), a[1] + oy());
        const from = cursor;
        cubicTo(pt(from.x + (2 / 3) * (q.x - from.x), from.y + (2 / 3) * (q.y - from.y)), pt(p.x + (2 / 3) * (q.x - p.x), p.y + (2 / 3) * (q.y - p.y)), p);
        nextQuad = q;
      } else if (upper === "A") {
        const p = pt(a[5] + ox(), a[6] + oy());
        for (const [c1, c2, end] of arcToCubics(cursor, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, p)) cubicTo(c1, c2, end);
        cursor = p;
      }
      lastCubic = nextCubic; lastQuad = nextQuad;
    }
  }
  for (const sub of subpaths) for (const node of sub.nodes) node.type = classifyNode(node);
  return { subpaths: subpaths.filter((sub) => sub.nodes.length > 0) };
}

/** Closes a subpath; a last vertex on top of the first merges into it. */
function closeSubpath(sub: Subpath) {
  sub.closed = true;
  const first = sub.nodes[0], last = sub.nodes[sub.nodes.length - 1];
  if (sub.nodes.length > 1 && same(first, last)) {
    if (last.in) first.in = last.in;
    sub.nodes.pop();
  }
}

const num = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};
const coords = (p: PathPoint) => `${num(p.x)} ${num(p.y)}`;

/** The four points of segment `index` of a subpath (segment i runs from node i to node i+1). */
export function segmentCubic(sub: Subpath, index: number): Cubic {
  const a = sub.nodes[index], b = sub.nodes[(index + 1) % sub.nodes.length];
  return [pt(a.x, a.y), a.out ?? pt(a.x, a.y), b.in ?? pt(b.x, b.y), pt(b.x, b.y)];
}
export const segmentCount = (sub: Subpath) => (sub.closed ? sub.nodes.length : Math.max(0, sub.nodes.length - 1));
/** Whether segment `index` is curved (either end has a handle). */
export function isCurvedSegment(sub: Subpath, index: number) {
  const a = sub.nodes[index], b = sub.nodes[(index + 1) % sub.nodes.length];
  return Boolean(a.out || b.in);
}

/** The model as an SVG path string: L for straight segments, C for curves, Z when closed. */
export function serializePath(model: PathModel): string {
  const parts: string[] = [];
  for (const sub of model.subpaths) {
    if (!sub.nodes.length) continue;
    parts.push(`M${coords(sub.nodes[0])}`);
    const count = segmentCount(sub);
    for (let i = 0; i < count; i++) {
      const [, c1, c2, end] = segmentCubic(sub, i);
      const closing = sub.closed && i === count - 1;
      if (isCurvedSegment(sub, i)) parts.push(`C${coords(c1)} ${coords(c2)} ${coords(end)}`);
      else if (!closing) parts.push(`L${coords(end)}`);
    }
    if (sub.closed) parts.push("Z");
  }
  return parts.join(" ");
}

export const cubicAt = ([p0, p1, p2, p3]: Cubic, t: number): PathPoint => {
  const u = 1 - t;
  return pt(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y);
};

/** Points along a cubic within `tolerance` of the curve (Wang's formula), excluding its start. */
export function flattenCubic(cubic: Cubic, tolerance: number): PathPoint[] {
  const [p0, p1, p2, p3] = cubic;
  const dd = Math.max(Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y), Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y));
  const steps = Math.min(512, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tolerance))));
  return Array.from({ length: steps }, (_, i) => (i === steps - 1 ? pt(p3.x, p3.y) : cubicAt(cubic, (i + 1) / steps)));
}

/** Each subpath as a polyline (closed ones without repeating their first point). */
export function flattenPath(model: PathModel, tolerance = 0.25): { closed: boolean; points: PathPoint[] }[] {
  return model.subpaths.filter((sub) => sub.nodes.length).map((sub) => {
    const points: PathPoint[] = [pt(sub.nodes[0].x, sub.nodes[0].y)];
    const count = segmentCount(sub);
    for (let i = 0; i < count; i++) {
      const cubic = segmentCubic(sub, i);
      points.push(...(isCurvedSegment(sub, i) ? flattenCubic(cubic, tolerance) : [cubic[3]]));
    }
    if (sub.closed && points.length > 1 && same(points[0], points[points.length - 1], 1e-9)) points.pop();
    return { closed: sub.closed, points };
  });
}

/** Tight bounds of the drawn path (curve extremes, not the handles). */
export function pathBounds(model: PathModel): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (p: PathPoint) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
  for (const sub of model.subpaths) {
    sub.nodes.forEach(add);
    for (let i = 0; i < segmentCount(sub); i++) if (isCurvedSegment(sub, i)) {
      const cubic = segmentCubic(sub, i);
      for (const t of cubicExtrema(cubic)) add(cubicAt(cubic, t));
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Parameters in (0, 1) where a cubic's x or y derivative is zero. */
function cubicExtrema([p0, p1, p2, p3]: Cubic): number[] {
  const ts: number[] = [];
  for (const axis of ["x", "y"] as const) {
    const a = -p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis], b = 2 * (p0[axis] - 2 * p1[axis] + p2[axis]), c = p1[axis] - p0[axis];
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-c / b); continue; }
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    ts.push((-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a));
  }
  return ts.filter((t) => t > 0 && t < 1);
}

/** A deep copy, so operations never mutate the model a React state holds. */
export const clonePath = (model: PathModel): PathModel => ({
  subpaths: model.subpaths.map((sub) => ({ closed: sub.closed, nodes: sub.nodes.map((node) => ({ ...node, in: node.in && { ...node.in }, out: node.out && { ...node.out } })) })),
});

/** Applies `map` to every vertex and handle (scaling, translating, rotating a path). */
export function mapPath(model: PathModel, map: (p: PathPoint) => PathPoint): PathModel {
  return {
    subpaths: model.subpaths.map((sub) => ({
      closed: sub.closed,
      nodes: sub.nodes.map((node) => ({ ...map(node), type: node.type, in: node.in && map(node.in), out: node.out && map(node.out) })),
    })),
  };
}
