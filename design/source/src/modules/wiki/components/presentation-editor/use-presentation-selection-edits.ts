"use client";
// Edits of the selected presentation elements: delete (with their steps), duplicate, z-order
// and copying/pasting an element's format. Used by presentation-editor.tsx.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import { copyPresentationFormat, pastePresentationFormat, type PresentationFormat } from "../../lib/presentation-format";
import { mutableSelection, selectionRoots } from "../../lib/presentation-interactions";
import { duplicatePresentationTree, isPresentationElementLocked, presentationDescendants, reorderElement, type PresentationCanvasAction, type PresentationElement } from "../../lib/presentation";
import { presentationRemovalSet, removePresentationElements } from "../../lib/presentation-frames";
import { frameInsertionEdit } from "./use-presentation-frames";

export function usePresentationSelectionEdits({
  elements, dispatch, disabled, t, commitElements, selection, formatClipboard, setFormatClipboard, setSelectedIds,
}: {
  elements: PresentationElement[];
  dispatch: (action: PresentationCanvasAction) => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations<"wiki">>;
  commitElements: (update: (current: PresentationElement[]) => PresentationElement[]) => void;
  selection: PresentationElement[];
  formatClipboard: PresentationFormat | null;
  setFormatClipboard: Dispatch<SetStateAction<PresentationFormat | null>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
}) {
  /** Deleting takes the steps that pointed at the gone elements with it. A section frame
   * goes alone: its members stay where they are and are released to its parent. */
  const deleteSelection = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const removed = presentationRemovalSet(elements, ids);
      // One action, so deleting an element and the stops that pointed at it is one undo.
      dispatch({
        type: "edit",
        at: Date.now(),
        separate: true,
        elements: (current) => removePresentationElements(current, removed),
        steps: (current) => {
          const next = current.filter((step) => !removed.has(step.elementId));
          return next.length === current.length ? current : next;
        },
      });
      setSelectedIds((current) => current.filter((id) => !removed.has(id)));
    },
    [elements, dispatch, setSelectedIds],
  );

  const duplicateSelection = useCallback(
    (ids: string[]) => {
      if (disabled || !mutableSelection(elements, ids)) return;
      const roots = new Set(selectionRoots(elements, ids).map(element => element.id));
      const included = presentationDescendants(elements, roots);
      if (elements.length + included.size > 500) { toast.error(t("presentations.elementLimit")); return; }
      // Ids are minted here rather than inside the update, which has to stay pure.
      const copies = new Map([...included].map((id) => [id, createId()]));
      const added = elements.filter((element) => included.has(element.id)).map((element) => ({ ...element, id: copies.get(element.id)! }));
      dispatch(frameInsertionEdit(added, current => duplicatePresentationTree(current, roots, copies), t));
      setSelectedIds([...roots].map((id) => copies.get(id)!));
    },
    [disabled, dispatch, elements, t, setSelectedIds],
  );

  const reorderSelected = useCallback(
    (id: string, to: "front" | "back") => {
      commitElements((current) => reorderElement(current, id, to));
    },
    [commitElements],
  );

  const copyObjectFormat = useCallback(() => {
    if (selection.length !== 1) { toast.info(t("presentations.format.selectSource")); return; }
    setFormatClipboard(copyPresentationFormat(selection[0]));
    toast.success(t("presentations.format.copied"));
  }, [selection, t, setFormatClipboard]);
  const pasteObjectFormat = useCallback(() => {
    if (disabled) return;
    const format = formatClipboard;
    if (!format) { toast.info(t("presentations.format.empty")); return; }
    const compatible = selection.filter(e => e.type === format.type && !isPresentationElementLocked(elements, e.id));
    if (!compatible.length) { toast.info(t("presentations.format.selectTarget")); return; }
    const ids = new Set(compatible.map(e => e.id));
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => pastePresentationFormat(current, ids, format) });
    toast.success(t("presentations.format.pasted", { count: compatible.length }));
  }, [disabled, dispatch, elements, selection, t, formatClipboard]);

  return { deleteSelection, duplicateSelection, reorderSelected, copyObjectFormat, pasteObjectFormat };
}
