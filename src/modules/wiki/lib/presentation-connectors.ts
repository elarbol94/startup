/**
 * Connectors, PowerPoint style: either end of a line can be glued to a shape -- at one of its
 * four connection sites or, without a site, where the line meets its outline -- or left free
 * at a point. The route between the ends is straight, elbow (orthogonal) or curved.
 */
import type { PresentationElement } from "./presentation-model";
import { presetConnectionSites } from "./preset-shapes/preset-geometry";

type Point = { x: number; y: number };
type Side = "top" | "right" | "bottom" | "left";
/** A side of the box, or the index of one of a preset shape's own connection sites. */
export type ConnectionSite = Side | number;
export type ConnectorRoute = "straight" | "elbow" | "curve";
const sides: Side[] = ["top", "right", "bottom", "left"];

/** A preset shape's own connection sites in its unrotated box, as PowerPoint offers them. */
function presetSites(element: PresentationElement) {
  return element.type === "shape" && element.content.preset ? presetConnectionSites(element.content.preset, element.width, element.height, element.content.adjustments) : [];
}

/** The sites a line end can glue to on `element`: a preset's own, or the four sides. */
export function connectionSites(element: PresentationElement): ConnectionSite[] {
  const own = presetSites(element);
  return own.length ? own.map((_, index) => index) : sides;
}

const SITE_DIRECTION: Record<Side, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
/** Room around a routed connector's path for its stroke and arrowheads. */
export const CONNECTOR_PADDING = 24;

const centre = (element: PresentationElement): Point => ({ x: element.x + element.width / 2, y: element.y + element.height / 2 });
const rotate = (point: Point, degrees: number): Point => {
  const angle = degrees * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
};

/** A connection site on the element's rotated box, in canvas coordinates. */
export function sitePoint(element: PresentationElement, site: ConnectionSite): Point {
  const c = centre(element);
  if (typeof site === "number") {
    const own = presetSites(element)[site];
    if (!own) return c;
    const local = rotate({ x: own.x - element.width / 2, y: own.y - element.height / 2 }, element.rotation);
    return { x: c.x + local.x, y: c.y + local.y };
  }
  const direction = SITE_DIRECTION[site];
  const local = rotate({ x: direction.x * element.width / 2, y: direction.y * element.height / 2 }, element.rotation);
  return { x: c.x + local.x, y: c.y + local.y };
}

/** The direction a site faces, rotated with its element. */
export function siteDirection(element: PresentationElement, site: ConnectionSite): Point {
  if (typeof site === "number") {
    // DrawingML gives each site the angle a connector leaves it at.
    const angle = (presetSites(element)[site]?.angle ?? 0) * Math.PI / 180;
    return rotate({ x: Math.cos(angle), y: Math.sin(angle) }, element.rotation);
  }
  return rotate(SITE_DIRECTION[site], element.rotation);
}

/** The site closest to a canvas point -- where a dropped line end glues. */
export function nearestSite(element: PresentationElement, point: Point): ConnectionSite {
  return connectionSites(element).reduce((best, site) => {
    const p = sitePoint(element, site), q = sitePoint(element, best);
    return Math.hypot(p.x - point.x, p.y - point.y) < Math.hypot(q.x - point.x, q.y - point.y) ? site : best;
  });
}

/** Where a straight line towards `toward` leaves the element's outline (ellipses included). */
export function outlinePoint(element: PresentationElement, toward: Point): Point {
  const c = centre(element);
  const local = rotate({ x: toward.x - c.x, y: toward.y - c.y }, -element.rotation);
  const ellipse = (element.type === "frame" && element.content.shape === "circle") || (element.type === "shape" && element.content.shape === "ellipse");
  const denominator = ellipse
    ? Math.hypot(local.x / (element.width / 2), local.y / (element.height / 2))
    : Math.max(Math.abs(local.x) / (element.width / 2), Math.abs(local.y) / (element.height / 2));
  if (!denominator) return c;
  const edge = rotate({ x: local.x / denominator, y: local.y / denominator }, element.rotation);
  return { x: c.x + edge.x, y: c.y + edge.y };
}

/** The site of `element` that faces `toward` best, for elbows and curves without an explicit site. */
export function facingSite(element: PresentationElement, toward: Point): ConnectionSite {
  const c = centre(element);
  const local = rotate({ x: toward.x - c.x, y: toward.y - c.y }, -element.rotation);
  return Math.abs(local.x) / element.width >= Math.abs(local.y) / element.height ? (local.x >= 0 ? "right" : "left") : (local.y >= 0 ? "bottom" : "top");
}

export type ConnectorEnd = { element?: PresentationElement; site?: ConnectionSite; point?: Point };

/**
 * The path of a connector in canvas coordinates. Straight: its two ends. Elbow: orthogonal
 * corners between them. Curve: a cubic Bézier as [start, control, control, end].
 */
export function routeConnector(from: ConnectorEnd, to: ConnectorEnd, route: ConnectorRoute): { points: Point[]; fromDirection?: Point; toDirection?: Point } {
  const anchor = (end: ConnectorEnd) => end.element ? centre(end.element) : end.point ?? { x: 0, y: 0 };
  const resolve = (end: ConnectorEnd, other: ConnectorEnd): { point: Point; direction?: Point } => {
    if (!end.element) return { point: end.point ?? { x: 0, y: 0 } };
    if (end.site) return { point: sitePoint(end.element, end.site), direction: siteDirection(end.element, end.site) };
    if (route === "straight") return { point: outlinePoint(end.element, anchor(other)) };
    const site = facingSite(end.element, anchor(other));
    return { point: sitePoint(end.element, site), direction: siteDirection(end.element, site) };
  };
  const a = resolve(from, to), b = resolve(to, from);
  if (route === "straight") return { points: [a.point, b.point] };
  // A free end leaves along the line towards the other end.
  const towards = (p: Point, q: Point) => { const d = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / d, y: (q.y - p.y) / d }; };
  const da = a.direction ?? towards(a.point, b.point), db = b.direction ?? towards(b.point, a.point);
  if (route === "curve") {
    const reach = Math.max(40, Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y) / 3);
    return { points: [a.point, { x: a.point.x + da.x * reach, y: a.point.y + da.y * reach }, { x: b.point.x + db.x * reach, y: b.point.y + db.y * reach }, b.point], fromDirection: da, toDirection: db };
  }
  const horizontal = (d: Point) => Math.abs(d.x) >= Math.abs(d.y);
  const p = a.point, q = b.point;
  let corners: Point[];
  if (horizontal(da) && horizontal(db)) { const mx = (p.x + q.x) / 2; corners = [{ x: mx, y: p.y }, { x: mx, y: q.y }]; }
  else if (!horizontal(da) && !horizontal(db)) { const my = (p.y + q.y) / 2; corners = [{ x: p.x, y: my }, { x: q.x, y: my }]; }
  else if (horizontal(da)) corners = [{ x: q.x, y: p.y }];
  else corners = [{ x: p.x, y: q.y }];
  const points = [p, ...corners, q].filter((point, index, all) => index === 0 || point.x !== all[index - 1].x || point.y !== all[index - 1].y);
  return { points, fromDirection: da, toDirection: db };
}

/** The box a routed (elbow/curve) connector occupies, with its path relative to that box. */
export function connectorBox(points: Point[]): { x: number; y: number; width: number; height: number; local: Point[] } {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs) - CONNECTOR_PADDING, y = Math.min(...ys) - CONNECTOR_PADDING;
  const width = Math.min(20_000, Math.max(20, Math.max(...xs) - x + CONNECTOR_PADDING));
  const height = Math.min(20_000, Math.max(20, Math.max(...ys) - y + CONNECTOR_PADDING));
  const round = (value: number) => Math.round(value * 100) / 100;
  return { x, y, width, height, local: points.map((p) => ({ x: round(p.x - x), y: round(p.y - y) })) };
}

export type PresentationConnection = NonNullable<Extract<PresentationElement, { type: "shape" }>["content"]["connection"]>;

/**
 * A connection carried over to copies: glued ids go through `map` (undefined: that element was
 * not copied, so the copy cannot keep the connection), free points move by `shift`.
 */
export function remapConnection(connection: PresentationConnection, map: (id: string) => string | undefined, shift: Point): PresentationConnection | undefined {
  const fromId = connection.fromId === undefined ? undefined : map(connection.fromId);
  const toId = connection.toId === undefined ? undefined : map(connection.toId);
  if ((connection.fromId && !fromId) || (connection.toId && !toId)) return undefined;
  const move = (point?: Point) => point && { x: point.x + shift.x, y: point.y + shift.y };
  return { ...connection, fromId, toId, from: move(connection.from), to: move(connection.to) };
}

type ShapeElement = Extract<PresentationElement, { type: "shape" }>;
const LINEAR = new Set(["line", "arrow", "doubleArrow"]);
/** Height of the box a straight line is drawn in; its length is the width. */
export const STRAIGHT_LINE_HEIGHT = 20;

/** A line's two ends in canvas coordinates: its routed path's ends, or its rotated box's. */
export function lineEnds(element: ShapeElement): [Point, Point] {
  const points = element.content.points;
  if (points && element.content.route && element.content.route !== "straight") {
    const first = points[0], last = points[points.length - 1];
    return [{ x: element.x + first.x, y: element.y + first.y }, { x: element.x + last.x, y: element.y + last.y }];
  }
  const angle = element.rotation * Math.PI / 180, dx = Math.cos(angle) * element.width / 2, dy = Math.sin(angle) * element.width / 2;
  const c = centre(element);
  return [{ x: c.x - dx, y: c.y - dy }, { x: c.x + dx, y: c.y + dy }];
}

/** Places a line along `points`: straight lines as a rotated box, routed ones in a padded box. */
export function placeLine(element: ShapeElement, points: Point[], route: ConnectorRoute): ShapeElement {
  if (route === "straight") {
    const [a, b] = [points[0], points[points.length - 1]];
    const width = Math.min(20_000, Math.max(20, Math.hypot(b.x - a.x, b.y - a.y)));
    return { ...element, x: (a.x + b.x) / 2 - width / 2, y: (a.y + b.y) / 2 - STRAIGHT_LINE_HEIGHT / 2, width, height: STRAIGHT_LINE_HEIGHT,
      rotation: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, content: { ...element.content, points: undefined } };
  }
  const box = connectorBox(points);
  return { ...element, x: box.x, y: box.y, width: box.width, height: box.height, rotation: 0, content: { ...element.content, points: box.local } };
}

const sameGeometry = (a: ShapeElement, b: ShapeElement) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  && a.rotation === b.rotation && JSON.stringify(a.content.points) === JSON.stringify(b.content.points) && JSON.stringify(a.content.connection) === JSON.stringify(b.content.connection);

/**
 * Re-derives a line's geometry from what it is glued to, in the same undo step as the edit
 * that moved those elements. A glued element that disappeared (or became a connector) leaves
 * that end free where it was; with no glued end left the line is an ordinary line again.
 */
export function layoutConnector(element: ShapeElement, byId: Map<string, PresentationElement>): ShapeElement {
  const connection = element.content.connection;
  if (!connection) return element;
  if (!LINEAR.has(element.content.shape)) return { ...element, content: { ...element.content, connection: undefined } };
  const ends = lineEnds(element);
  const glue = (id: string | undefined) => {
    const target = id === undefined ? undefined : byId.get(id);
    return target && target.id !== element.id && !(target.type === "shape" && target.content.connection) ? target : undefined;
  };
  const from = glue(connection.fromId);
  let to = glue(connection.toId);
  if (from && to && from.id === to.id) to = undefined;
  if (!from && !to) {
    return { ...element, content: { ...element.content, connection: undefined } };
  }
  const next: PresentationConnection = {
    ...connection,
    fromId: from?.id, fromSite: from ? connection.fromSite : undefined, from: from ? undefined : connection.from ?? ends[0],
    toId: to?.id, toSite: to ? connection.toSite : undefined, to: to ? undefined : connection.to ?? ends[1],
  };
  const route = element.content.route ?? "straight";
  const { points } = routeConnector({ element: from, site: next.fromSite, point: next.from }, { element: to, site: next.toSite, point: next.to }, route);
  const placed = placeLine({ ...element, content: { ...element.content, connection: next } }, points, route);
  return sameGeometry(placed, element) ? element : placed;
}

export type LineEndTarget = { element: PresentationElement; site: ConnectionSite } | { point: Point };

/**
 * A line end dropped somewhere: on an element it glues there at `site`, elsewhere it stays
 * free at the point. The other end keeps what it had. A line with no glued end left is an
 * ordinary line again, drawn along its route between the two points.
 */
export function setLineEnd(element: ShapeElement, end: 0 | 1, target: LineEndTarget, byId: Map<string, PresentationElement>): ShapeElement {
  const ends = lineEnds(element);
  const route = element.content.route ?? "straight";
  const glued = "element" in target;
  const current: Partial<PresentationConnection> = element.content.connection ?? {};
  const next: Partial<PresentationConnection> = end === 0
    ? { ...current, fromId: glued ? target.element.id : undefined, fromSite: glued ? target.site : undefined, from: glued ? undefined : target.point }
    : { ...current, toId: glued ? target.element.id : undefined, toSite: glued ? target.site : undefined, to: glued ? undefined : target.point };
  if (!next.fromId && !next.from) next.from = ends[0];
  if (!next.toId && !next.to) next.to = ends[1];
  if (!next.fromId && !next.toId) {
    const loose = { ...element, content: { ...element.content, connection: undefined } };
    return placeLine(loose, routeConnector({ point: next.from }, { point: next.to }, route).points, route);
  }
  return layoutConnector({ ...element, content: { ...element.content, connection: next as PresentationConnection } }, byId);
}

/** Switches a line between straight, elbow and curved, keeping where its ends are. */
export function setLineRoute(element: ShapeElement, route: ConnectorRoute, byId: Map<string, PresentationElement>): ShapeElement {
  const next = { ...element, content: { ...element.content, route: route === "straight" ? undefined : route } };
  if (element.content.connection) return layoutConnector(next, byId);
  const [a, b] = lineEnds(element);
  return placeLine(next, routeConnector({ point: a }, { point: b }, route).points, route);
}
