/**
 * What drawing with a gallery tool creates, with PowerPoint's defaults (observed in
 * Microsoft 365 PowerPoint, see docs/plans/presentation-powerpoint-parity.md): accent-1 fill
 * with a darker 1.5 pt outline and white 18 pt Aptos text for shapes, accent-1 1.5 pt lines,
 * and unfilled 18 pt text boxes.
 */
import type { PresentationElement } from "../presentation-model";
import { placeLine, type ConnectorRoute } from "../presentation-connectors";
import type { PresetGalleryEntry } from "./preset-gallery";

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type Shape = Extract<PresentationElement, { type: "shape" }>;

export const POWERPOINT_STYLE = { fill: "#156082", outline: "#042433", line: "#156082", weight: 1.5, textColor: "#ffffff", fontSize: 18 } as const;
/** Under this many screen pixels between press and release a drawing gesture is a click. */
export const DRAW_CLICK_DISTANCE = 3;

const LINE_TOOLS: Record<string, { shape: "line" | "arrow" | "doubleArrow"; route: ConnectorRoute }> = {
  line: { shape: "line", route: "straight" }, lineArrow: { shape: "arrow", route: "straight" }, lineDoubleArrow: { shape: "doubleArrow", route: "straight" },
  elbowConnector: { shape: "line", route: "elbow" }, elbowArrowConnector: { shape: "arrow", route: "elbow" }, elbowDoubleArrowConnector: { shape: "doubleArrow", route: "elbow" },
  curvedConnector: { shape: "line", route: "curve" }, curvedArrowConnector: { shape: "arrow", route: "curve" }, curvedDoubleArrowConnector: { shape: "doubleArrow", route: "curve" },
};
export const isLineTool = (id: string) => id in LINE_TOOLS;
export const isFreeformTool = (id: string) => id === "freeform" || id === "curve" || id === "scribble";

/**
 * The box a shape tool draws. A click inserts the default size with its top-left at the
 * click; a drag spans press to release. Shift keeps the default proportions and Ctrl (or
 * Alt) draws from the centre, as in PowerPoint.
 */
export function drawBox(entry: PresetGalleryEntry, start: Point, end: Point, options: { click: boolean; proportional: boolean; fromCentre: boolean }): Box {
  // A clicked text box is one 18 pt line high (PowerPoint: 29.08 pt) and grows as it is typed into.
  if (options.click && entry.id === "textBox") return { x: start.x, y: start.y, width: 240, height: 29.08 };
  if (options.click) return { x: start.x, y: start.y, width: entry.width, height: entry.height };
  let dx = end.x - start.x, dy = end.y - start.y;
  if (options.proportional) {
    const ratio = entry.width / entry.height, size = Math.max(Math.abs(dx), Math.abs(dy) * ratio);
    dx = Math.sign(dx || 1) * size; dy = Math.sign(dy || 1) * size / ratio;
  }
  const width = Math.max(1, Math.abs(dx) * (options.fromCentre ? 2 : 1)), height = Math.max(1, Math.abs(dy) * (options.fromCentre ? 2 : 1));
  if (options.fromCentre) return { x: start.x - width / 2, y: start.y - height / 2, width, height };
  return { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), width, height };
}

/** A shape, text box or line from a gallery entry (freeforms are made by `createFreeform`). */
export function createGalleryElement(entry: PresetGalleryEntry, box: Box, id: string, line?: { from: Point; to: Point }): PresentationElement {
  if (entry.id === "textBox") {
    return { id, type: "text", x: box.x, y: box.y, width: Math.max(box.width, 20), height: Math.max(box.height, 20), rotation: 0,
      content: { text: "", fontSize: POWERPOINT_STYLE.fontSize, bold: false, color: "", align: "left", font: "aptos", padding: 7.2 } };
  }
  const tool = LINE_TOOLS[entry.id];
  if (tool) {
    const from = line?.from ?? { x: box.x, y: box.y }, to = line?.to ?? { x: box.x + box.width, y: box.y + box.height };
    const base: Shape = { id, type: "shape", x: 0, y: 0, width: 20, height: 20, rotation: 0,
      content: { shape: tool.shape, fill: "", stroke: POWERPOINT_STYLE.line, strokeWidth: POWERPOINT_STYLE.weight, opacity: 1, route: tool.route === "straight" ? undefined : tool.route } };
    return placeLine(base, [from, to], tool.route);
  }
  return { id, type: "shape", ...box, rotation: 0,
    content: { shape: "rect", preset: entry.id as Shape["content"]["preset"], fill: POWERPOINT_STYLE.fill, stroke: POWERPOINT_STYLE.outline, strokeWidth: POWERPOINT_STYLE.weight, opacity: 1,
      fontSize: POWERPOINT_STYLE.fontSize, color: POWERPOINT_STYLE.textColor, font: "aptos" } };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A freeform, curve or scribble through `points` (canvas coordinates). Curves pass smoothly
 * through every point (Catmull-Rom); closed paths are filled like shapes, open ones are lines.
 */
export function createFreeform(points: Point[], id: string, options: { closed: boolean; smooth: boolean }): PresentationElement | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - x), height = Math.max(1, Math.max(...ys) - y);
  const local = points.map((p) => ({ x: round(p.x - x), y: round(p.y - y) }));
  let d = `M${local[0].x} ${local[0].y}`;
  if (options.smooth && local.length > 2) {
    const ring = options.closed ? [local[local.length - 1], ...local, local[0], local[1]] : [local[0], ...local, local[local.length - 1]];
    for (let i = 1; i < ring.length - 2; i++) {
      const [p0, p1, p2, p3] = [ring[i - 1], ring[i], ring[i + 1], ring[i + 2]];
      d += ` C${round(p1.x + (p2.x - p0.x) / 6)} ${round(p1.y + (p2.y - p0.y) / 6)} ${round(p2.x - (p3.x - p1.x) / 6)} ${round(p2.y - (p3.y - p1.y) / 6)} ${p2.x} ${p2.y}`;
    }
  } else d += local.slice(1).map((p) => ` L${p.x} ${p.y}`).join("");
  if (options.closed) d += " Z";
  if (d.length > 60_000) return null;
  return { id, type: "shape", x, y, width: Math.min(width, 20_000), height: Math.min(height, 20_000), rotation: 0,
    content: { shape: "rect", fill: options.closed ? POWERPOINT_STYLE.fill : "", stroke: options.closed ? POWERPOINT_STYLE.outline : POWERPOINT_STYLE.line, strokeWidth: POWERPOINT_STYLE.weight, opacity: 1,
      freeform: { d, w: width, h: height, closed: options.closed } } };
}
