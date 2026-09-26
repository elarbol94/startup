"use client";
// Frames as containers and stops in the editor: the edit that inserts elements (naming new
// frames, adding their stops, joining the frame they land in), the drop-target frame while
// dragging, and keeping a frame placed "in the middle" clear of existing frames.
// Used by presentation-editor.tsx and its selection/insertion helpers.
import { useCallback, useMemo, useState, type RefObject } from "react";
import type { useTranslations } from "next-intl";
import type { useReactFlow } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";
import { frameAtPoint, presentationAncestors, presentationCameraBounds, unionBounds, type PresentationCanvasAction, type PresentationElement, type PresentationStep } from "../../lib/presentation";
import { selectionRoots } from "../../lib/presentation-interactions";
import { adoptInsertedElements, appendFrameStops, boundsVisible, clearFramePlacement, isSectionFrame } from "../../lib/presentation-frames";
import type { PresentationNode } from "../presentation-canvas";

type WikiTranslations = ReturnType<typeof useTranslations<"wiki">>;

export const frameNamer = (t: WikiTranslations) => (number: number) => t("presentations.frameName", { number });

/**
 * One separate edit that adds `added` through `update` and settles it: unnamed frames get
 * "Rahmen N", every new frame becomes the last stop, and new roots join the frame they
 * land in -- a single undo step. Step ids are minted here so the updaters stay pure.
 */
export function frameInsertionEdit(
  added: PresentationElement[],
  update: (current: PresentationElement[]) => PresentationElement[],
  t: WikiTranslations,
): Extract<PresentationCanvasAction, { type: "edit" }> {
  const stepIds = added.filter(isSectionFrame).map(() => createId());
  const ids = added.map((element) => element.id);
  const frameName = frameNamer(t);
  return {
    type: "edit", at: Date.now(), separate: true,
    elements: (current) => { const next = update(current); return next === current ? current : adoptInsertedElements(next, ids, frameName); },
    steps: (current: PresentationStep[]) => { let index = 0; return appendFrameStops(current, added, () => stepIds[index++]); },
  };
}

export function usePresentationFrames({ elements, steps, reactFlow, canvasRef }: {
  elements: PresentationElement[];
  steps: PresentationStep[];
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  // An empty deck has nothing to fit: a queued initial fit would zoom onto the first placed element.
  const [openedWithElements] = useState(() => elements.length > 0);
  const [dragRoots, setDragRoots] = useState<string[] | null>(null);
  /** The frame the dragged selection would join if dropped now. */
  const dropTargetId = useMemo(() => {
    const roots = dragRoots ? elements.filter((element) => dragRoots.includes(element.id)) : [];
    const box = unionBounds(roots.map(presentationCameraBounds));
    if (!box) return null;
    return frameAtPoint(elements, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { exclude: dragRoots!, minArea: box.width * box.height })?.id ?? null;
  }, [elements, dragRoots]);
  const trackDrag = useCallback((nodes: { id: string }[] | null) => {
    if (!nodes) { setDragRoots(null); return; }
    const ids = nodes.map((node) => presentationAncestors(elements, node.id).findLast((element) => element.type === "frame" && element.content.isGroup)?.id ?? node.id);
    setDragRoots(selectionRoots(elements, ids).map((element) => element.id));
  }, [elements]);

  /** Keyboard placement of a frame never lands on an existing frame (see clearFramePlacement). */
  const clearPlacement = useCallback((element: PresentationElement): PresentationElement => {
    if (!isSectionFrame(element)) return element;
    return { ...element, ...clearFramePlacement(elements, steps, element) };
  }, [elements, steps]);

  /** Pans (never zooms) so a placed element is on screen. */
  const reveal = useCallback((element: PresentationElement) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const start = reactFlow.screenToFlowPosition({ x: rect.left, y: rect.top });
    const end = reactFlow.screenToFlowPosition({ x: rect.right, y: rect.bottom });
    const bounds = presentationCameraBounds(element);
    if (boundsVisible(bounds, { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y })) return;
    void reactFlow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom: reactFlow.getZoom(), duration: 300 });
  }, [canvasRef, reactFlow]);

  return { dropTargetId, trackDrag, clearPlacement, reveal, openedWithElements };
}
