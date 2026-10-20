"use client";
// PowerPoint's Edit Points on a freeform shape: black vertex squares, Bézier handles of the
// selected vertex, drag to move, Ctrl+click to add or delete, right-click menu, Delete and
// Escape. Rendered inside React Flow by presentation-editor.tsx; geometry lives in
// lib/presentation-path-edit.
import { useEffect, useMemo, useRef, useState } from "react";
import { ViewportPortal, useReactFlow, useViewport } from "@xyflow/react";
import type { PresentationElement } from "../../lib/presentation-model";
import {
  addNodeOnSegment, closePath, deleteNode, fitFreeform, freeformPathModel, freeformTransform, isCurvedSegment, mapPath, moveHandle, moveNode,
  nearestSegmentPoint, openPath, openSegment, segmentCount, serializePath, setNodeType, setSegmentCurved, setSegmentStraight,
  type NodeRef, type PathModel, type PathPoint, type SegmentRef,
} from "../../lib/presentation-path-edit";
import { EditPointsMenu, type EditPointsMenuItem } from "./edit-points-menu";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type MenuTarget = { kind: "node"; ref: NodeRef } | { kind: "segment"; ref: SegmentRef; t: number };

/** Vertex and handle squares, the outline's hit width and the drag threshold, in screen pixels. */
const VERTEX = 7, HANDLE = 7, HIT = 10, DRAG_THRESHOLD = 3;

export type EditPointsLabels = Record<
  "title" | "addPoint" | "deletePoint" | "openPath" | "closePath" | "smoothPoint" | "straightPoint" | "cornerPoint" | "straightSegment" | "curvedSegment" | "exit" | "vertex" | "handle",
  string
>;

export function EditPointsOverlay({ element, onChange, onCommitStart, onCommitEnd, onExit, labels }: {
  /** A shape with `content.freeform` (convert presets first with `toEditableFreeform`). */
  element: Shape;
  onChange: (next: Shape) => void;
  /** Before the first change of a gesture or menu command (one undo step each). */
  onCommitStart: () => void;
  onCommitEnd: () => void;
  onExit: () => void;
  labels: Record<string, string>;
}) {
  const { zoom } = useViewport();
  const reactFlow = useReactFlow();
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Only the window listeners read this; gestures and menu commands use the props they start with.
  const latest = useRef<{ element: Shape; selected: NodeRef | null; menu: unknown; onExit: () => void; onChange: (next: Shape) => void; onCommitStart: () => void; onCommitEnd: () => void } | null>(null);
  useEffect(() => { latest.current = { element, selected: selected && { ...selected }, menu, onExit, onChange, onCommitStart, onCommitEnd }; });
  const cleanupGesture = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupGesture.current?.(), []);

  const model = useMemo(() => freeformPathModel(element), [element]);
  const f = element.content.freeform;
  const sx = f ? element.width / f.w : 1, sy = f ? element.height / f.h : 1;
  const toLocal = (p: PathPoint) => ({ x: p.x * sx, y: p.y * sy });
  const local = useMemo(() => model && mapPath(model, (p) => ({ x: p.x * sx, y: p.y * sy })), [model, sx, sy]);


  // Escape ends editing, Delete removes the selected vertex, a press elsewhere ends editing.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!latest.current) return;
      const { menu: open, selected: vertex, onExit: exit, element: current, onChange: change, onCommitStart: start, onCommitEnd: end } = latest.current;
      if (open || (event.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable=true]")) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); exit(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && vertex) {
        event.preventDefault(); event.stopPropagation();
        const base = freeformPathModel(current), next = base && deleteNode(base, vertex);
        if (next) { start(); change(fitFreeform(current, next)); end(); }
        setSelected(null);
      }
    };
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!latest.current || latest.current.menu || rootRef.current?.contains(target) || target?.closest?.("[data-testid=presentation-edit-points-menu]")) return;
      latest.current.onExit();
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", away, true);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("pointerdown", away, true); };
  }, []);

  if (!model || !local || !f) return null;
  const unit = 1 / zoom;
  /** One undoable edit of the path as it is drawn now. */
  const apply = (edit: (current: PathModel) => PathModel | null) => {
    const next = edit(model);
    if (!next) return;
    onCommitStart(); onChange(fitFreeform(element, next)); onCommitEnd();
  };
  const pointerLocal = (event: { clientX: number; clientY: number }, shape: Shape) => {
    const point = freeformTransform(shape).fromCanvas(reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    const f2 = shape.content.freeform!;
    return { model: point, local: { x: point.x * shape.width / f2.w, y: point.y * shape.height / f2.h } };
  };

  /** A drag: each move rebuilds the path from the shape as it was when the drag began. */
  const beginDrag = (event: React.PointerEvent<SVGElement>, step: (point: PathPoint, base: PathModel) => PathModel | null, threshold = 0) => {
    event.preventDefault();
    event.stopPropagation();
    cleanupGesture.current?.();
    const startElement = element, base = model;
    const transform = freeformTransform(startElement), target = event.currentTarget, pointerId = event.pointerId;
    const origin = { x: event.clientX, y: event.clientY };
    let started = false;
    target.setPointerCapture(pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (!started) {
        if (Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) < threshold) return;
        started = true; onCommitStart();
      }
      const next = step(transform.fromCanvas(reactFlow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY })), base);
      if (next) onChange(fitFreeform(startElement, next));
    };
    const end = () => {
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("presentation-cancel-gesture", end);
      cleanupGesture.current = null;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      if (started) onCommitEnd();
    };
    cleanupGesture.current = end;
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
    window.addEventListener("blur", end);
    window.addEventListener("presentation-cancel-gesture", end);
  };

  const onVertexDown = (event: React.PointerEvent<SVGElement>, ref: NodeRef) => {
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault(); event.stopPropagation();
      apply((current) => deleteNode(current, ref));
      setSelected(null);
      return;
    }
    setSelected(ref);
    beginDrag(event, (point, base) => moveNode(base, ref, point));
  };

  const onOutlineDown = (event: React.PointerEvent<SVGElement>) => {
    if (event.button !== 0) return;
    const hit = nearestSegmentPoint(local, pointerLocal(event, element).local);
    if (!hit) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault(); event.stopPropagation();
      const added = addNodeOnSegment(model, hit, hit.t);
      if (added) { apply(() => added.model); setSelected(added.node); }
      return;
    }
    // Dragging the outline pulls a new vertex out of it, as in PowerPoint.
    setSelected(null);
    beginDrag(event, (point, base) => {
      const added = addNodeOnSegment(base, hit, hit.t);
      if (!added) return null;
      setSelected(added.node);
      return moveNode(added.model, added.node, point);
    }, DRAG_THRESHOLD);
  };

  const onHandleDown = (event: React.PointerEvent<SVGElement>) => {
    const which = event.currentTarget.dataset.editHandle === "in" ? "in" : "out", ref = selected;
    if (event.button === 0 && ref) beginDrag(event, (point, base) => moveHandle(base, ref, which, point));
  };

  const openMenu = (event: React.MouseEvent<SVGElement>, target: MenuTarget) => {
    event.preventDefault(); event.stopPropagation();
    if (target.kind === "node") setSelected(target.ref);
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  const menuItems = (target: MenuTarget): EditPointsMenuItem[] => {
    const path = model.subpaths[target.ref.subpath];
    if (!path) return [];
    const pathToggle: EditPointsMenuItem = path.closed
      ? { key: "openPath", label: labels.openPath, run: () => apply((current) => target.kind === "node" ? openPath(current, target.ref) : openSegment(current, target.ref)) }
      : { key: "closePath", label: labels.closePath, run: () => apply((current) => closePath(current, target.ref.subpath)), disabled: path.nodes.length < 2 };
    const exit: EditPointsMenuItem = { key: "exit", label: labels.exit, run: onExit, separatorBefore: true };
    if (target.kind === "segment") {
      const curved = isCurvedSegment(path, target.ref.segment);
      return [
        { key: "addPoint", label: labels.addPoint, run: () => { const added = addNodeOnSegment(model, target.ref, target.t); if (added) { apply(() => added.model); setSelected(added.node); } } },
        pathToggle,
        { key: "straightSegment", label: labels.straightSegment, checked: !curved, separatorBefore: true, run: () => apply((current) => setSegmentStraight(current, target.ref)) },
        { key: "curvedSegment", label: labels.curvedSegment, checked: curved, run: () => apply((current) => setSegmentCurved(current, target.ref)) },
        exit,
      ];
    }
    const ref = target.ref, type = path.nodes[ref.node]?.type;
    const segment = ref.node < segmentCount(path) ? ref.node : ref.node - 1;
    return [
      { key: "addPoint", label: labels.addPoint, disabled: segment < 0, run: () => { const added = addNodeOnSegment(model, { subpath: ref.subpath, segment }, 0.5); if (added) { apply(() => added.model); setSelected(added.node); } } },
      { key: "deletePoint", label: labels.deletePoint, disabled: !deleteNode(model, ref), run: () => { apply((current) => deleteNode(current, ref)); setSelected(null); } },
      pathToggle,
      { key: "smoothPoint", label: labels.smoothPoint, checked: type === "smooth", separatorBefore: true, run: () => apply((current) => setNodeType(current, ref, "smooth")) },
      { key: "straightPoint", label: labels.straightPoint, checked: type === "straight", run: () => apply((current) => setNodeType(current, ref, "straight")) },
      { key: "cornerPoint", label: labels.cornerPoint, checked: type === "corner", run: () => apply((current) => setNodeType(current, ref, "corner")) },
      exit,
    ];
  };

  const d = serializePath(local);
  const active = selected && model.subpaths[selected.subpath]?.nodes[selected.node];
  const handles = active ? (["in", "out"] as const).filter((which) => active[which]).map((which) => ({ which, point: toLocal(active[which]!) })) : [];
  const activeLocal = active ? toLocal(active) : null;

  return (
    <>
      <ViewportPortal>
        <div ref={rootRef} data-presentation-overlay data-testid="presentation-edit-points" aria-label={labels.title} className="pointer-events-none absolute"
          style={{ left: element.x, top: element.y, width: element.width, height: element.height, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined, zIndex: 2150 }}>
          <svg className="nodrag nopan absolute top-0 left-0" width={element.width} height={element.height} style={{ overflow: "visible", pointerEvents: "none" }}>
            <path d={d} fill="none" stroke="#c00000" strokeWidth={unit} pointerEvents="none" />
            <path d={d} fill="none" stroke="transparent" strokeWidth={HIT * unit} pointerEvents="stroke" style={{ cursor: "crosshair" }}
              data-testid="presentation-edit-points-outline"
              onPointerDown={onOutlineDown}
              onContextMenu={(event) => {
                const hit = nearestSegmentPoint(local, pointerLocal(event, element).local);
                if (hit) openMenu(event, { kind: "segment", ref: { subpath: hit.subpath, segment: hit.segment }, t: hit.t });
                else { event.preventDefault(); event.stopPropagation(); }
              }} />
            {activeLocal && handles.map(({ which, point }) => (
              <line key={`line-${which}`} x1={activeLocal.x} y1={activeLocal.y} x2={point.x} y2={point.y} stroke="#000" strokeWidth={unit} pointerEvents="none" />
            ))}
            {selected && handles.map(({ which, point }) => (
              <rect key={which} data-edit-handle={which} aria-label={labels.handle} x={point.x - HANDLE * unit / 2} y={point.y - HANDLE * unit / 2} width={HANDLE * unit} height={HANDLE * unit}
                fill="#fff" stroke="#000" strokeWidth={unit} pointerEvents="all" style={{ cursor: "move" }}
                onPointerDown={onHandleDown}
                onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }} />
            ))}
            {model.subpaths.map((path, s) => path.nodes.map((node, i) => {
              const p = toLocal(node), isSelected = selected?.subpath === s && selected.node === i;
              return (
                <rect key={`${s}:${i}`} data-edit-point={`${s}:${i}`} aria-label={labels.vertex} aria-selected={isSelected}
                  x={p.x - VERTEX * unit / 2} y={p.y - VERTEX * unit / 2} width={VERTEX * unit} height={VERTEX * unit}
                  fill={isSelected ? "#fff" : "#000"} stroke={isSelected ? "#000" : "#fff"} strokeWidth={unit} pointerEvents="all" style={{ cursor: "move" }}
                  onPointerDown={(event) => onVertexDown(event, { subpath: s, node: i })}
                  onContextMenu={(event) => openMenu(event, { kind: "node", ref: { subpath: s, node: i } })} />
              );
            }))}
          </svg>
        </div>
      </ViewportPortal>
      {menu && <EditPointsMenu position={{ x: menu.x, y: menu.y }} items={menuItems(menu.target)} label={labels.title} onClose={() => setMenu(null)} />}
    </>
  );
}
