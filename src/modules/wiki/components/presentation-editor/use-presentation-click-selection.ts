"use client";
// Click selection on the presentation canvas: Shift/Ctrl/Cmd-click toggles an object (its
// group, for a group member) and a click on a frame's empty interior selects the frame,
// whose node only paints its outline. Used by presentation-editor.tsx.
import { useCallback, useRef, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from "react";
import type { useReactFlow } from "@xyflow/react";
import type { PresentationElement } from "../../lib/presentation";
import { contextMenuSelection, paneClickSelection, selectionTargetId, toggleSelection } from "../../lib/presentation-selection";
import type { PresentationNode } from "../presentation-canvas";

/** Further than this (screen px) between press and release is a drag, not a click. */
const CLICK_DISTANCE = 4;

export function usePresentationClickSelection({ elements, reactFlow, setSelectedIds, isMac }: {
  elements: PresentationElement[];
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  isMac: boolean;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** Set while React Flow resets its own selection right after a pane click we resolved. */
  const paneClick = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent) => { origin.current = { x: event.clientX, y: event.clientY }; }, []);

  /**
   * Modifier clicks on objects are resolved here rather than by React Flow, which would toggle
   * the clicked group member instead of its group and cannot toggle a locked object off.
   * Ctrl/Cmd (and Option on a Mac) presses may also start a copy drag, so those clicks are
   * always consumed. Returns whether the click was handled.
   */
  const onClickCapture = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>(".react-flow__node");
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!node?.dataset.id || !(additive || (isMac && event.altKey)) || target.closest("input, textarea, [contenteditable=true], button, .nodrag")) return false;
    event.preventDefault(); event.stopPropagation();
    const start = origin.current;
    if (additive && (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= CLICK_DISTANCE)) {
      const id = selectionTargetId(elements, node.dataset.id);
      setSelectedIds((current) => toggleSelection(current, id));
    }
    return true;
  }, [elements, isMac, setSelectedIds]);

  /** A click on empty canvas (never the end of a marquee): the frame under it, or nothing. */
  const onPaneClick = useCallback((event: MouseEvent) => {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    paneClick.current = true;
    queueMicrotask(() => { paneClick.current = false; });
    setSelectedIds((current) => paneClickSelection(elements, current, point, additive));
  }, [elements, reactFlow, setSelectedIds]);

  /** A right-click on empty canvas, before the context menu opens. */
  const onPaneContextMenu = useCallback((event: MouseEvent) => {
    const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setSelectedIds((current) => contextMenuSelection(elements, current, point));
  }, [elements, reactFlow, setSelectedIds]);

  /** React Flow deselects everything after a pane click; the pane click already decided. */
  const ignoreSelectChanges = useCallback(() => paneClick.current, []);

  return { onPointerDown, onClickCapture, onPaneClick, onPaneContextMenu, ignoreSelectChanges };
}
