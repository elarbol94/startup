// Pure maths behind how a shape is painted: dash patterns, arrowhead sizes, gradient vectors and
// effect offsets in PowerPoint's units. Kept out of the React renderer so it can be tested and
// shared with the text (WordArt) renderer. Evidence: docs/plans/presentation-powerpoint-formatting.md.
import type { PresentationArrowHead, PresentationGradient, PresentationLineDash } from "./presentation-format-model";

/** DrawingML's preset dash patterns, in multiples of the line width (dash, gap, dash, gap...). */
const DASHES: Record<PresentationLineDash, number[] | null> = {
  solid: null, roundDot: [0, 2], squareDot: [1, 1], dash: [4, 3], dashDot: [4, 3, 1, 3],
  longDash: [8, 3], longDashDot: [8, 3, 1, 3], longDashDotDot: [8, 3, 1, 3, 1, 3],
  // Saved before PowerPoint's dash list: the old "dot" looked like a round dot.
  dot: [0, 2],
};

/** SVG dash array for a dash type and line width; round dots are zero-length dashes with round caps. */
export function dashArray(dash: PresentationLineDash | undefined, width: number): string | undefined {
  const pattern = DASHES[dash ?? "solid"];
  if (!pattern || width <= 0) return undefined;
  return pattern.map((part) => Math.max(part === 0 ? 0.001 : 0, part * width)).join(" ");
}

/** Round dots need a round cap to be dots at all; everything else uses the chosen cap. */
export function lineCap(dash: PresentationLineDash | undefined, cap: "flat" | "round" | "square" | undefined): "butt" | "round" | "square" {
  if (dash === "roundDot" || dash === "dot") return "round";
  return cap === "round" ? "round" : cap === "square" ? "square" : "butt";
}

/**
 * The stripes of a compound line, as [offset from the outer edge, width] shares of the full
 * width. Thick Thin and Thin Thick are drawn symmetric (see the plan's approximations).
 */
export function compoundStripes(compound: string | undefined): [number, number][] | null {
  switch (compound) {
    case "double": case "thickThin": case "thinThick": return [[0, 1 / 3], [2 / 3, 1 / 3]];
    case "triple": return [[0, 1 / 6], [5 / 12, 1 / 6], [5 / 6, 1 / 6]];
    default: return null;
  }
}

const SIZE_FACTOR = { sm: 2, med: 3, lg: 5 } as const;
/** An arrowhead's width and length: DrawingML's sm/med/lg are 2, 3 and 5 line widths (at least 6 pt for med). */
export function arrowHeadSize(width: number, size?: { width: "sm" | "med" | "lg"; length: "sm" | "med" | "lg" }, legacy?: number): { width: number; length: number } {
  if (!size && legacy) return { width: legacy, length: legacy };
  const w = size?.width ?? "med", l = size?.length ?? "med", base = Math.max(width, 2);
  return { width: SIZE_FACTOR[w] * base, length: SIZE_FACTOR[l] * base };
}

type Point = { x: number; y: number };
/** The outline of an arrowhead at `tip` pointing away from `from`, and where the line should stop. */
export function arrowHeadPath(kind: PresentationArrowHead, tip: Point, from: Point, size: { width: number; length: number }): { d: string; filled: boolean; inset: number } | null {
  if (kind === "none") return null;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / length, uy = (tip.y - from.y) / length, nx = -uy, ny = ux;
  const at = (along: number, across: number) => `${tip.x - ux * along + nx * across},${tip.y - uy * along + ny * across}`;
  const L = size.length, W = size.width / 2;
  switch (kind) {
    case "triangle": return { d: `M${at(0, 0)} L${at(L, W)} L${at(L, -W)} Z`, filled: true, inset: L };
    case "stealth": return { d: `M${at(0, 0)} L${at(L, W)} L${at(L * 0.6, 0)} L${at(L, -W)} Z`, filled: true, inset: L * 0.6 };
    // Diamonds and ovals sit centred on the line's end, so the line runs into their middle.
    case "diamond": return { d: `M${at(-L / 2, 0)} L${at(0, W)} L${at(L / 2, 0)} L${at(0, -W)} Z`, filled: true, inset: 0 };
    case "oval": {
      const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
      return { d: `M${at(-L / 2, 0)} A${L / 2} ${W} ${angle} 1 0 ${at(L / 2, 0)} A${L / 2} ${W} ${angle} 1 0 ${at(-L / 2, 0)} Z`, filled: true, inset: 0 };
    }
    case "open": return { d: `M${at(L, W)} L${at(0, 0)} L${at(L, -W)}`, filled: false, inset: 0 };
  }
}

/**
 * A linear gradient's end points in a w × h box. PowerPoint's angle runs clockwise from left to
 * right (90° is top to bottom), and the gradient spans the box's extent along that direction.
 */
export function gradientVector(angle: number, w: number, h: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const r = (v: number) => Math.round(v * 1000) / 1000 + 0;
  return { x1: r(w / 2 - dx * half), y1: r(h / 2 - dy * half), x2: r(w / 2 + dx * half), y2: r(h / 2 + dy * half) };
}

/** Gradient stops sorted by position, as SVG needs them. */
export function sortedStops(gradient: PresentationGradient) {
  return [...gradient.stops].sort((a, b) => a.position - b.position);
}

/** A shadow's offset from its angle (clockwise from the x axis) and distance. */
export function shadowOffset(angle: number, distance: number): { dx: number; dy: number } {
  const rad = (angle * Math.PI) / 180;
  return { dx: Math.round(Math.cos(rad) * distance * 1000) / 1000, dy: Math.round(Math.sin(rad) * distance * 1000) / 1000 };
}

/** CSS transform for 3-D rotation: PowerPoint's X turns around the vertical axis, Y around the horizontal one. */
export function rotation3dTransform(rotation: { x: number; y: number; z: number; perspective: number } | undefined, size: number): string | undefined {
  if (!rotation || (!rotation.x && !rotation.y && !rotation.z)) return undefined;
  const fov = Math.min(Math.max(rotation.perspective, 0), 120);
  const distance = fov ? (size / 2) / Math.tan(((fov / 2) * Math.PI) / 180) : 0;
  return `${distance ? `perspective(${Math.round(distance)}px) ` : ""}rotateY(${-rotation.x}deg) rotateX(${rotation.y}deg) rotateZ(${rotation.z}deg)`;
}
