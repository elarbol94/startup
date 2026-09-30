"use client";
// Rotate/scale handles drawn around the current selection on the presentation canvas.
// Used by presentation-editor.tsx.
import { useEffect, useRef } from "react";
import { ViewportPortal, useReactFlow, useViewport } from "@xyflow/react";
import { RotateCw } from "lucide-react";
import { snapRotation } from "../../lib/presentation-smart-guides";
import type { PresentationBounds } from "../../lib/presentation";

/** A gesture never scales the selection away to nothing. */
const MIN_SCALE = 0.02;
/** Handle size and the rotate handle's stand-off, both in screen pixels. */
const HANDLE_SIZE = 12;
const ROTATE_OFFSET = 28;

/**
 * One overlay handles turning a
 * selection and scaling several elements as one. It is drawn around the union of the
 * selection, so a single element gets a rotation handle and a group gets both.
 */
export function SelectionOverlay({
  bounds,
  scalable,
  rotation,
  referenceAngles,
  rotateLabel,
  scaleLabel,
  onRotate,
  onScale,
  onGestureStart,
  onGestureEnd,
}: {
  onGestureStart: () => void;
  onGestureEnd: () => void;
  bounds: PresentationBounds;
  scalable: boolean;
  rotation: number;
  referenceAngles: number[];
  rotateLabel: string;
  scaleLabel: string;
  onRotate: (deltaDegrees: number, center: { x: number; y: number }) => void;
  onScale: (scaleX: number, scaleY: number, origin: { x: number; y: number }) => void;
}) {
  const { zoom } = useViewport();
  const reactFlow = useReactFlow();
  const screen = (value: number) => value / zoom;
  const cleanupGesture = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupGesture.current?.(), []);

  const beginGesture = (event: React.PointerEvent<HTMLButtonElement>, kind: "rotate" | "scale") => {
    event.preventDefault();
    event.stopPropagation();
    cleanupGesture.current?.();
    onGestureStart();
    const handle = event.currentTarget;
    handle.closest<HTMLElement>("[data-presentation-canvas]")?.focus();
    handle.setPointerCapture(event.pointerId);
    // The anchor is frozen at gesture start: the union bounds shift as the selection turns,
    // and chasing them mid-drag would make the element run away from the pointer.
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const origin = { x: bounds.x, y: bounds.y };
    const size = { width: bounds.width, height: bounds.height };
    const start = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    let lastAngle = Math.atan2(start.y - center.y, start.x - center.x);
    let rawRotation = rotation, appliedRotation = rotation;
    let lastScaleX = 1;
    let lastScaleY = 1;

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const point = reactFlow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      if (kind === "rotate") {
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
      const scaleX = Math.max((point.x - origin.x) / size.width, MIN_SCALE);
      // Shift keeps the proportions, which is the only way to scale a picture safely.
      const scaleY = moveEvent.shiftKey ? scaleX : Math.max((point.y - origin.y) / size.height, MIN_SCALE);
      onScale(scaleX / lastScaleX, scaleY / lastScaleY, origin);
      lastScaleX = scaleX;
      lastScaleY = scaleY;
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      handle.removeEventListener("lostpointercapture", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("presentation-cancel-gesture", end);
      cleanupGesture.current = null;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      onGestureEnd();
    };
    cleanupGesture.current = end;
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("lostpointercapture", end);
    window.addEventListener("blur", end);
    window.addEventListener("presentation-cancel-gesture", end);
  };

  const handleStyle = { width: screen(HANDLE_SIZE), height: screen(HANDLE_SIZE), borderWidth: screen(1) };

  return (
    <ViewportPortal>
      <div
        className="pointer-events-none absolute"
        style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, zIndex: 2100 }}
      >
        {scalable && (
          <div
            className="absolute inset-0 border-dashed border-indigo-500"
            style={{ borderWidth: screen(1) }}
          />
        )}
        <div className="absolute bg-indigo-500" style={{ left: bounds.width / 2, top: -screen(ROTATE_OFFSET), width: screen(1), height: screen(ROTATE_OFFSET) }} />
        <button
          type="button"
          data-testid="presentation-rotate-handle"
          onClick={event => event.stopPropagation()}
          aria-label={rotateLabel}
          title={rotateLabel}
          className="nodrag nopan pointer-events-auto touch-none absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-white bg-indigo-500 active:cursor-grabbing"
          style={{ ...handleStyle, width: screen(20), height: screen(20), left: bounds.width / 2, top: -screen(ROTATE_OFFSET) }}
          onPointerDown={(event) => { if (event.button === 0) beginGesture(event, "rotate"); }}
        ><RotateCw className="h-full w-full p-px text-white" /></button>
        {scalable && (
          <button
            type="button"
            aria-label={scaleLabel}
            title={scaleLabel}
            className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-xs border-white bg-indigo-500"
            style={{ ...handleStyle, left: bounds.width, top: bounds.height }}
            onPointerDown={(event) => beginGesture(event, "scale")}
          />
        )}
      </div>
    </ViewportPortal>
  );
}
