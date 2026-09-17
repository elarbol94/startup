import type { PresentationElement } from "../lib/presentation";
import { isLinearShape } from "../lib/presentation-interactions";

/** One drawing implementation for the editor, player, print, and offline HTML. */
export function PresentationShape({ element }: { element: Extract<PresentationElement, { type: "shape" }> }) {
  const c = element.content, w = element.width, h = element.height, inset = c.strokeWidth / 2;
  const head = Math.min(c.headSize ?? Math.max(c.strokeWidth * 3, 10), w / 2);
  const start = c.startHead ?? (c.shape === "doubleArrow" ? "triangle" : "none");
  const end = c.endHead ?? (c.shape === "arrow" || c.shape === "doubleArrow" ? "triangle" : "none");
  const stroke = c.stroke || "currentColor";
  const paint = { fill: c.fill || "none", stroke, strokeWidth: c.strokeWidth, strokeDasharray: c.dash === "dash" ? `${c.strokeWidth * 4} ${c.strokeWidth * 3}` : c.dash === "dot" ? `${c.strokeWidth} ${c.strokeWidth * 2}` : undefined };
  const arrowHead = (atStart: boolean, style: typeof start) => {
    if (style === "none") return null;
    const tip = atStart ? 0 : w, base = atStart ? head : w - head;
    const points = `${base},${h / 2 - head / 2} ${tip},${h / 2} ${base},${h / 2 + head / 2}`;
    return style === "open" ? <polyline points={points} fill="none" stroke={stroke} strokeWidth={c.strokeWidth} /> : <polygon points={points} fill={stroke} />;
  };
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ opacity: c.opacity, overflow: "visible" }} aria-hidden>
    {(c.shape === "rect" || c.shape === "roundedRect") && <rect x={inset} y={inset} width={Math.max(0, w - c.strokeWidth)} height={Math.max(0, h - c.strokeWidth)} rx={c.shape === "roundedRect" ? Math.min(c.cornerRadius ?? 20, w / 2, h / 2) : 0} {...paint} />}
    {c.shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w - c.strokeWidth) / 2} ry={Math.max(0, h - c.strokeWidth) / 2} {...paint} />}
    {c.shape === "triangle" && <polygon points={`${w / 2},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`} {...paint} />}
    {c.shape === "diamond" && <polygon points={`${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`} {...paint} />}
    {isLinearShape(element) && <><line x1={start === "triangle" ? head : 0} y1={h / 2} x2={end === "triangle" ? w - head : w} y2={h / 2} {...paint} fill="none" />{arrowHead(true, start)}{arrowHead(false, end)}</>}
  </svg>;
}
