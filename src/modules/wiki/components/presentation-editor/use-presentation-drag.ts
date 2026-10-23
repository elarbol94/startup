"use client";
// A drag on the canvas: the gesture refs (Escape-cancel, Shift axis lock, marquee base), the
// React Flow change batch turned into one snapped geometry edit, and the duplicate drag.
// Used by presentation-editor.tsx.
import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import type { NodeChange, useReactFlow } from "@xyflow/react";
import { selectionRoots } from "../../lib/presentation-interactions";
import { applySelectChanges, dragTargetId } from "../../lib/presentation-selection";
import { PRESENTATION_SNAP_TOLERANCE, type PresentationCanvasAction, type PresentationElement, type PresentationGeometryChange, type SnapGuide } from "../../lib/presentation";
import type { PresentationNode } from "../presentation-canvas";
import { startDuplicateDrag } from "./presentation-duplicate-drag";
import type { usePresentationClickSelection } from "./use-presentation-click-selection";
import type { usePresentationViewSettings } from "./use-presentation-view-settings";

export function usePresentationDrag({ elements, selectedIds, selectedSet, setSelectedIds, disabled, isMac, reactFlow, t, dispatch, endGesture, snapOptions, clickSelection,
  dragCancel: dragCancelRef, cancelledGesture: cancelledGestureRef, marqueeBase: marqueeBaseRef, axisDrag: axisDragRef }: {
  dragCancel: RefObject<(() => void) | null>;
  cancelledGesture: RefObject<boolean>;
  marqueeBase: RefObject<string[]>;
  axisDrag: RefObject<{ positions: Map<string, { x: number; y: number }>; shift: boolean } | null>;
  elements: PresentationElement[];
  selectedIds: string[];
  selectedSet: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  disabled: boolean;
  isMac: boolean;
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  t: ReturnType<typeof useTranslations<"wiki">>;
  dispatch: (action: PresentationCanvasAction) => void;
  endGesture: () => void;
  snapOptions: ReturnType<typeof usePresentationViewSettings>["snapOptions"];
  clickSelection: ReturnType<typeof usePresentationClickSelection>;
}) {
  const [previewGuides, setPreviewGuides] = useState<SnapGuide[]>([]);
  const [dragPreview, setDragPreview] = useState<PresentationElement[] | null>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (axisDragRef.current) axisDragRef.current.shift = event.shiftKey; };
    window.addEventListener("keydown", key); window.addEventListener("keyup", key);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("keyup", key); };
  }, [axisDragRef]);
  useEffect(() => () => dragCancelRef.current?.(), [dragCancelRef]);
  // An Escape-cancelled gesture ignores the rest of that gesture; any new press, wherever it
  // lands (an overlay handle included), starts a fresh one.
  useEffect(() => {
    const press = () => { cancelledGestureRef.current = false; };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, [cancelledGestureRef]);

  /**
   * React Flow reports a whole gesture as one batch of changes, which is what makes group
   * dragging and snapping possible: the moving elements are collected first, aligned as a
   * single box against everything that stayed put, and only then written back.
   */
  const onNodesChange = useCallback(
    (changes: NodeChange<PresentationNode>[]) => {
      const selectChanges = changes.filter((change) => change.type === "select");
      if (selectChanges.length && !clickSelection.ignoreSelectChanges()) {
        const preservedIds = marqueeBaseRef.current;
        setSelectedIds((current) => applySelectChanges(elements, current, selectChanges, preservedIds));
      }

      const geometry = new Map<string, PresentationGeometryChange>();
      const moved = new Set<string>();
      let gesture = false;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          // A press on a group member moves the nearest selected level around it: the whole
          // group, or the member itself once the author has drilled into the group.
          const element = elements.find((element) => element.id === change.id);
          const targetId = dragTargetId(elements, change.id, selectedSet);
          const target = elements.find((element) => element.id === targetId);
          if (targetId !== change.id && target && element) geometry.set(targetId, { id: targetId, x: target.x + change.position.x - element.x, y: target.y + change.position.y - element.y });
          else geometry.set(change.id, { ...geometry.get(change.id), id: change.id, x: change.position.x, y: change.position.y });
          moved.add(targetId);
          if (change.dragging) gesture = true;
        } else if (change.type === "dimensions" && change.dimensions && (change.resizing || change.setAttributes)) {
          // React Flow also reports the dimensions it measured on mount; the reducer drops
          // those, so opening a presentation never looks unsaved.
          geometry.set(change.id, { ...geometry.get(change.id), id: change.id, ...change.dimensions, resizing: true });
          if (change.resizing) gesture = true;
        }
      }
      const ended = changes.some((change) => (change.type === "position" && change.dragging === false)
        || (change.type === "dimensions" && change.resizing === false));
      if (disabled || dragCancelRef.current || cancelledGestureRef.current || !geometry.size) {
        if (ended) endGesture();
        return;
      }
      if (axisDragRef.current?.shift) {
        const first = [...geometry.values()].find(change => change.x !== undefined && change.y !== undefined);
        const original = first && axisDragRef.current.positions.get(first.id);
        if (first && original) {
          const horizontal = Math.abs(first.x! - original.x) >= Math.abs(first.y! - original.y);
          for (const change of geometry.values()) { const e = axisDragRef.current.positions.get(change.id); if (e && !change.resizing) { geometry.set(change.id, horizontal ? { ...change, y: e.y } : { ...change, x: e.x }); } }
        }
      }
      dispatch({
        type: "geometry",
        at: Date.now(),
        changes: [...geometry.values()],
        // The snap has to feel the same at any zoom, so the screen tolerance is converted.
        tolerance: axisDragRef.current?.shift ? 0 : PRESENTATION_SNAP_TOLERANCE / reactFlow.getZoom(),
        gesture, membership: ended && moved.size ? selectionRoots(elements, moved).map((element) => element.id) : undefined, // drop joins/leaves frames in the same undo step
        snap: snapOptions(),
      });
      if (ended) endGesture();
    },
    [reactFlow, disabled, elements, endGesture, dispatch, clickSelection, selectedSet, snapOptions, setSelectedIds, marqueeBaseRef, dragCancelRef, cancelledGestureRef, axisDragRef],
  );

  const duplicateDrag = (event: React.PointerEvent<HTMLDivElement>) => startDuplicateDrag(event, {
    disabled, isMac, elements, selectedIds, reactFlow, t, setPreviewGuides, setDragPreview, dragCancel: dragCancelRef, setSelectedIds, dispatch, snapOptions,
  });

  return { previewGuides, dragPreview, onNodesChange, duplicateDrag };
}
