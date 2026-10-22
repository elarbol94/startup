"use client";
// Rotating and scaling the selection from the overlay's handles. Used by presentation-editor.tsx.
import { useCallback, useRef } from "react";
import type { PresentationBridge } from "../../collaboration/presentation-bridge";
import { presentationDescendants, rotateElements, scaleElements, type PresentationElement } from "../../lib/presentation";

export function usePresentationSelectionTransforms({ commitElements, selectedSet, bridge }: {
  commitElements: (update: (current: PresentationElement[]) => PresentationElement[]) => void;
  selectedSet: Set<string>;
  bridge: PresentationBridge;
}) {
  const rotateSelection = useCallback(
    (deltaDegrees: number, center: { x: number; y: number }) => {
      commitElements((current) => rotateElements(current, selectedSet, deltaDegrees, center));
    },
    [commitElements, selectedSet],
  );

  /** The selection as a scale gesture started: every factor is applied to this, not to the last move. */
  const scaleBase = useRef<PresentationElement[] | null>(null);
  const startScale = useCallback(() => { scaleBase.current = bridge.current().elements; }, [bridge]);
  const scaleSelection = useCallback(
    (scaleX: number, scaleY: number, origin: { x: number; y: number }) => {
      const base = scaleBase.current;
      if (!base) return;
      const scaled = new Map(scaleElements(base, selectedSet, origin, scaleX, scaleY).map((element) => [element.id, element]));
      const moving = presentationDescendants(base, selectedSet);
      // Only the selection takes its geometry from the snapshot; everything else stays live.
      commitElements((current) => current.map((element) => {
        const next = moving.has(element.id) ? scaled.get(element.id) : undefined;
        return next ? { ...element, x: next.x, y: next.y, width: next.width, height: next.height } : element;
      }));
    },
    [commitElements, selectedSet],
  );

  return { rotateSelection, startScale, scaleSelection };
}
