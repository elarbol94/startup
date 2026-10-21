"use client";
// PowerPoint's rulers along the top and left edge of the presentation canvas: centimetres
// counted from the current frame's centre, the selection's extent, and dragging a new guide
// out of a ruler. Rendered as a child of <ReactFlow> in presentation-editor.tsx.
import { useMemo, useRef, useState } from "react";
import { useReactFlow, useStore, useViewport } from "@xyflow/react";
import { PRESENTATION_CM, rulerOrigin, rulerTicks } from "../../lib/presentation-grid";
import type { PresentationBounds, PresentationElement } from "../../lib/presentation";

/** Ruler thickness in screen pixels; guides dropped onto a ruler are deleted. */
export const RULER_SIZE = 20;

type Point = { x: number; y: number };

/** The ruler origin for what is on screen now: the centre of the frame under the viewport's centre. */
export function useRulerOrigin(elements: PresentationElement[]): Point {
  const { x, y, zoom } = useViewport();
  const width = useStore(state => state.width), height = useStore(state => state.height);
  const center = { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
  // Panning re-renders this every frame, so only the cheap part runs per render.
  const frames = useMemo(() => elements.filter(e => e.type === "frame" && !e.content.isGroup), [elements]);
  return rulerOrigin(frames, center);
}

/** A guide being dragged out of a ruler, drawn in screen space until it is dropped. */
export function GuidePreviewLine({ axis, position, origin, format }: { axis: "x" | "y"; position: number; origin: Point; format: (cm: number) => string }) {
  const { x, y, zoom } = useViewport();
  const screen = axis === "x" ? position * zoom + x : position * zoom + y;
  const cm = Math.abs((position - origin[axis]) / PRESENTATION_CM);
  return (
    <div className="pointer-events-none absolute" style={axis === "x" ? { left: screen, top: 0, bottom: 0, width: 1 } : { top: screen, left: 0, right: 0, height: 1 }}>
      <div className="absolute inset-0" style={{ background: `repeating-linear-gradient(${axis === "x" ? "to bottom" : "to right"}, #475569 0 4px, transparent 4px 7px)` }} />
      <span className="absolute rounded bg-slate-700 px-1 text-[10px] leading-4 whitespace-nowrap text-white tabular-nums" style={axis === "x" ? { left: 6, top: RULER_SIZE + 6 } : { top: 6, left: RULER_SIZE + 6 }}>{format(cm)}</span>
    </div>
  );
}

function Ruler({ axis, origin, selection, length, onDragStart, label }: {
  /** "x" runs along the top and measures x; "y" runs down the left edge. */
  axis: "x" | "y";
  origin: Point;
  selection?: PresentationBounds;
  length: number;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  label: string;
}) {
  const viewport = useViewport();
  const offset = axis === "x" ? viewport.x : viewport.y, zoom = viewport.zoom;
  const toScreen = (value: number) => value * zoom + offset;
  const ticks = rulerTicks((RULER_SIZE - offset) / zoom - origin[axis], (length - offset) / zoom - origin[axis], zoom);
  const extent = selection && (axis === "x" ? [selection.x, selection.x + selection.width] : [selection.y, selection.y + selection.height]);
  // Ticks hang from the canvas-side edge; labels sit above them, upright on the left ruler.
  const along = (a: number, b: number) => axis === "x" ? { x: a, y: b } : { x: b, y: a };
  return (
    <div
      data-presentation-overlay
      data-testid={`presentation-ruler-${axis === "x" ? "horizontal" : "vertical"}`}
      role="presentation"
      aria-label={label}
      title={label}
      className="nodrag nopan pointer-events-auto absolute touch-none select-none border-border bg-background/95 text-muted-foreground"
      style={axis === "x"
        ? { left: 0, top: 0, width: length, height: RULER_SIZE, borderBottomWidth: 1, cursor: "s-resize" }
        : { left: 0, top: 0, width: RULER_SIZE, height: length, borderRightWidth: 1, cursor: "e-resize" }}
      onPointerDown={onDragStart}
    >
      <svg width={axis === "x" ? length : RULER_SIZE} height={axis === "x" ? RULER_SIZE : length} className="block overflow-hidden" aria-hidden>
        {extent && (() => {
          const a = Math.max(toScreen(extent[0]), RULER_SIZE), b = toScreen(extent[1]);
          if (b <= a) return null;
          const p = along(a, 0);
          return <rect x={p.x} y={p.y} width={axis === "x" ? b - a : RULER_SIZE} height={axis === "x" ? RULER_SIZE : b - a} className="fill-indigo-500/20" />;
        })()}
        {ticks.map(tick => {
          const at = Math.round(toScreen(origin[axis] + tick.position)) + 0.5;
          const size = tick.kind === "major" ? 7 : tick.kind === "mid" ? 5 : 3;
          const from = along(at, RULER_SIZE), to = along(at, RULER_SIZE - size), text = along(at, 8);
          return (
            <g key={tick.position}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={1} />
              {tick.label !== undefined && (
                <text x={text.x} y={text.y} fontSize={9} fill="currentColor" textAnchor="middle" dominantBaseline="middle"
                  transform={axis === "y" ? `rotate(-90 ${text.x} ${text.y})` : undefined}>{Math.abs(tick.label)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Both rulers plus the corner square. Dragging from the top ruler onto the canvas adds a
 * horizontal ("y") guide, from the left ruler a vertical ("x") one, like PowerPoint.
 */
export function CanvasRulers({ elements, origin: givenOrigin, selection, onAddGuide, format, labels, disabled }: {
  /** Used to find the ruler origin when `origin` is not given. */
  elements: PresentationElement[];
  origin?: Point;
  /** The current selection's box, highlighted on both rulers. */
  selection?: PresentationBounds;
  onAddGuide: (axis: "x" | "y", position: number) => void;
  /** Formats a distance in cm for the drag preview, e.g. "4,50". */
  format: (cm: number) => string;
  labels: { horizontal: string; vertical: string };
  disabled?: boolean;
}) {
  const computed = useRulerOrigin(elements);
  const origin = givenOrigin ?? computed;
  const width = useStore(state => state.width), height = useStore(state => state.height);
  const reactFlow = useReactFlow();
  const root = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ axis: "x" | "y"; position: number; inside: boolean } | null>(null);

  const startDrag = (axis: "x" | "y") => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const locate = (e: PointerEvent | React.PointerEvent) => {
      const rect = root.current!.getBoundingClientRect();
      const point = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Only a drop past the ruler, on the canvas, makes a guide; back onto the ruler cancels.
      const inside = e.clientX <= rect.right && e.clientY <= rect.bottom
        && (axis === "x" ? e.clientX - rect.left > RULER_SIZE && e.clientY >= rect.top : e.clientY - rect.top > RULER_SIZE && e.clientX >= rect.left);
      return { axis, position: point[axis], inside };
    };
    setDraft(locate(event));
    const move = (e: PointerEvent) => { if (e.pointerId === event.pointerId) setDraft(locate(e)); };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      const last = locate(e);
      setDraft(null);
      if (e.type === "pointerup" && last.inside) onAddGuide(axis, last.position);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 6 }}>
      {/* The left ruler measures y (a guide dragged from it is vertical, axis "x"), and vice versa. */}
      <Ruler axis="x" origin={origin} selection={selection} length={width} onDragStart={startDrag("y")} label={labels.horizontal} />
      <Ruler axis="y" origin={origin} selection={selection} length={height} onDragStart={startDrag("x")} label={labels.vertical} />
      <div className="absolute top-0 left-0 border-r border-b border-border bg-background" style={{ width: RULER_SIZE, height: RULER_SIZE }} />
      {draft?.inside && <GuidePreviewLine axis={draft.axis} position={draft.position} origin={origin} format={format} />}
    </div>
  );
}
