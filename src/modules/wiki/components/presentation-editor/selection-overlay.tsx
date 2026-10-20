"use client";
// Rotate/scale handles drawn around the current selection on the presentation canvas.
// Used by presentation-editor.tsx.
import { useEffect, useRef } from "react";
import { ViewportPortal, useReactFlow, useViewport } from "@xyflow/react";
import { RotateCw } from "lucide-react";
import { snapRotation } from "../../lib/presentation-smart-guides";
import type { PresentationBounds, PresentationElement } from "../../lib/presentation";
import { selectionScale } from "../../lib/presentation-selection-scale";

/** Handle size and the rotate handle's stand-off, both in screen pixels. */
const HANDLE_SIZE = 10;
const ROTATE_OFFSET = 28;
const SCALE_HANDLES = [-1, 0, 1].flatMap(y => [-1, 0, 1].filter(x => x || y).map(x => ({ x, y })));
const cursorFor = (x: number, y: number) => x === 0 ? "ns-resize" : y === 0 ? "ew-resize" : x === y ? "nwse-resize" : "nesw-resize";

/**
 * The handles around a selection, like PowerPoint's: a single object gets its rotate handle on
 * its own (rotated) top edge -- its resize handles come from the node -- and several objects
 * get an outline each plus eight handles on the box around all of them, scaling them together.
 */
export function SelectionOverlay({
  box,
  rotation,
  outlines,
  scalable,
  referenceAngles,
  rotateLabel,
  scaleLabel,
  onRotate,
  onScaleStart,
  onScale,
  onGestureStart,
  onGestureEnd,
}: {
  onGestureStart: () => void;
  onGestureEnd: () => void;
  /** The unrotated box the handles sit on: the object itself, or the union of several. */
  box: PresentationBounds;
  /** Rotation of `box` around its centre, in degrees; 0 for a multi-selection. */
  rotation: number;
  /** Each selected object, outlined individually when several are selected. */
  outlines: PresentationElement[];
  scalable: boolean;
  referenceAngles: number[];
  rotateLabel: string;
  scaleLabel: string;
  onRotate: (deltaDegrees: number, center: { x: number; y: number }) => void;
  /** A scale gesture starts: later `onScale` factors are relative to the selection right now. */
  onScaleStart: () => void;
  onScale: (scaleX: number, scaleY: number, origin: { x: number; y: number }) => void;
}) {
  const { zoom } = useViewport();
  const reactFlow = useReactFlow();
  const screen = (value: number) => value / zoom;
  const cleanupGesture = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupGesture.current?.(), []);

  const beginGesture = (event: React.PointerEvent<HTMLButtonElement>, handle: { x: number; y: number } | null) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupGesture.current?.();
    onGestureStart();
    if (handle) onScaleStart();
    const target = event.currentTarget;
    target.closest<HTMLElement>("[data-presentation-canvas]")?.focus();
    target.setPointerCapture(event.pointerId);
    // Frozen at gesture start: the box shifts as the selection changes, and chasing it
    // mid-drag would make the selection run away from the pointer.
    const start = { ...box };
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const pointer = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    let lastAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
    let rawRotation = rotation, appliedRotation = rotation;

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const point = reactFlow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      if (!handle) {
        const angle = Math.atan2(point.y - center.y, point.x - center.x);
        let delta = (angle - lastAngle) * 180 / Math.PI;
        if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
        rawRotation += delta;
        // Pointer rotation uses whole-degree steps; numeric controls retain fractional angles.
        const snapped = Math.round(snapRotation(rawRotation, referenceAngles, moveEvent.shiftKey, moveEvent.altKey));
        onRotate(snapped - appliedRotation, center);
        appliedRotation = snapped;
        lastAngle = angle;
        return;
      }
      const { scaleX, scaleY, origin } = selectionScale(start, handle, point, moveEvent.shiftKey, moveEvent.altKey);
      onScale(scaleX, scaleY, origin);
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.removeEventListener("lostpointercapture", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("presentation-cancel-gesture", end);
      cleanupGesture.current = null;
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      onGestureEnd();
    };
    cleanupGesture.current = end;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
    target.addEventListener("lostpointercapture", end);
    window.addEventListener("blur", end);
    window.addEventListener("presentation-cancel-gesture", end);
  };

  return (
    <ViewportPortal>
      {scalable && outlines.map(element => (
        <div key={element.id} data-testid="presentation-selection-outline" className="pointer-events-none absolute border-indigo-500" aria-hidden
          style={{ left: element.x, top: element.y, width: element.width, height: element.height, borderWidth: screen(1), transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined, zIndex: 2090 }} />
      ))}
      <div
        className="pointer-events-none absolute"
        data-testid="presentation-selection-box"
        style={{ left: box.x, top: box.y, width: box.width, height: box.height, transform: rotation ? `rotate(${rotation}deg)` : undefined, zIndex: 2100 }}
      >
        {scalable && <div className="absolute inset-0 border-dashed border-indigo-500" style={{ borderWidth: screen(1) }} />}
        <div className="absolute bg-indigo-500" style={{ left: box.width / 2, top: -screen(ROTATE_OFFSET), width: screen(1), height: screen(ROTATE_OFFSET) }} />
        <button
          type="button"
          data-testid="presentation-rotate-handle"
          onClick={event => event.stopPropagation()}
          aria-label={rotateLabel}
          title={rotateLabel}
          className="nodrag nopan pointer-events-auto touch-none absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-white bg-indigo-500 active:cursor-grabbing"
          style={{ width: screen(20), height: screen(20), borderWidth: screen(1), left: box.width / 2, top: -screen(ROTATE_OFFSET) }}
          onPointerDown={(event) => beginGesture(event, null)}
        ><RotateCw className="h-full w-full p-px text-white" /></button>
        {scalable && SCALE_HANDLES.map(({ x, y }) => (
          <button
            key={`${x},${y}`}
            type="button"
            aria-label={scaleLabel}
            title={scaleLabel}
            data-scale-handle={`${x},${y}`}
            className="nodrag nopan pointer-events-auto touch-none absolute -translate-x-1/2 -translate-y-1/2 rounded-xs border-indigo-500 bg-background"
            style={{ width: screen(HANDLE_SIZE), height: screen(HANDLE_SIZE), borderWidth: screen(1), left: `${(x + 1) * 50}%`, top: `${(y + 1) * 50}%`, cursor: cursorFor(x, y) }}
            onClick={event => event.stopPropagation()}
            onPointerDown={(event) => beginGesture(event, { x, y })}
          />
        ))}
      </div>
    </ViewportPortal>
  );
}
