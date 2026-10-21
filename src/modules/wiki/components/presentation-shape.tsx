import type { ReactNode, SVGProps } from "react";
import type { PresentationElement } from "../lib/presentation";
import type { PresentationArrowHead } from "../lib/presentation-format-model";
import { isLinearShape } from "../lib/presentation-interactions";
import { arrowHeadPath, arrowHeadSize, rotation3dTransform } from "../lib/presentation-paint";
import { shapeOutlinePath } from "../lib/presentation-shape-geometry";
import { isPresetShape, presetPaths } from "../lib/preset-shapes/preset-geometry";
import { CompoundMask, EffectsFilter, PaintServer, paintId, shapeFill, strokeAttributes } from "./presentation-shape-paint";

type Point = { x: number; y: number };
type Shape = Extract<PresentationElement, { type: "shape" }>;
/** One path of a shape's drawing: whether it is filled (and how a preset shades it) and stroked. */
type DrawPath = { d: string; fill: string; stroke: boolean };

/**
 * DrawingML shades parts of some presets (a can's lid, a cube's sides) relative to the fill;
 * "darken" and "lighten" are drawn as a translucent black or white layer over the fill.
 */
const SHADES: Record<string, { color: string; opacity: number } | undefined> = {
  darken: { color: "#000", opacity: 0.4 }, darkenLess: { color: "#000", opacity: 0.2 },
  lighten: { color: "#fff", opacity: 0.4 }, lightenLess: { color: "#fff", opacity: 0.2 },
};

/** The closed drawing of a shape as paths in its own w × h box, whatever kind it is. */
function shapePaths(element: Shape): DrawPath[] {
  const c = element.content, w = element.width, h = element.height;
  if (c.freeform) {
    const f = c.freeform;
    return [{ d: scalePath(f.d, w / f.w, h / f.h), fill: f.closed ? "norm" : "none", stroke: true }];
  }
  if (c.preset && isPresetShape(c.preset)) return presetPaths(c.preset, w, h, c.adjustments);
  // The kinds saved before presets keep their stroke inside the box, as they always did.
  const i = c.strokeWidth / 2, W = Math.max(0, w - c.strokeWidth), H = Math.max(0, h - c.strokeWidth);
  switch (c.shape) {
    case "rect": return [{ d: `M${i},${i}h${W}v${H}h${-W}Z`, fill: "norm", stroke: true }];
    case "roundedRect": {
      const r = Math.min(c.cornerRadius ?? 20, W / 2, H / 2);
      return [{ d: `M${i + r},${i}h${W - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${H - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(W - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(H - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}Z`, fill: "norm", stroke: true }];
    }
    case "ellipse": return [{ d: `M${i},${h / 2}a${W / 2},${H / 2} 0 1 0 ${W},0a${W / 2},${H / 2} 0 1 0 ${-W},0Z`, fill: "norm", stroke: true }];
    case "triangle": return [{ d: `M${w / 2},${i}L${w - i},${h - i}L${i},${h - i}Z`, fill: "norm", stroke: true }];
    case "diamond": return [{ d: `M${w / 2},${i}L${w - i},${h / 2}L${w / 2},${h - i}L${i},${h / 2}Z`, fill: "norm", stroke: true }];
    default: {
      const outline = shapeOutlinePath(c.shape, w, h, i, c.adjust);
      return outline ? [{ d: outline, fill: "norm", stroke: true }] : [];
    }
  }
}

/** Scales a freeform path's numbers; its commands are absolute M/L/C/Q/Z (see preset-elements). */
function scalePath(d: string, sx: number, sy: number): string {
  if (sx === 1 && sy === 1) return d;
  let axis = 0;
  return d.replace(/([A-Za-z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g, (token, command: string | undefined) => {
    if (command) { axis = 0; return command; }
    const value = Number(token) * (axis++ % 2 === 0 ? sx : sy);
    return String(Math.round(value * 1000) / 1000);
  });
}

/** One drawing implementation for the editor, player, print, and offline HTML. */
export function PresentationShape({ element, mediaUrl }: { element: Shape; mediaUrl?: (id: string) => string }) {
  const c = element.content, w = element.width, h = element.height;
  const linear = isLinearShape(element);
  const effects = c.effects, fx = paintId(element, "fx"), compoundId = paintId(element, "cmpd");
  const stroke = strokeAttributes(c);
  const paths = linear ? [] : shapePaths(element);
  const compound = c.compound && c.compound !== "single" && c.strokeWidth ? c.compound : undefined;
  const filtered = Boolean(effects && (effects.shadow || effects.glow || effects.softEdges || effects.bevel));
  const body: ReactNode = linear ? <LineBody element={element} stroke={stroke} />
    : paths.map((path, index) => {
      const shade = SHADES[path.fill];
      const filled = path.fill !== "none";
      const paint = shapeFill(element);
      return <g key={index}>
        {filled && paint.fill !== "none" && <path d={path.d} fill={paint.fill} fillOpacity={paint.fillOpacity} stroke="none" />}
        {filled && shade && paint.fill !== "none" && <path d={path.d} fill={shade.color} fillOpacity={shade.opacity} stroke="none" />}
        {path.stroke && <path d={path.d} fill="none" {...stroke} mask={compound ? `url(#${compoundId})` : undefined} />}
      </g>;
    });
  const reflection = !linear ? effects?.reflection : undefined;
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" aria-hidden
    style={{ opacity: c.opacity, overflow: "visible", transform: rotation3dTransform(effects?.rotation3d, Math.max(w, h)) }}>
    <defs>
      {c.fillStyle && <PaintServer id={paintId(element, "fill")} fill={c.fillStyle} w={w} h={h} mediaUrl={mediaUrl} />}
      {filtered && <EffectsFilter id={fx} effects={effects} />}
      {compound && <CompoundMask id={compoundId} d={paths.filter((p) => p.stroke).map((p) => p.d)} width={c.strokeWidth} compound={compound} />}
      {reflection && <linearGradient id={paintId(element, "reflg")} gradientUnits="userSpaceOnUse" x1={0} y1={h} x2={0} y2={h - (h * reflection.size) / 100}>
        <stop offset={0} stopColor="white" stopOpacity={1 - reflection.transparency} /><stop offset={1} stopColor="white" stopOpacity={0} />
      </linearGradient>}
      {reflection && <mask id={paintId(element, "refl")} maskUnits="userSpaceOnUse" x={-w} y={-h} width={3 * w} height={3 * h}><rect x={-w} y={-h} width={3 * w} height={3 * h} fill={`url(#${paintId(element, "reflg")})`} /></mask>}
      {reflection && reflection.blur > 0 && <filter id={paintId(element, "reflb")}><feGaussianBlur stdDeviation={reflection.blur / 2} /></filter>}
    </defs>
    {reflection && <g transform={`translate(0 ${2 * h + reflection.distance}) scale(1 -1)`} mask={`url(#${paintId(element, "refl")})`} filter={reflection.blur > 0 ? `url(#${paintId(element, "reflb")})` : undefined}>{body}</g>}
    <g filter={filtered ? `url(#${fx})` : undefined}>{body}</g>
  </svg>;
}

/** A straight, elbow or curved line with its arrowheads. */
function LineBody({ element, stroke }: { element: Shape; stroke: SVGProps<SVGPathElement> }) {
  const c = element.content, w = element.width, h = element.height;
  const start: PresentationArrowHead = c.startHead ?? (c.shape === "doubleArrow" ? "triangle" : "none");
  const end: PresentationArrowHead = c.endHead ?? (c.shape === "arrow" || c.shape === "doubleArrow" ? "triangle" : "none");
  const routed = c.route && c.route !== "straight" && c.points && c.points.length >= 2 ? c.points : null;
  const points: Point[] = routed ?? [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }];
  const first = points[0], last = points[points.length - 1];
  const legacy = c.headSize && !c.startSize && !c.endSize ? Math.min(c.headSize, Math.max(w, h) / 2) : undefined;
  const startHead = arrowHeadPath(start, first, points[1], arrowHeadSize(c.strokeWidth, c.startSize, legacy));
  const endHead = arrowHeadPath(end, last, points[points.length - 2], arrowHeadSize(c.strokeWidth, c.endSize, legacy));
  // The line stops at a filled head's base, so a wide flat cap never pokes through its tip.
  const pull = (tip: Point, from: Point, inset: number) => {
    const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1, k = Math.min(inset, length / 2) / length;
    return { x: tip.x + (from.x - tip.x) * k, y: tip.y + (from.y - tip.y) * k };
  };
  const a = startHead ? pull(first, points[1], startHead.inset) : first;
  const b = endHead ? pull(last, points[points.length - 2], endHead.inset) : last;
  const inner = points.slice(1, -1);
  const d = routed && c.route === "curve" && points.length === 4
    ? `M${a.x},${a.y} C${points[1].x},${points[1].y} ${points[2].x},${points[2].y} ${b.x},${b.y}`
    : `M${[a, ...inner, b].map((p) => `${p.x},${p.y}`).join(" L")}`;
  const color = stroke.stroke === "none" ? undefined : stroke.stroke;
  return <>
    <path d={d} fill="none" {...stroke} />
    {[startHead, endHead].map((head, i) => head && <path key={i} d={head.d} fill={head.filled ? color : "none"} fillOpacity={stroke.strokeOpacity}
      stroke={head.filled ? "none" : color} strokeOpacity={stroke.strokeOpacity} strokeWidth={stroke.strokeWidth} strokeLinejoin="miter" />)}
  </>;
}
