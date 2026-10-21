"use client";
// The crosshair layer of an armed gallery tool, PowerPoint style: click for the default
// size, drag for a box (Shift keeps proportions, Ctrl draws from the centre), lines from
// press to release with their ends glued to the shapes they start or end on, scribbles
// freehand, and freeforms/curves through clicked points (double-click or Enter finishes,
// clicking the first point closes). Escape cancels. Used by presentation-editor.tsx.
import { useEffect, useRef, useState } from "react";
import type { useReactFlow } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";
import type { PresentationElement } from "../../lib/presentation";
import { nearestSite, type ConnectionSite } from "../../lib/presentation-connectors";
import { presetPaths } from "../../lib/preset-shapes/preset-geometry";
import type { PresetGalleryEntry } from "../../lib/preset-shapes/preset-gallery";
import { DRAW_CLICK_DISTANCE, createFreeform, createGalleryElement, drawBox, isFreeformTool, isLineTool } from "../../lib/preset-shapes/preset-elements";
import type { PresentationNode } from "../presentation-canvas";

type Point = { x: number; y: number };
export type DrawGlue = { from?: { elementId: string; site: ConnectionSite }; to?: { elementId: string; site: ConnectionSite } };

/** Pixels within which a click on a freeform's first point closes it. */
const CLOSE_DISTANCE = 8;

export function PresentationDrawOverlay({ tool, reactFlow, lookup, onCreate, onCancel, label }: {
  tool: PresetGalleryEntry;
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  lookup: (id: string) => PresentationElement | undefined;
  onCreate: (element: PresentationElement, glue: DrawGlue) => void;
  onCancel: () => void;
  label: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: Point; current: Point; shift: boolean; ctrl: boolean } | null>(null);
  /** Freeform/curve/scribble points so far, in screen coordinates relative to the layer. */
  const [points, setPoints] = useState<Point[]>([]);
  const pressed = useRef(false);
  const freeform = isFreeformTool(tool.id), line = isLineTool(tool.id);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = layer.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toFlow = (point: Point) => {
    const rect = layer.current!.getBoundingClientRect();
    return reactFlow.screenToFlowPosition({ x: rect.left + point.x, y: rect.top + point.y });
  };
  /** The object under a screen point that a line end glues to, and the site it glues at. */
  const glueAt = (point: Point) => {
    const rect = layer.current!.getBoundingClientRect();
    const id = document.elementsFromPoint(rect.left + point.x, rect.top + point.y)
      .map((node) => node.closest<HTMLElement>(".react-flow__node")?.dataset.id)
      .find((candidate) => { const element = candidate ? lookup(candidate) : undefined; return element && element.type !== "frame" && !(element.type === "shape" && (element.content.connection || ["line", "arrow", "doubleArrow"].includes(element.content.shape))); });
    const element = id ? lookup(id) : undefined;
    return element ? { elementId: element.id, site: nearestSite(element, toFlow(point)) } : undefined;
  };

  const finishFreeform = (list: Point[], closed: boolean) => {
    setPoints([]);
    const element = createFreeform(list.map(toFlow), createId(), { closed, smooth: tool.id === "curve" });
    if (element) onCreate(element, {}); else onCancel();
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
      else if (event.key === "Enter" && freeform && points.length >= 2) { event.preventDefault(); event.stopPropagation(); finishFreeform(points, false); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    layer.current?.setPointerCapture(event.pointerId);
    const point = local(event);
    pressed.current = true;
    if (freeform) {
      if (points.length > 2 && Math.hypot(point.x - points[0].x, point.y - points[0].y) <= CLOSE_DISTANCE) { pressed.current = false; finishFreeform(points, true); return; }
      setPoints((list) => [...list, point]);
      return;
    }
    setDrag({ start: point, current: point, shift: event.shiftKey, ctrl: event.ctrlKey || event.altKey });
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const point = local(event);
    if (freeform) {
      // Scribbles follow the pointer; freeforms draw freehand while the button is held.
      if (pressed.current && (tool.id === "scribble" || tool.id === "freeform")) {
        setPoints((list) => { const last = list[list.length - 1]; return !last || Math.hypot(point.x - last.x, point.y - last.y) >= 2 ? [...list, point] : list; });
      }
      return;
    }
    if (drag) setDrag({ ...drag, current: point, shift: event.shiftKey, ctrl: event.ctrlKey || event.altKey });
  };
  const onPointerUp = (event: React.PointerEvent) => {
    pressed.current = false;
    if (layer.current?.hasPointerCapture(event.pointerId)) layer.current.releasePointerCapture(event.pointerId);
    if (freeform) { if (tool.id === "scribble") finishFreeform(points, false); return; }
    if (!drag) return;
    const end = local(event);
    const click = Math.hypot(end.x - drag.start.x, end.y - drag.start.y) < DRAW_CLICK_DISTANCE;
    const start = toFlow(drag.start), finish = toFlow(end);
    setDrag(null);
    if (line) {
      // A click draws PowerPoint's default 72 × 72 diagonal; Shift keeps 45° steps.
      let to = click ? { x: start.x + tool.width, y: start.y + tool.height } : finish;
      if (!click && event.shiftKey) {
        const angle = Math.round(Math.atan2(to.y - start.y, to.x - start.x) / (Math.PI / 4)) * (Math.PI / 4), length = Math.hypot(to.x - start.x, to.y - start.y);
        to = { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
      }
      const element = createGalleryElement(tool, { x: start.x, y: start.y, width: 1, height: 1 }, createId(), { from: start, to });
      onCreate(element, { from: glueAt(drag.start), to: click ? undefined : glueAt(end) });
      return;
    }
    const box = drawBox(tool, start, finish, { click, proportional: event.shiftKey, fromCentre: event.ctrlKey || event.altKey });
    onCreate(createGalleryElement(tool, box, createId()), {});
  };
  const onDoubleClick = (event: React.MouseEvent) => {
    if (!freeform || tool.id === "scribble") return;
    event.preventDefault(); event.stopPropagation();
    // The double-click's own second press added a point at the same place.
    const list = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 1);
    if (list.length >= 2) finishFreeform(list, false); else onCancel();
  };

  const preview = (() => {
    if (freeform) {
      if (!points.length) return null;
      return <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" />;
    }
    if (!drag) return null;
    if (line) return <line x1={drag.start.x} y1={drag.start.y} x2={drag.current.x} y2={drag.current.y} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" />;
    const box = drawBox({ ...tool, width: tool.width, height: tool.height }, drag.start, drag.current, { click: false, proportional: drag.shift, fromCentre: drag.ctrl });
    if (tool.tool) return <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" />;
    return <g transform={`translate(${box.x} ${box.y})`}>{presetPaths(tool.id, box.width, box.height).map((path, index) => <path key={index} d={path.d} fill="rgba(99,102,241,0.08)" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="5 3" />)}</g>;
  })();

  return (
    <div ref={layer} role="application" aria-label={label} data-testid="presentation-draw-layer"
      className="absolute inset-0 z-20 cursor-crosshair touch-none"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick}>
      {preview && <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>{preview}</svg>}
    </div>
  );
}
