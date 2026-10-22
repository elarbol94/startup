"use client";
// Inserting a new element: straight into the canvas, or armed as a pending element that
// follows the pointer until the author clicks it into place (Enter puts it mid-view).
// Used by presentation-editor.tsx.
import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import type { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import type { PresentationCanvasAction, PresentationElement } from "../../lib/presentation";
import type { PresentationNode } from "../presentation-canvas";
import { frameInsertionEdit, type usePresentationFrames } from "./use-presentation-frames";
import type { usePresentationTextEditing } from "./use-presentation-text-editing";

export function usePresentationPlacement({ disabled, elements, dispatch, t, setSelectedIds, canvasRef, reactFlow, clearPlacement, reveal, textEditing }: {
  disabled: boolean;
  elements: PresentationElement[];
  dispatch: (action: PresentationCanvasAction) => void;
  t: ReturnType<typeof useTranslations<"wiki">>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  canvasRef: RefObject<HTMLDivElement | null>;
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  clearPlacement: ReturnType<typeof usePresentationFrames>["clearPlacement"];
  reveal: ReturnType<typeof usePresentationFrames>["reveal"];
  textEditing: ReturnType<typeof usePresentationTextEditing>;
}) {
  const [pendingElement, setPendingElement] = useState<PresentationElement | null>(null);

  /** Where a new element lands: the middle of what the author is currently looking at. */
  const viewportCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, [canvasRef, reactFlow]);

  const addElement = useCallback(
    (element: PresentationElement, place = true) => {
      if (disabled) return;
      if (elements.length >= 500) { toast.error(t("presentations.elementLimit")); return; }
      if (place) { setPendingElement(element); canvasRef.current?.focus(); return; }
      dispatch(frameInsertionEdit([element], current => [...current, element], t));
      setSelectedIds([element.id]);
    },
    [canvasRef, dispatch, disabled, elements.length, setSelectedIds, t],
  );

  const placePending = (point: { x: number; y: number }, keyboard = false) => {
    if (!pendingElement || disabled) return;
    const centred = { ...pendingElement, x: point.x - pendingElement.width / 2, y: point.y - pendingElement.height / 2 }, placed = keyboard ? clearPlacement(centred) : centred;
    addElement(placed, false); if (keyboard) reveal(placed);
    setPendingElement(null); canvasRef.current?.focus();
    textEditing.onPlaced(pendingElement, elements.length < 500);
  };

  return { pendingElement, setPendingElement, viewportCenter, addElement, placePending };
}
