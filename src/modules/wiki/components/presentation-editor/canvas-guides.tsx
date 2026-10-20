"use client";
// PowerPoint's drawing guides on the presentation canvas: dashed lines across the visible
// canvas, dragged along their axis (Ctrl/Cmd copies, dropping off the canvas or onto a ruler
// deletes) with a right-click menu. Rendered as a child of <ReactFlow> in presentation-editor.tsx.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReactFlow, useViewport } from "@xyflow/react";
import { PRESENTATION_CM } from "../../lib/presentation-grid";
import type { PresentationElement } from "../../lib/presentation";
import type { PresentationGuide } from "../../lib/presentation-format-model";
import { RULER_SIZE, useRulerOrigin } from "./canvas-rulers";

type Point = { x: number; y: number };
type Drag = { id: string; axis: "x" | "y"; position: number; copy: boolean; outside: boolean };
type Menu = { left: number; top: number; guide: PresentationGuide; point: Point };

/** Half the grab area around a 1 px line, in screen pixels. */
const GRAB = 4;
const LINE = "#64748b";

export function CanvasGuides({ guides, onChange, createId, elements, origin: givenOrigin, format, labels, rulers = false, disabled }: {
  guides: PresentationGuide[];
  onChange: (list: PresentationGuide[]) => void;
  createId: () => string;
  /** Used to find the ruler origin when `origin` is not given. */
  elements: PresentationElement[];
  origin?: Point;
  /** Formats a distance in cm, e.g. "4,50" (de) or "4.50" (en). */
  format: (cm: number) => string;
  labels: { guide: string; addVertical: string; addHorizontal: string; delete: string };
  /** Rulers are showing: a guide dropped onto one is deleted, like dropping it off the canvas. */
  rulers?: boolean;
  disabled?: boolean;
}) {
  const computed = useRulerOrigin(elements);
  const origin = givenOrigin ?? computed;
  const { x: vx, y: vy, zoom } = useViewport();
  const reactFlow = useReactFlow();
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const toScreen = (axis: "x" | "y", position: number) => axis === "x" ? position * zoom + vx : position * zoom + vy;
  // Positions are kept to 1/100 cm from the origin, so the label shows exactly what is stored.
  const round = (axis: "x" | "y", position: number) => origin[axis] + Math.round((position - origin[axis]) / PRESENTATION_CM * 100) / 100 * PRESENTATION_CM;
  const isOutside = (clientX: number, clientY: number) => {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return true;
    const inset = rulers ? RULER_SIZE : 0;
    return clientX < rect.left + inset || clientY < rect.top + inset || clientX > rect.right || clientY > rect.bottom;
  };

  const startDrag = (guide: PresentationGuide) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    setMenu(null);
    const target = event.currentTarget;
    target.focus();
    target.setPointerCapture(event.pointerId);
    const copy = event.ctrlKey || event.metaKey;
    let current: Drag = { id: guide.id, axis: guide.axis, position: guide.position, copy, outside: false };
    let moved = false;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== event.pointerId) return;
      moved = true;
      const point = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      current = { ...current, position: round(guide.axis, point[guide.axis]), outside: isOutside(e.clientX, e.clientY) };
      setDrag(current);
    };
    const end = (e: Event) => {
      if (e instanceof PointerEvent && e.pointerId !== event.pointerId) return;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      window.removeEventListener("presentation-cancel-gesture", end);
      cleanup.current = null;
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      setDrag(null);
      if (e.type !== "pointerup" || !moved) return;
      if (current.outside) { if (!current.copy) onChange(guides.filter(g => g.id !== guide.id)); return; }
      if (current.copy) onChange([...guides, { id: createId(), axis: guide.axis, position: current.position }]);
      else if (current.position !== guide.position) onChange(guides.map(g => g.id === guide.id ? { ...g, position: current.position } : g));
    };
    cleanup.current = () => end(new Event("cancel"));
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    window.addEventListener("presentation-cancel-gesture", end);
  };

  const nudge = (guide: PresentationGuide) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = (event.shiftKey ? 1 : 0.1) * PRESENTATION_CM;
    const delta = guide.axis === "x"
      ? { ArrowLeft: -step, ArrowRight: step }[event.key]
      : { ArrowUp: -step, ArrowDown: step }[event.key];
    if (event.key === "Delete" || event.key === "Backspace") onChange(guides.filter(g => g.id !== guide.id));
    else if (delta) onChange(guides.map(g => g.id === guide.id ? { ...g, position: round(g.axis, g.position + delta) } : g));
    else return;
    // The canvas would otherwise nudge or delete the selected objects as well.
    event.preventDefault();
    event.stopPropagation();
  };

  const addGuide = (axis: "x" | "y", { guide, point }: Menu) => {
    // On the clicked guide's own axis the new one starts 1 cm away, not hidden underneath it.
    const position = axis === guide.axis ? guide.position + PRESENTATION_CM : point[axis];
    onChange([...guides, { id: createId(), axis, position: round(axis, position) }]);
  };

  const shown: (PresentationGuide & { dragging?: Drag })[] = guides.flatMap(guide => {
    if (drag?.id !== guide.id) return [guide];
    // The dragged line keeps its key: it holds the pointer capture. A copy is a new line.
    const moved = { ...guide, id: drag.copy ? `${guide.id}-copy` : guide.id, position: drag.position, dragging: drag };
    return drag.copy ? [guide, moved] : [moved];
  });

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 5 }}>
      {shown.map(guide => {
        const screen = toScreen(guide.axis, guide.position);
        const cm = format(Math.abs((guide.position - origin[guide.axis]) / PRESENTATION_CM));
        const vertical = guide.axis === "x";
        return (
          <div
            key={guide.id}
            data-presentation-overlay
            data-testid="presentation-guide"
            data-axis={guide.axis}
            role="separator"
            aria-orientation={vertical ? "vertical" : "horizontal"}
            aria-label={`${labels.guide} ${cm}`}
            tabIndex={disabled ? -1 : 0}
            className={`group nodrag nopan absolute touch-none outline-none ${disabled ? "" : "pointer-events-auto"} ${guide.dragging?.outside ? "opacity-40" : ""}`}
            style={vertical
              ? { left: screen - GRAB, top: 0, bottom: 0, width: 2 * GRAB + 1, cursor: "ew-resize" }
              : { top: screen - GRAB, left: 0, right: 0, height: 2 * GRAB + 1, cursor: "ns-resize" }}
            onPointerDown={startDrag(guide)}
            onKeyDown={nudge(guide)}
            onContextMenu={event => {
              event.preventDefault();
              event.stopPropagation();
              if (disabled) return;
              setMenu({ left: event.clientX, top: event.clientY, guide, point: reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
            }}
          >
            <div className="absolute" style={{
              ...(vertical ? { left: GRAB, top: 0, bottom: 0, width: 1 } : { top: GRAB, left: 0, right: 0, height: 1 }),
              background: `repeating-linear-gradient(${vertical ? "to bottom" : "to right"}, ${LINE} 0 4px, transparent 4px 7px)`,
            }} />
            <span
              className={`pointer-events-none absolute rounded bg-slate-700 px-1 text-[10px] leading-4 whitespace-nowrap text-white tabular-nums ${guide.dragging ? "" : "hidden group-hover:block group-focus-visible:block"}`}
              style={vertical ? { left: 2 * GRAB + 4, top: (rulers ? RULER_SIZE : 0) + 6 } : { top: 2 * GRAB + 4, left: (rulers ? RULER_SIZE : 0) + 6 }}
            >{cm}</span>
          </div>
        );
      })}
      {menu && <GuideMenu menu={menu} labels={labels} onClose={() => setMenu(null)}
        onAdd={axis => addGuide(axis, menu)} onDelete={() => onChange(guides.filter(g => g.id !== menu.guide.id))} />}
    </div>
  );
}

/** Right-click menu of a guide; portalled so the canvas's own context menu never sees it. */
function GuideMenu({ menu, labels, onClose, onAdd, onDelete }: {
  menu: Menu;
  labels: { addVertical: string; addHorizontal: string; delete: string };
  onClose: () => void;
  onAdd: (axis: "x" | "y") => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The canvas re-renders on every pan; a ref keeps the listeners (and focus) from resetting.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const away = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close.current(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close.current(); } };
    const blur = () => close.current();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const item = (label: string, run: () => void) => (
    <button type="button" role="menuitem" className="flex w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
      onClick={() => { run(); onClose(); }}>{label}</button>
  );
  return createPortal(
    <div ref={ref} role="menu" data-presentation-overlay data-testid="presentation-guide-menu"
      className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: Math.min(menu.left, window.innerWidth - 200), top: Math.min(menu.top, window.innerHeight - 120) }}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }}>
      {item(labels.addVertical, () => onAdd("x"))}
      {item(labels.addHorizontal, () => onAdd("y"))}
      <div className="-mx-1 my-1 h-px bg-border" />
      {item(labels.delete, onDelete)}
    </div>,
    document.body,
  );
}
