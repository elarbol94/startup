"use client";
// On-canvas handles of a selected shape beyond resizing: the two ends of a line, which glue
// to another object's connection site when dropped on it (PowerPoint connectors), and the
// yellow adjustment handle that tunes a shape's outline. Used by presentation-canvas.tsx.
import { useEffect, useRef, useState } from "react";
import { ViewportPortal, useReactFlow, useViewport } from "@xyflow/react";
import { useTranslations } from "next-intl";
import type { PresentationElement } from "../../lib/presentation";
import { connectionSites, lineEnds, nearestSite, sitePoint, type ConnectionSite } from "../../lib/presentation-connectors";
import { adjustFromPoint, adjustHandlePoint, adjustableShapeKinds } from "../../lib/presentation-shape-geometry";
import { presetHandles, solvePresetHandle } from "../../lib/preset-shapes/preset-geometry";

type Point = { x: number; y: number };
type Shape = Extract<PresentationElement, { type: "shape" }>;
export type LineEndDrop = { elementId: string; site: ConnectionSite } | { point: Point };

/** What a dragged line end may glue to: anything but frames, groups and other lines. */
function glueTarget(element: PresentationElement | undefined, self: string) {
  if (!element || element.id === self || element.type === "frame") return undefined;
  if (element.type === "shape" && (["line", "arrow", "doubleArrow"].includes(element.content.shape) || element.content.connection)) return undefined;
  return element;
}

export function LineEndHandles({ element, lookup, onDrop }: {
  element: Shape;
  lookup: (id: string) => PresentationElement | undefined;
  onDrop: (end: 0 | 1, drop: LineEndDrop) => void;
}) {
  const { zoom } = useViewport();
  const flow = useReactFlow();
  const t = useTranslations("wiki.presentations.interactions");
  const [draft, setDraft] = useState<{ end: 0 | 1; point: Point; target?: PresentationElement; site?: ConnectionSite } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const ends = lineEnds(element);

  const begin = (event: React.PointerEvent<HTMLButtonElement>, end: 0 | 1) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const handle = event.currentTarget, pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    const fixed = ends[end === 0 ? 1 : 0];
    let latest: { point: Point; target?: PresentationElement; site?: ConnectionSite } | null = null;
    const locate = (moveEvent: PointerEvent) => {
      let point = flow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      const id = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY)
        .map((node) => node.closest<HTMLElement>(".react-flow__node")?.dataset.id).find((id) => id && glueTarget(lookup(id), element.id));
      const target = id ? lookup(id) : undefined;
      if (!target && moveEvent.shiftKey) {
        // Shift keeps a free end on 45° steps from the other end.
        const angle = Math.round(Math.atan2(point.y - fixed.y, point.x - fixed.x) / (Math.PI / 4)) * Math.PI / 4;
        const length = Math.hypot(point.x - fixed.x, point.y - fixed.y);
        point = { x: fixed.x + Math.cos(angle) * length, y: fixed.y + Math.sin(angle) * length };
      }
      latest = { point, target, site: target ? nearestSite(target, point) : undefined };
      setDraft({ end, ...latest });
    };
    const clear = () => {
      setDraft(null);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", locate); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", clear); window.removeEventListener("keydown", key); window.removeEventListener("blur", clear);
      cleanup.current = null;
    };
    const finish = () => {
      const drop = latest; clear();
      if (!drop) return;
      onDrop(end, drop.target && drop.site ? { elementId: drop.target.id, site: drop.site } : { point: drop.point });
    };
    const key = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopPropagation(); clear(); } };
    cleanup.current = clear;
    window.addEventListener("pointermove", locate); window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", clear); window.addEventListener("keydown", key); window.addEventListener("blur", clear);
  };

  const tip = draft ? (draft.target && draft.site ? sitePoint(draft.target, draft.site) : draft.point) : null;
  const glued = (end: 0 | 1) => Boolean(end === 0 ? element.content.connection?.fromId : element.content.connection?.toId);
  return <ViewportPortal>
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 2000 }}>
      {draft && tip && <svg className="absolute overflow-visible" style={{ left: 0, top: 0 }} aria-hidden data-testid="presentation-line-preview">
        <line x1={ends[draft.end === 0 ? 1 : 0].x} y1={ends[draft.end === 0 ? 1 : 0].y} x2={tip.x} y2={tip.y} stroke="#6366f1" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
        {draft.target && connectionSites(draft.target).map((site) => { const p = sitePoint(draft.target!, site); return <circle key={site} data-connection-site={site} cx={p.x} cy={p.y} r={(site === draft.site ? 7 : 5) / zoom} fill={site === draft.site ? "#6366f1" : "#fff"} stroke="#6366f1" strokeWidth={1.5 / zoom} />; })}
      </svg>}
      {([0, 1] as const).map((end) => <button key={end} type="button" aria-label={t(end === 0 ? "startPoint" : "endPoint")} data-line-end={end} data-glued={glued(end) || undefined}
        className="nodrag nopan pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{ left: ends[end].x, top: ends[end].y, width: 12 / zoom, height: 12 / zoom, background: glued(end) ? "#16a34a" : "#6366f1" }}
        onClick={(event) => event.stopPropagation()} onPointerDown={(event) => begin(event, end)} />)}
    </div>
  </ViewportPortal>;
}

/** A shape's yellow adjustment handles: a preset's own (any number), or the older kinds' one. */
export function AdjustHandle({ element, onAdjust, onGestureStart, onGestureEnd }: {
  element: Shape;
  onAdjust: (patch: { adjust?: number; cornerRadius?: number; adjustments?: Record<string, number> }) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}) {
  const { zoom } = useViewport();
  const flow = useReactFlow();
  const t = useTranslations("wiki.presentations.interactions");
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const { shape, adjust, cornerRadius, preset, adjustments } = element.content;
  const points: Point[] = preset
    ? presetHandles(preset, element.width, element.height, adjustments)
    : [adjustableShapeKinds.has(shape) ? adjustHandlePoint(shape, element.width, element.height, adjust, shape === "roundedRect" ? cornerRadius ?? 20 : undefined) : null].filter((point): point is Point => Boolean(point));
  if (!points.length) return null;

  const begin = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); cleanup.current?.();
    const handle = event.currentTarget, pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    onGestureStart?.();
    const centre = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
    const angle = -element.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const start = adjustments ?? {};
    const move = (moveEvent: PointerEvent) => {
      const p = flow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      // Into the shape's own unrotated box.
      const dx = p.x - centre.x, dy = p.y - centre.y;
      const local = { x: dx * cos - dy * sin + element.width / 2, y: dx * sin + dy * cos + element.height / 2 };
      onAdjust(preset ? { adjustments: solvePresetHandle(preset, element.width, element.height, start, index, local) } : adjustFromPoint(shape, element.width, element.height, local));
    };
    const end = () => {
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end); window.removeEventListener("blur", end);
      window.removeEventListener("presentation-cancel-gesture", end);
      cleanup.current = null;
      onGestureEnd?.();
    };
    cleanup.current = end;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end); window.addEventListener("blur", end);
    window.addEventListener("presentation-cancel-gesture", end);
  };

  return <ViewportPortal>
    <div className="pointer-events-none absolute" style={{ left: element.x, top: element.y, width: element.width, height: element.height, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined, zIndex: 2050 }}>
      {points.map((point, index) => <button key={index} type="button" aria-label={t("adjustHandle")} title={t("adjustHandle")} data-testid="presentation-adjust-handle"
        className="nodrag nopan pointer-events-auto absolute touch-none border border-amber-700 bg-amber-300"
        style={{ left: point.x, top: point.y, width: 11 / zoom, height: 11 / zoom, borderWidth: 1 / zoom, transform: "translate(-50%, -50%) rotate(45deg)", cursor: "pointer" }}
        onClick={(clickEvent) => clickEvent.stopPropagation()} onPointerDown={(pointerEvent) => begin(pointerEvent, index)} />)}
    </div>
  </ViewportPortal>;
}
