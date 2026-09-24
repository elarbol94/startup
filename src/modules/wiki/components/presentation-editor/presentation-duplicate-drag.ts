// Ctrl/Cmd (or Option on macOS) drag that previews and drops a snapped copy of the selection
// on the presentation canvas. Used by presentation-editor.tsx.
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import type { useReactFlow } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import { mutableSelection, selectionRoots } from "../../lib/presentation-interactions";
import { PRESENTATION_SNAP_TOLERANCE, duplicatePresentationTree, isPresentationElementLocked, presentationAncestors, presentationCameraBounds, presentationDescendants, snapBounds, unionBounds, type PresentationCanvasAction, type PresentationElement, type SnapGuide } from "../../lib/presentation";
import type { PresentationNode } from "../presentation-canvas";

export function startDuplicateDrag(event: React.PointerEvent<HTMLDivElement>, {
  disabled, isMac, elements, selectedIds, reactFlow, t, setPreviewGuides, setDragPreview, dragCancel, setSelectedIds, dispatch,
}: {
  disabled: boolean;
  isMac: boolean;
  elements: PresentationElement[];
  selectedIds: string[];
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  t: ReturnType<typeof useTranslations<"wiki">>;
  setPreviewGuides: Dispatch<SetStateAction<SnapGuide[]>>;
  setDragPreview: Dispatch<SetStateAction<PresentationElement[] | null>>;
  dragCancel: RefObject<(() => void) | null>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  dispatch: (action: PresentationCanvasAction) => void;
}) {
  if (disabled || event.button !== 0 || !(event.ctrlKey || event.metaKey || (isMac && event.altKey)) || (event.target as HTMLElement).closest("input, textarea, [contenteditable=true], button, .nodrag")) return;
  const node = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node");
  if (!node?.dataset.id) return;
  const ancestor = presentationAncestors(elements, node.dataset.id).findLast(e => e.type === "frame" && e.content.isGroup);
  const targetId = ancestor?.id ?? node.dataset.id;
  const roots = selectionRoots(elements, selectedIds.includes(targetId) ? selectedIds : [targetId]);
  if (!mutableSelection(elements, roots.map(e => e.id))) return;
  event.preventDefault(); event.stopPropagation();
  const included = presentationDescendants(elements, new Set(roots.map(e => e.id)));
  if (elements.length + included.size > 500) { toast.error(t("presentations.elementLimit")); return; }
  const idMap = new Map([...included].map(id => [id, createId()]));
  const source = elements.filter(e => included.has(e.id));
  const copied = duplicatePresentationTree(elements, new Set(roots.map(e => e.id)), idMap).filter(e => [...idMap.values()].includes(e.id));
  const first = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
  let preview = copied, moved = false;
  const move = (moveEvent: PointerEvent) => {
    const point = reactFlow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
    let dx = point.x - first.x, dy = point.y - first.y;
    if (!moved && Math.hypot(dx, dy) * reactFlow.getZoom() < 3) return;
    moved = true;
    if (moveEvent.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    preview = copied.map(copy => { const original = source.find(e => idMap.get(e.id) === copy.id)!; return { ...copy, x: original.x + dx, y: original.y + dy }; });
    const movingBox = unionBounds(preview.filter(e => roots.some(root => idMap.get(root.id) === e.id)))!;
    const targets = elements.filter(e => !(e.type === "shape" && e.content.connection)).map(presentationCameraBounds);
    const snapped = snapBounds(movingBox, movingBox, targets, (moveEvent.altKey && !isMac) || moveEvent.shiftKey ? 0 : PRESENTATION_SNAP_TOLERANCE / reactFlow.getZoom(), false);
    preview = preview.map(e => ({ ...e, x: e.x + snapped.bounds.x - movingBox.x, y: e.y + snapped.bounds.y - movingBox.y }));
    setPreviewGuides(snapped.guides);
    setDragPreview(preview);
  };
  const clear = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); setDragPreview(null); setPreviewGuides([]); dragCancel.current = null; };
  const cancel = () => clear();
  const finish = () => {
    clear();
    if (!moved) { setSelectedIds(event.ctrlKey || event.metaKey ? (selectedIds.includes(targetId) ? selectedIds.filter(id => id !== targetId) : [...selectedIds, targetId]) : [targetId]); return; }
    try {
      dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => {
        if (current.length + preview.length > 500 || source.some(e => !current.some(now => now.id === e.id) || isPresentationElementLocked(current, e.id))) throw new Error("Selection changed");
        return [...current, ...preview];
      } });
      setSelectedIds(roots.map(e => idMap.get(e.id)!));
    } catch { toast.error(t("presentations.commands.unavailable")); }
  };
  dragCancel.current = cancel;
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel);
}
