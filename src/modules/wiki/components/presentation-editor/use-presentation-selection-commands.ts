"use client";
// Grouping, text-editing and locking commands for the presentation selection.
// Used by presentation-editor.tsx.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import { ungroupSteps } from "../../lib/presentation-interactions";
import { groupPresentationElements, ungroupPresentationElements, type PresentationCanvasAction, type PresentationElement, type PresentationStep } from "../../lib/presentation";

export function usePresentationSelectionCommands({
  selected, selectedIds, selectedRoots, canMutate, elements, steps, dispatch, setSelectedIds, startTextEditing, t,
}: {
  selected: PresentationElement | null;
  selectedIds: string[];
  selectedRoots: PresentationElement[];
  canMutate: boolean;
  elements: PresentationElement[];
  steps: PresentationStep[];
  dispatch: (action: PresentationCanvasAction) => void;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  startTextEditing: (id: string) => void;
  t: ReturnType<typeof useTranslations<"wiki">>;
}) {
  const groupSelection = useCallback(() => {
    if (!canMutate || selectedRoots.length < 2 || elements.length >= 500) return;
    const id = createId();
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => groupPresentationElements(current, new Set(selectedRoots.map(e => e.id)), id) });
    setSelectedIds([id]);
  }, [canMutate, selectedRoots, elements.length, dispatch, setSelectedIds]);
  const ungroupSelection = useCallback(() => {
    if (!canMutate) return;
    const groups = new Set(selectedRoots.filter(e => e.type === "frame" && e.content.isGroup).map(e => e.id));
    const nextSteps = ungroupSteps(steps, elements, groups, createId);
    if (nextSteps.length > 500) { toast.error(t("presentations.elementLimit")); return; }
    dispatch({ type: "edit", at: Date.now(), separate: true,
      elements: current => [...groups].reduce((next, id) => ungroupPresentationElements(next, id), current), steps: () => nextSteps });
    setSelectedIds(elements.filter(e => e.parentId && groups.has(e.parentId)).map(e => e.id));
  }, [canMutate, selectedRoots, steps, elements, dispatch, t, setSelectedIds]);
  const editText = useCallback(() => {
    if (selected?.type !== "text" || !canMutate) return;
    startTextEditing(selected.id);
  }, [selected, canMutate, startTextEditing]);
  const setSelectionLocked = useCallback((locked: boolean) => {
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => current.map(e => selectedIds.includes(e.id) ? { ...e, locked } : e) });
  }, [dispatch, selectedIds]);

  return { groupSelection, ungroupSelection, editText, setSelectionLocked };
}
