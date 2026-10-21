"use client";
// Click selection on the presentation canvas: Shift/Ctrl/Cmd-click toggles an object (its
// group, for a group member), a second click on a selected group drills into it, and a
// click on empty canvas -- also inside a frame -- clears the selection, as on a slide.
// Used by presentation-editor.tsx.
import { useCallback, useRef, type Dispatch, type MouseEvent, type PointerEvent, type SetStateAction } from "react";
import { useStoreApi, type useReactFlow } from "@xyflow/react";
import type { PresentationElement } from "../../lib/presentation";
import { contextMenuSelection, dragTargetId, drillSelectionTargetId, paneClickSelection, selectionPath, selectionTargetId, toggleSelection } from "../../lib/presentation-selection";
import type { PresentationNode } from "../presentation-canvas";

/** Further than this (screen px) between press and release is a drag, not a click. */
const CLICK_DISTANCE = 4;

export function usePresentationClickSelection({ elements, reactFlow, selectedIds, setSelectedIds, isMac, onClickSelected }: {
  elements: PresentationElement[];
  /** A single click on the object that already was the whole selection (PowerPoint: click into its text). */
  onClickSelected?: (id: string, point: { x: number; y: number }) => void;
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  selectedIds: string[];
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  isMac: boolean;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** The selection when the button went down, before React Flow selected what was pressed. */
  const pressSelection = useRef<string[]>([]);
  /** Set while React Flow resets its own selection right after a pane click we resolved. */
  const paneClick = useRef(false);

  const flowStore = useStoreApi<PresentationNode>();
  /**
   * Pressing a member of a selected group: React Flow only drags what *it* considers selected,
   * plus the pressed node, and would first select that node alone. Marking the member selected
   * in its store for this press makes it drag the whole selection -- the group and everything
   * selected beside it -- as PowerPoint does. The next render restores the store from props.
   */
  const pressGroupMember = useCallback((event: PointerEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const id = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node")?.dataset.id;
    const selected = new Set(selectedIds);
    if (!id || selected.has(id) || !selected.has(dragTargetId(elements, id, selected))) return;
    const node = flowStore.getState().nodeLookup.get(id);
    if (node) node.selected = true;
  }, [elements, flowStore, selectedIds]);

  const onPointerDown = useCallback((event: PointerEvent) => { origin.current = { x: event.clientX, y: event.clientY }; pressSelection.current = selectedIds; }, [selectedIds]);

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
    if (!node?.dataset.id || target.closest("input, textarea, [contenteditable=true], button, .nodrag")) return false;
    const start = origin.current;
    const click = !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) <= CLICK_DISTANCE;
    const id = node.dataset.id;
    if (!(additive || (isMac && event.altKey))) {
      // Drill in only when the group around the click was already selected before this press;
      // the press itself selects the group, and that must not count as the first click.
      const pressed = pressSelection.current;
      // `detail` 1 only: the second click of a double-click keeps its own meaning.
      if (click && event.detail === 1 && pressed.length === 1 && pressed[0] === id) { onClickSelected?.(id, { x: event.clientX, y: event.clientY }); return false; }
      if (click && selectionPath(elements, id).slice(0, -1).some((level) => pressed.includes(level))) {
        const next = drillSelectionTargetId(elements, id, pressed);
        setSelectedIds((current) => current.length === 1 && current[0] === next ? current : [next]);
      }
      return false;
    }
    event.preventDefault(); event.stopPropagation();
    if (additive && click) setSelectedIds((current) => toggleSelection(current, selectionTargetId(elements, id, current)));
    return true;
  }, [elements, isMac, setSelectedIds, onClickSelected]);

  /** A click on empty canvas (never the end of a marquee): clears, or keeps with a modifier. */
  const onPaneClick = useCallback((event: MouseEvent) => {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    paneClick.current = true;
    queueMicrotask(() => { paneClick.current = false; });
    setSelectedIds((current) => paneClickSelection(current, additive));
  }, [setSelectedIds]);

  /** A right-click on empty canvas, before the context menu opens. */
  const onPaneContextMenu = useCallback((event: MouseEvent) => {
    const point = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setSelectedIds((current) => contextMenuSelection(elements, current, point));
  }, [elements, reactFlow, setSelectedIds]);

  /** React Flow deselects everything after a pane click; the pane click already decided. */
  const ignoreSelectChanges = useCallback(() => paneClick.current, []);

  return { pressGroupMember, onPointerDown, onClickCapture, onPaneClick, onPaneContextMenu, ignoreSelectChanges };
}
