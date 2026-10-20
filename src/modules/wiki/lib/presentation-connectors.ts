/**
 * Connectors, PowerPoint style: either end of a line can be glued to a shape -- at one of its
 * four connection sites or, without a site, where the line meets its outline -- or left free
 * at a point. The route between the ends is straight, elbow (orthogonal) or curved.
 */
import type { PresentationElement } from "./presentation";

type Point = { x: number; y: number };
export type ConnectionSite = "top" | "right" | "bottom" | "left";
export type ConnectorRoute = "straight" | "elbow" | "curve";
export const connectionSites: ConnectionSite[] = ["top", "right", "bottom", "left"];

const SITE_DIRECTION: Record<ConnectionSite, Point> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
/** Room around a routed connector's path for its stroke and arrowheads. */
export const CONNECTOR_PADDING = 24;

const centre = (element: PresentationElement): Point => ({ x: element.x + element.width / 2, y: element.y + element.height / 2 });
const rotate = (point: Point, degrees: number): Point => {
  const angle = degrees * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
};

/** A connection site on the element's rotated box, in canvas coordinates. */
export function sitePoint(element: PresentationElement, site: ConnectionSite): Point {
  const direction = SITE_DIRECTION[site], c = centre(element);
  const local = rotate({ x: direction.x * element.width / 2, y: direction.y * element.height / 2 }, element.rotation);
  return { x: c.x + local.x, y: c.y + local.y };
}

/** The direction a site faces, rotated with its element. */
export function siteDirection(element: PresentationElement, site: ConnectionSite): Point {
  return rotate(SITE_DIRECTION[site], element.rotation);
}

/** The site closest to a canvas point -- where a dropped line end glues. */
export function nearestSite(element: PresentationElement, point: Point): ConnectionSite {
  return connectionSites.reduce((best, site) => {
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
