/**
 * Shapes as freeform paths: the outline any closed shape draws in its own box, converting a
 * preset or older shape kind to an editable freeform (PowerPoint does this on Edit Points),
 * mapping freeform coordinates to the canvas, and refitting the box after the path changed.
 */
import type { PresentationElement } from "./presentation-model";
import { isPresetShape, presetPaths } from "./preset-shapes/preset-geometry";
import { shapeOutlinePath } from "./presentation-shape-geometry";
import { mapPath, parsePath, pathBounds, serializePath, type PathModel, type PathPoint } from "./presentation-path-model";

type Shape = Extract<PresentationElement, { type: "shape" }>;
const LINEAR_KINDS = new Set(["line", "arrow", "doubleArrow"]);
/** The schema's limits on an element's box and a freeform's path. */
const MIN_SIZE = 20, MAX_SIZE = 20_000, MAX_D = 60_000;

/** Whether a shape is a line or connector, which Edit Points and Merge Shapes leave alone. */
export const isLineLike = (element: Shape) => LINEAR_KINDS.has(element.content.shape) || Boolean(element.content.connection);

const ellipsePath = (w: number, h: number) =>
  `M${w / 2} 0 A${w / 2} ${h / 2} 0 0 1 ${w} ${h / 2} A${w / 2} ${h / 2} 0 0 1 ${w / 2} ${h} A${w / 2} ${h / 2} 0 0 1 0 ${h / 2} A${w / 2} ${h / 2} 0 0 1 ${w / 2} 0 Z`;
const roundedRectPath = (w: number, h: number, r: number) => r <= 0 ? `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`
  : `M${r} 0 L${w - r} 0 A${r} ${r} 0 0 1 ${w} ${r} L${w} ${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} L${r} ${h} A${r} ${r} 0 0 1 0 ${h - r} L0 ${r} A${r} ${r} 0 0 1 ${r} 0 Z`;

/**
 * The outline a shape draws, in its own unrotated width × height box. Presets give their
 * filled paths (their stroke-only detail paths when nothing is filled); older kinds are
 * drawn without the stroke inset. Null for lines and connectors.
 */
export function shapeLocalPath(element: Shape): { d: string; closed: boolean } | null {
  const outline = shapeLocalPaths(element);
  return outline && { d: outline.parts.join(" "), closed: outline.closed };
}

/** Like `shapeLocalPath`, keeping a preset's separately filled paths apart. */
export function shapeLocalPaths(element: Shape): { parts: string[]; closed: boolean } | null {
  const one = (outline: { d: string; closed: boolean } | null) => outline && { parts: [outline.d], closed: outline.closed };
  if (isLineLike(element)) return null;
  const c = element.content, w = element.width, h = element.height;
  if (c.freeform) {
    const f = c.freeform, sx = w / f.w, sy = h / f.h;
    return one({ d: serializePath(mapPath(parsePath(f.d), (p) => ({ x: p.x * sx, y: p.y * sy }))), closed: f.closed });
  }
  if (c.preset && isPresetShape(c.preset)) {
    const paths = presetPaths(c.preset, w, h, c.adjustments);
    const filled = paths.filter((path) => path.fill !== "none");
    const chosen = filled.length ? filled : paths;
    return chosen.length ? { parts: chosen.map((path) => path.d), closed: filled.length > 0 } : null;
  }
  switch (c.shape) {
    case "rect": return one({ d: roundedRectPath(w, h, 0), closed: true });
    case "roundedRect": return one({ d: roundedRectPath(w, h, Math.min(c.cornerRadius ?? 20, w / 2, h / 2)), closed: true });
    case "ellipse": return one({ d: ellipsePath(w, h), closed: true });
    case "triangle": return one({ d: `M${w / 2} 0 L${w} ${h} L0 ${h} Z`, closed: true });
    case "diamond": return one({ d: `M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`, closed: true });
    default: {
      const d = shapeOutlinePath(c.shape, w, h, 0, c.adjust);
      return one(d ? { d, closed: true } : null);
    }
  }
}

/** A shape's content without the geometry fields named (they no longer apply to a freeform). */
export function withoutGeometry<K extends keyof Shape["content"]>(content: Shape["content"], keys: K[]): Omit<Shape["content"], K> {
  const copy: Partial<Shape["content"]> = { ...content };
  for (const key of keys) delete copy[key];
  return copy as Omit<Shape["content"], K>;
}

/** The shape as a freeform in its own box (unchanged when it already is one); null for lines. */
export function toEditableFreeform(element: Shape): Shape | null {
  if (element.content.freeform) return element;
  const outline = shapeLocalPath(element);
  // Only absolute M/L/C/Z: arcs become cubics, which the renderer can scale number by number.
  const d = outline && serializePath(parsePath(outline.d));
  if (!outline || !d || d.length > MAX_D) return null;
  const content = withoutGeometry(element.content, ["preset", "adjustments", "adjust", "cornerRadius"]);
  return { ...element, content: { ...content, shape: "rect", freeform: { d, w: element.width, h: element.height, closed: outline.closed } } };
}

/** The freeform's path in its own w × h coordinates. */
export function freeformPathModel(element: Shape): PathModel | null {
  return element.content.freeform ? parsePath(element.content.freeform.d) : null;
}

/**
 * Maps freeform coordinates to canvas coordinates and back: scaled from the freeform's
 * w × h to the element's box, then rotated about the box centre.
 */
export function freeformTransform(element: Shape) {
  const f = element.content.freeform ?? { w: element.width, h: element.height };
  const sx = element.width / f.w, sy = element.height / f.h;
  const angle = (element.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  return {
    scaleX: sx, scaleY: sy,
    toCanvas(p: PathPoint): PathPoint {
      const lx = p.x * sx - element.width / 2, ly = p.y * sy - element.height / 2;
      return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
    },
    fromCanvas(p: PathPoint): PathPoint {
      const dx = p.x - cx, dy = p.y - cy;
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      return { x: (lx + element.width / 2) / sx, y: (ly + element.height / 2) / sy };
    },
  };
}

/**
 * Writes an edited path (freeform coordinates) back into the shape, refitting its box to
 * the path's bounds so the drawing stays exactly where it is on the canvas (also when the
 * shape is rotated). The new freeform draws at scale 1 in the new box. A path flatter than
 * the minimum box size keeps its own start at the box edge.
 */
export function fitFreeform(element: Shape, model: PathModel): Shape {
  const f = element.content.freeform;
  if (!f) return element;
  const sx = element.width / f.w, sy = element.height / f.h;
  const local = mapPath(model, (p) => ({ x: p.x * sx, y: p.y * sy }));
  const bounds = pathBounds(local);
  if (!bounds) return element;
  const width = Math.min(MAX_SIZE, Math.max(MIN_SIZE, bounds.maxX - bounds.minX));
  const height = Math.min(MAX_SIZE, Math.max(MIN_SIZE, bounds.maxY - bounds.minY));
  const d = serializePath(mapPath(local, (p) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY })));
  if (d.length > MAX_D) return element;
  // Where the new box's centre lands on the canvas, through the old box's rotation.
  const angle = (element.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const ox = bounds.minX + width / 2 - element.width / 2, oy = bounds.minY + height / 2 - element.height / 2;
  const cx = element.x + element.width / 2 + ox * cos - oy * sin, cy = element.y + element.height / 2 + ox * sin + oy * cos;
  const closed = model.subpaths.some((path) => path.closed);
  return { ...element, x: cx - width / 2, y: cy - height / 2, width, height, content: { ...element.content, freeform: { d, w: width, h: height, closed } } };
}
