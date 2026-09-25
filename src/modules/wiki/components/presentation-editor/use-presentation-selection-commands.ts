"use client";
// Clipboard, grouping, text-editing and locking commands for the presentation selection.
// Used by presentation-editor.tsx.
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import type { useReactFlow } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import { mutableSelection, parsePresentationClipboard, pastePresentationObjects, serializeSelection, ungroupSteps } from "../../lib/presentation-interactions";
import { groupPresentationElements, presentationDescendants, ungroupPresentationElements, type PresentationCanvasAction, type PresentationCanvasState, type PresentationElement, type PresentationStep } from "../../lib/presentation";
import type { PresentationRecord } from "../../presentation-queries";
import type { PresentationNode } from "../presentation-canvas";
import { frameInsertionEdit } from "./use-presentation-frames";

export function usePresentationSelectionCommands({
  selection, selected, selectedIds, selectedRoots, canMutate, elements, steps, disabled, contextPosition, reactFlow, viewportCenter,
  presentation, dispatch, setSelectedIds, deleteSelection, latest, canvasRef, t,
}: {
  selection: PresentationElement[];
  selected: PresentationElement | null;
  selectedIds: string[];
  selectedRoots: PresentationElement[];
  canMutate: boolean;
  elements: PresentationElement[];
  steps: PresentationStep[];
  disabled: boolean;
  contextPosition: { x: number; y: number } | null;
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  viewportCenter: () => { x: number; y: number };
  presentation: PresentationRecord;
  dispatch: (action: PresentationCanvasAction) => void;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  deleteSelection: (ids: string[]) => void;
  latest: RefObject<{ canvas: PresentationCanvasState; readOnly: boolean }>;
  canvasRef: RefObject<HTMLDivElement | null>;
  t: ReturnType<typeof useTranslations<"wiki">>;
}) {
  const copySelection = useCallback(async (cut = false) => {
    if (!selection.length || (cut && !canMutate)) return;
    try {
      const raw = serializeSelection(elements, selectedIds);
      await navigator.clipboard.writeText(raw);
      if (cut && !latest.current.readOnly && mutableSelection(latest.current.canvas.elements, selectedIds)) {
        // Cut removes exactly what was copied, a frame's members included.
        deleteSelection([...presentationDescendants(latest.current.canvas.elements, new Set(selectedIds))]);
      }
    } catch { toast.error(t("presentations.interactions.clipboardError")); }
  }, [selection, canMutate, elements, selectedIds, deleteSelection, t, latest]);
  const pasteSelection = useCallback(async () => {
    if (disabled) return;
    const point = contextPosition ? reactFlow.screenToFlowPosition(contextPosition) : viewportCenter();
    try {
      const copied = parsePresentationClipboard(await navigator.clipboard.readText());
      if (!copied.length || elements.length + copied.length > 500) throw new Error("Element limit");
      const attachmentIds = [...new Set(copied.flatMap(e => "attachmentId" in e.content ? [e.content.attachmentId] : []))];
      const currentAttachments = new Set(elements.flatMap(e => "attachmentId" in e.content ? [e.content.attachmentId] : []));
      const media = await Promise.all(attachmentIds.map(async id => {
        const response = await fetch(`/api/files/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error("Attachment unavailable");
        const blob = await response.blob();
        if (blob.size > 50 * 1024 * 1024) throw new Error("Attachment too large");
        return { id, blob };
      }));
      const replacements = new Map<string, string>();
      for (const { id, blob } of media) {
        if (currentAttachments.has(id)) continue;
        const body = new FormData(); body.append("file", blob, `pasted.${({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav" } as Record<string, string>)[blob.type] ?? "bin"}`); body.append("entityType", "wikiPresentation"); body.append("entityId", presentation.id);
        const response = await fetch("/api/files", { method: "POST", body });
        if (!response.ok) throw new Error("Media copy failed");
        const uploaded = await response.json(); if (typeof uploaded.id !== "string") throw new Error("Invalid upload");
        replacements.set(id, uploaded.id);
      }
      for (const element of copied) if ("attachmentId" in element.content) element.content.attachmentId = replacements.get(element.content.attachmentId) ?? element.content.attachmentId;
      if (latest.current.readOnly) throw new Error("Editing unavailable");
      const newIds = copied.map(() => createId());
      const rootIds = copied.flatMap((e, index) => !e.parentId ? [newIds[index]] : []);
      const added = copied.map((element, index) => ({ ...element, id: newIds[index] }));
      dispatch(frameInsertionEdit(added, current => {
        let index = 0;
        return pastePresentationObjects(copied, current, point, () => newIds[index++]).elements;
      }, t));
      setSelectedIds(rootIds);
    } catch { toast.error(t("presentations.interactions.clipboardError")); }
  }, [disabled, contextPosition, reactFlow, viewportCenter, elements, presentation.id, dispatch, t, latest, setSelectedIds]);
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
    canvasRef.current?.querySelector<HTMLElement>(`[data-presentation-text="${window.CSS.escape(selected.id)}"]`)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }, [selected, canMutate, canvasRef]);
  const setSelectionLocked = useCallback((locked: boolean) => {
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => current.map(e => selectedIds.includes(e.id) ? { ...e, locked } : e) });
  }, [dispatch, selectedIds]);

  return { copySelection, pasteSelection, groupSelection, ungroupSelection, editText, setSelectionLocked };
}
