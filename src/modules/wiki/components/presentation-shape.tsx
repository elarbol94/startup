import type { PresentationElement } from "../lib/presentation";
import { isLinearShape } from "../lib/presentation-interactions";
import { shapeOutlinePath } from "../lib/presentation-shape-geometry";
import { isPresetShape, presetPaths } from "../lib/preset-shapes/preset-geometry";

type Point = { x: number; y: number };
type Head = "none" | "triangle" | "open";

/** An arrowhead at `tip`, pointing away from `from`. */
function ArrowHead({ tip, from, style, size, stroke, strokeWidth }: { tip: Point; from: Point; style: Head; size: number; stroke: string; strokeWidth: number }) {
  if (style === "none") return null;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / length, uy = (tip.y - from.y) / length;
  const base = { x: tip.x - ux * size, y: tip.y - uy * size };
  const points = `${base.x - uy * size / 2},${base.y + ux * size / 2} ${tip.x},${tip.y} ${base.x + uy * size / 2},${base.y - ux * size / 2}`;
  return style === "open" ? <polyline points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} /> : <polygon points={points} fill={stroke} />;
}

/**
 * DrawingML shades parts of some presets (a can's lid, a cube's sides) relative to the fill;
 * "darken" and "lighten" are drawn as a translucent black or white layer over the fill.
 */
const SHADES: Record<string, { color: string; opacity: number } | undefined> = {
  darken: { color: "#000", opacity: 0.4 }, darkenLess: { color: "#000", opacity: 0.2 },
  lighten: { color: "#fff", opacity: 0.4 }, lightenLess: { color: "#fff", opacity: 0.2 },
};

/** A PowerPoint preset shape or a freeform: its DrawingML paths at the element's size. */
function PresetDrawing({ element }: { element: Extract<PresentationElement, { type: "shape" }> }) {
  const c = element.content, w = element.width, h = element.height;
  const stroke = c.stroke || "currentColor";
  const dash = c.dash === "dash" ? `${c.strokeWidth * 4} ${c.strokeWidth * 3}` : c.dash === "dot" ? `${c.strokeWidth} ${c.strokeWidth * 2}` : undefined;
  const line = { stroke: c.strokeWidth ? stroke : "none", strokeWidth: c.strokeWidth, strokeDasharray: dash, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const };
  if (c.freeform) {
    const f = c.freeform;
    return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ opacity: c.opacity, overflow: "visible" }} aria-hidden>
      <path d={f.d} transform={`scale(${w / f.w} ${h / f.h})`} fill={f.closed && c.fill ? c.fill : "none"} strokeLinecap="round" {...line} />
    </svg>;
  }
  const paths = presetPaths(c.preset!, w, h, c.adjustments);
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ opacity: c.opacity, overflow: "visible" }} aria-hidden>
    {paths.map((path, index) => {
      const shade = SHADES[path.fill];
      const filled = path.fill !== "none" && Boolean(c.fill);
      return <g key={index}>
        {filled && <path d={path.d} fill={c.fill} stroke="none" />}
        {filled && shade && <path d={path.d} fill={shade.color} fillOpacity={shade.opacity} stroke="none" />}
        {path.stroke && <path d={path.d} fill="none" {...line} />}
      </g>;
    })}
  </svg>;
}

/** One drawing implementation for the editor, player, print, and offline HTML. */
export function PresentationShape({ element }: { element: Extract<PresentationElement, { type: "shape" }> }) {
  if ((element.content.preset && isPresetShape(element.content.preset)) || element.content.freeform) return <PresetDrawing element={element} />;
  const c = element.content, w = element.width, h = element.height, inset = c.strokeWidth / 2;
  const head = Math.min(c.headSize ?? Math.max(c.strokeWidth * 3, 10), Math.max(w, h) / 2);
  const start: Head = c.startHead ?? (c.shape === "doubleArrow" ? "triangle" : "none");
  const end: Head = c.endHead ?? (c.shape === "arrow" || c.shape === "doubleArrow" ? "triangle" : "none");
  const stroke = c.stroke || "currentColor";
  const paint = { fill: c.fill || "none", stroke, strokeWidth: c.strokeWidth, strokeDasharray: c.dash === "dash" ? `${c.strokeWidth * 4} ${c.strokeWidth * 3}` : c.dash === "dot" ? `${c.strokeWidth} ${c.strokeWidth * 2}` : undefined };
  const routed = isLinearShape(element) && c.route && c.route !== "straight" && c.points && c.points.length >= 2 ? c.points : null;
  const outline = c.shape === "roundedRect" ? null : shapeOutlinePath(c.shape, w, h, inset, c.adjust);
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ opacity: c.opacity, overflow: "visible" }} aria-hidden>
    {(c.shape === "rect" || c.shape === "roundedRect") && <rect x={inset} y={inset} width={Math.max(0, w - c.strokeWidth)} height={Math.max(0, h - c.strokeWidth)} rx={c.shape === "roundedRect" ? Math.min(c.cornerRadius ?? 20, w / 2, h / 2) : 0} {...paint} />}
    {outline && <path d={outline} {...paint} />}
    {c.shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w - c.strokeWidth) / 2} ry={Math.max(0, h - c.strokeWidth) / 2} {...paint} />}
    {c.shape === "triangle" && <polygon points={`${w / 2},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`} {...paint} />}
    {c.shape === "diamond" && <polygon points={`${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`} {...paint} />}
    {routed ? <RoutedLine points={routed} curve={c.route === "curve"} paint={paint} start={start} end={end} head={head} stroke={stroke} strokeWidth={c.strokeWidth} />
      : isLinearShape(element) && <>
        <line x1={start === "triangle" ? head : 0} y1={h / 2} x2={end === "triangle" ? w - head : w} y2={h / 2} {...paint} fill="none" />
        <ArrowHead tip={{ x: 0, y: h / 2 }} from={{ x: w, y: h / 2 }} style={start} size={head} stroke={stroke} strokeWidth={c.strokeWidth} />
        <ArrowHead tip={{ x: w, y: h / 2 }} from={{ x: 0, y: h / 2 }} style={end} size={head} stroke={stroke} strokeWidth={c.strokeWidth} />
      </>}
  </svg>;
}

/** An elbow (polyline) or curved (cubic Bézier through its two control points) connector. */
function RoutedLine({ points, curve, paint, start, end, head, stroke, strokeWidth }: {
  points: Point[]; curve: boolean; paint: Record<string, unknown>; start: Head; end: Head; head: number; stroke: string; strokeWidth: number;
}) {
  const first = points[0], last = points[points.length - 1];
  const d = curve && points.length === 4
    ? `M${first.x},${first.y} C${points[1].x},${points[1].y} ${points[2].x},${points[2].y} ${last.x},${last.y}`
    : `M${points.map((p) => `${p.x},${p.y}`).join(" L")}`;
  return <>
    <path d={d} {...paint} fill="none" />
    <ArrowHead tip={first} from={points[1]} style={start} size={head} stroke={stroke} strokeWidth={strokeWidth} />
    <ArrowHead tip={last} from={points[points.length - 2]} style={end} size={head} stroke={stroke} strokeWidth={strokeWidth} />
  </>;
}
