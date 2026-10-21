/**
 * Outlines of the closed shape kinds as SVG paths in the shape's own box, and the yellow
 * adjustment handle that tunes each one (PowerPoint's "adjust" value). Shared by the canvas,
 * the player, print and offline HTML.
 */

type Point = { x: number; y: number };
/** The 0..1 setting a kind's adjustment handle edits, and what it means for that kind. */
const ADJUST_DEFAULTS: Record<string, number> = {
  roundedRect: 0.2, // corner radius as a share of half the shorter side
  parallelogram: 0.25, // horizontal slant as a share of the width
  trapezoid: 0.25, // inset of the top corners as a share of the width
  chevron: 0.3, // depth of the notch and the point as a share of the width
  star: 0.45, // inner radius as a share of the outer radius
  callout: 0.3, // tail position along the bottom edge
  plus: 0.3, // arm thickness as a share of the shorter side
  pentagon: 0, hexagon: 0.25,
};

export const adjustableShapeKinds = new Set(["roundedRect", "parallelogram", "trapezoid", "chevron", "star", "callout", "plus", "hexagon"]);
export const defaultShapeAdjust = (kind: string) => ADJUST_DEFAULTS[kind] ?? 0;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const polygon = (points: Point[]) => `M${points.map((p) => `${round(p.x)},${round(p.y)}`).join(" L")} Z`;
const round = (value: number) => Math.round(value * 100) / 100;

/** The path of a closed kind, inset by half the stroke so thick outlines stay inside the box. */
export function shapeOutlinePath(kind: string, width: number, height: number, inset: number, adjust = defaultShapeAdjust(kind), cornerRadius?: number): string | null {
  const l = inset, t = inset, r = Math.max(inset, width - inset), b = Math.max(inset, height - inset);
  const w = r - l, h = b - t, cx = (l + r) / 2, cy = (t + b) / 2, a = clamp(adjust);
  switch (kind) {
    case "parallelogram": { const s = w * Math.min(a, 0.9); return polygon([{ x: l + s, y: t }, { x: r, y: t }, { x: r - s, y: b }, { x: l, y: b }]); }
    case "trapezoid": { const s = (w / 2) * Math.min(a * 2, 0.95); return polygon([{ x: l + s, y: t }, { x: r - s, y: t }, { x: r, y: b }, { x: l, y: b }]); }
    case "chevron": { const s = w * Math.min(a, 0.9); return polygon([{ x: l, y: t }, { x: r - s, y: t }, { x: r, y: cy }, { x: r - s, y: b }, { x: l, y: b }, { x: l + s, y: cy }]); }
    case "pentagon": return polygon([0, 1, 2, 3, 4].map((i) => radial(cx, cy, w / 2, h / 2, -90 + i * 72)));
    case "hexagon": { const s = (w / 2) * Math.min(a * 2, 0.95); return polygon([{ x: l + s, y: t }, { x: r - s, y: t }, { x: r, y: cy }, { x: r - s, y: b }, { x: l + s, y: b }, { x: l, y: cy }]); }
    case "star": {
      const inner = clamp(a, 0.05, 0.95);
      return polygon(Array.from({ length: 10 }, (_, i) => radial(cx, cy, (w / 2) * (i % 2 ? inner : 1), (h / 2) * (i % 2 ? inner : 1), -90 + i * 36)));
    }
    case "plus": {
      const arm = Math.min(w, h) * clamp(a, 0.05, 0.95) / 2;
      return polygon([{ x: cx - arm, y: t }, { x: cx + arm, y: t }, { x: cx + arm, y: cy - arm }, { x: r, y: cy - arm }, { x: r, y: cy + arm }, { x: cx + arm, y: cy + arm },
        { x: cx + arm, y: b }, { x: cx - arm, y: b }, { x: cx - arm, y: cy + arm }, { x: l, y: cy + arm }, { x: l, y: cy - arm }, { x: cx - arm, y: cy - arm }]);
    }
    case "callout": {
      // A speech bubble: the body takes the top 80 %, the tail points down from `adjust`.
      const body = t + h * 0.8, tip = l + w * clamp(a, 0.1, 0.9), base = Math.max(8, w * 0.12);
      return polygon([{ x: l, y: t }, { x: r, y: t }, { x: r, y: body }, { x: clamp(tip + base / 2, l, r), y: body }, { x: tip, y: b }, { x: clamp(tip - base / 2, l, r), y: body }, { x: l, y: body }]);
    }
    case "roundedRect": {
      const radius = Math.min(cornerRadius ?? a * Math.min(w, h) / 2, w / 2, h / 2);
      return `M${round(l + radius)},${round(t)} H${round(r - radius)} A${round(radius)},${round(radius)} 0 0 1 ${round(r)},${round(t + radius)} V${round(b - radius)} A${round(radius)},${round(radius)} 0 0 1 ${round(r - radius)},${round(b)} H${round(l + radius)} A${round(radius)},${round(radius)} 0 0 1 ${round(l)},${round(b - radius)} V${round(t + radius)} A${round(radius)},${round(radius)} 0 0 1 ${round(l + radius)},${round(t)} Z`;
    }
    default: return null;
  }
}

function radial(cx: number, cy: number, rx: number, ry: number, degrees: number): Point {
  const angle = degrees * Math.PI / 180;
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

/** Where the adjustment handle sits, in the shape's own (unrotated) box. */
export function adjustHandlePoint(kind: string, width: number, height: number, adjust = defaultShapeAdjust(kind), cornerRadius?: number): Point | null {
  const a = clamp(adjust);
  switch (kind) {
    case "roundedRect": return { x: Math.min(cornerRadius ?? a * Math.min(width, height) / 2, width / 2, height / 2), y: 0 };
    case "parallelogram": return { x: width * a, y: 0 };
    case "trapezoid": return { x: width * a, y: 0 };
    case "hexagon": return { x: width * a, y: 0 };
    case "chevron": return { x: width * (1 - a), y: 0 };
    case "star": return { x: width / 2, y: height / 2 - (height / 2) * a };
    case "plus": return { x: width / 2 - Math.min(width, height) * a / 2, y: 0 };
    case "callout": return { x: width * a, y: height };
    default: return null;
  }
}

/**
 * The inverse of `adjustHandlePoint`: the setting for a handle dragged to `point` (local box
 * coordinates). Rounded rectangles answer with a corner radius in px; others with `adjust`.
 */
export function adjustFromPoint(kind: string, width: number, height: number, point: Point): { adjust?: number; cornerRadius?: number } {
  switch (kind) {
    case "roundedRect": return { cornerRadius: Math.round(clamp(point.x, 0, Math.min(width, height) / 2)) };
    case "parallelogram": case "hexagon": return { adjust: clamp(point.x / width, 0, 0.45) };
    case "trapezoid": return { adjust: clamp(point.x / width, 0, 0.475) };
    case "chevron": return { adjust: clamp(1 - point.x / width, 0, 0.9) };
    case "star": return { adjust: clamp((height / 2 - point.y) / (height / 2), 0.05, 0.95) };
    case "plus": return { adjust: clamp((width / 2 - point.x) * 2 / Math.min(width, height), 0.05, 0.95) };
    case "callout": return { adjust: clamp(point.x / width, 0.1, 0.9) };
    default: return {};
  }
}
