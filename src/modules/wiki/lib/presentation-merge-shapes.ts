/**
 * PowerPoint's Merge Shapes (Union, Combine, Fragment, Intersect, Subtract) on presentation
 * shapes. Each shape's outline is flattened to polygons on the canvas (rotation applied),
 * combined with polygon-clipping, and written back as closed freeforms that keep the
 * primary (first selected) shape's formatting, parent and stacking position.
 *
 * The result's holes are separate subpaths wound opposite to their outer ring (as
 * polygon-clipping returns them), so the renderer's default nonzero fill leaves them open.
 */
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from "polygon-clipping";
import type { PresentationElement } from "./presentation-model";
import { parsePath, flattenPath } from "./presentation-path-model";
import { freeformTransform, shapeLocalPaths, withoutGeometry } from "./presentation-path-freeform";

export type MergeShapesOperation = "union" | "combine" | "fragment" | "intersect" | "subtract";
type Shape = Extract<PresentationElement, { type: "shape" }>;

const MIN_SIZE = 20, MAX_SIZE = 20_000, MAX_D = 60_000;
/** Below this area (pt²) a piece is a sliver left by rounding, not a shape. */
const MIN_AREA = 0.5;

/** The region a shape covers on the canvas, or null when it encloses nothing. */
export function shapeRegion(element: PresentationElement, tolerance = 0.25): MultiPolygon | null {
  if (element.type !== "shape") return null;
  const outline = shapeLocalPaths(element);
  if (!outline?.closed) return null;
  const { toCanvas } = freeformTransform({ ...element, content: { ...element.content, freeform: undefined } });
  // Rings of one path combine even-odd (a donut's hole, an earlier merge's holes);
  // a preset's separately filled paths add up.
  const parts = outline.parts.map((d): MultiPolygon => {
    const rings: Ring[] = flattenPath(parsePath(d), tolerance)
      .map(({ points }) => points.map((p): [number, number] => { const q = toCanvas(p); return [q.x, q.y]; }))
      .filter((ring) => ring.length >= 3 && Math.abs(ringArea(ring)) > 1e-6);
    if (rings.length <= 1) return rings.map((ring) => [ring]);
    return polygonClipping.xor([rings[0]], ...rings.slice(1).map((ring): Polygon => [ring]));
  }).filter((part) => part.length);
  if (!parts.length) return null;
  const region = parts.length === 1 ? parts[0] : polygonClipping.union(parts[0], ...parts.slice(1));
  return area(region) > MIN_AREA ? region : null;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** The area a multipolygon covers (outer rings minus holes). */
export function area(region: MultiPolygon): number {
  return region.reduce((total, polygon) => total + polygon.reduce((sum, ring, index) => sum + (index === 0 ? 1 : -1) * Math.abs(ringArea(ring)), 0), 0);
}

const isEmpty = (region: MultiPolygon) => area(region) <= MIN_AREA;

/** The pieces Fragment produces: every overlap and every non-overlapping remainder. */
function fragments(regions: MultiPolygon[]): MultiPolygon[] {
  let pieces: MultiPolygon[] = [];
  for (const region of regions) {
    const next: MultiPolygon[] = [];
    for (const piece of pieces) {
      next.push(polygonClipping.intersection(piece, region), polygonClipping.difference(piece, region));
    }
    next.push(pieces.length ? polygonClipping.difference(region, ...pieces) : region);
    pieces = next.filter((piece) => !isEmpty(piece));
  }
  // Each separate polygon of a piece is its own shape.
  return pieces.flatMap((piece) => piece.map((polygon): MultiPolygon => [polygon])).filter((piece) => !isEmpty(piece));
}

function combine(regions: MultiPolygon[], op: Exclude<MergeShapesOperation, "fragment">): MultiPolygon {
  const [first, ...rest] = regions;
  switch (op) {
    case "union": return polygonClipping.union(first, ...rest);
    case "combine": return polygonClipping.xor(first, ...rest);
    case "intersect": return polygonClipping.intersection(first, ...rest);
    case "subtract": return polygonClipping.difference(first, ...rest);
  }
}

const num = (value: number) => String(Math.round(value * 100) / 100);

/** A closed freeform shape drawing `region`, formatted like `primary`. */
function regionShape(region: MultiPolygon, primary: Shape, id: string): Shape | null {
  const points = region.flat(2);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const width = Math.max(MIN_SIZE, Math.max(...xs) - minX), height = Math.max(MIN_SIZE, Math.max(...ys) - minY);
  if (width > MAX_SIZE || height > MAX_SIZE) return null;
  const d = region.flat().map((ring) => {
    // polygon-clipping closes each ring by repeating its first point; Z does that here.
    const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    return `M${open.map(([x, y]) => `${num(x - minX)} ${num(y - minY)}`).join(" L")} Z`;
  }).join(" ");
  if (d.length > MAX_D) return null;
  const content = withoutGeometry(primary.content, ["preset", "adjustments", "adjust", "cornerRadius", "freeform", "connection", "route", "points", "startHead", "endHead"]);
  return { ...primary, id, x: minX, y: minY, width, height, rotation: 0, content: { ...content, shape: "rect", freeform: { d, w: width, h: height, closed: true } } };
}

/**
 * Merges the shapes `orderedIds` names (first = primary) with `op`. Returns the new element
 * list, the results taking the primary's place, and the created ids; null when fewer than
 * two of them enclose an area or the result is empty. Lines, connectors, open freeforms and
 * other element types in the selection are left alone.
 */
export function mergeShapes(elements: PresentationElement[], orderedIds: string[], op: MergeShapesOperation, createId: () => string): { elements: PresentationElement[]; created: string[] } | null {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const inputs: { element: Shape; region: MultiPolygon }[] = [];
  for (const id of new Set(orderedIds)) {
    const element = byId.get(id);
    if (element?.type !== "shape") continue;
    const region = shapeRegion(element);
    if (region) inputs.push({ element, region });
  }
  if (inputs.length < 2) return null;
  const primary = inputs[0].element;
  // A very detailed result retries with coarser curves to fit the freeform path limit.
  for (const tolerance of [0.25, 1, 4]) {
    const regions = tolerance === 0.25 ? inputs.map((input) => input.region) : inputs.map((input) => shapeRegion(input.element, tolerance)!);
    const pieces = op === "fragment" ? fragments(regions) : [combine(regions, op)].filter((region) => !isEmpty(region));
    if (!pieces.length) return null;
    const shapes = pieces.map((piece) => regionShape(piece, primary, createId()));
    if (shapes.some((shape) => !shape)) continue;
    const removed = new Set(inputs.map((input) => input.element.id));
    const index = elements.findIndex((element) => element.id === primary.id);
    const before = elements.slice(0, index).filter((element) => !removed.has(element.id));
    const after = elements.slice(index + 1).filter((element) => !removed.has(element.id));
    const created = shapes as Shape[];
    return { elements: [...before, ...created, ...after], created: created.map((shape) => shape.id) };
  }
  return null;
}

