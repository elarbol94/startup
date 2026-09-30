"use client";
// Copy, cut and paste of presentation objects. Objects copied in this tab are kept in an
// internal clipboard and pasted synchronously; the system clipboard is written and read
// through the copy/cut/paste events of the keyboard shortcuts, which need no permission.
// navigator.clipboard is only used by menu commands and never delays an internal paste.
// Used by presentation-editor.tsx.
import { useEffect, useEffectEvent, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import type { useReactFlow } from "@xyflow/react";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import { mutableSelection, parsePresentationClipboard, pastePresentationObjects, serializeSelection } from "../../lib/presentation-interactions";
import { presentationDescendants, type PresentationCanvasAction, type PresentationCanvasState, type PresentationElement } from "../../lib/presentation";
import { planPaste, type PresentationPasteRecord } from "../../lib/presentation-clipboard";
import type { PresentationRecord } from "../../presentation-queries";
import type { PresentationNode } from "../presentation-canvas";
import { frameInsertionEdit } from "./use-presentation-frames";
import { presentationKeyScope } from "./presentation-keyboard-scope";

type InternalClipboard = {
  raw: string;
  elements: PresentationElement[];
  /** One copy action: repeated pastes of it are offset, a new copy starts over. */
  source: string;
  /** The deck it was copied from, whose attachments need no copying. */
  deckId: string;
  /** False once the system clipboard may hold something newer (focus left the tab, another copy). */
  current: boolean;
};

/** Shared by the editors of this tab, so a copy in one deck pastes at once in another. */
let internal: InternalClipboard | null = null;

const MEDIA_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav" };

/** Copies attachments from another deck into this one; returns old id → new id. */
async function copyAttachments(ids: string[], presentationId: string) {
  const replacements = new Map<string, string>();
  for (const id of ids) {
    const response = await fetch(`/api/files/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Attachment unavailable");
    const blob = await response.blob();
    if (blob.size > 50 * 1024 * 1024) throw new Error("Attachment too large");
    const body = new FormData(); body.append("file", blob, `pasted.${MEDIA_EXTENSIONS[blob.type] ?? "bin"}`); body.append("entityType", "wikiPresentation"); body.append("entityId", presentationId);
    const upload = await fetch("/api/files", { method: "POST", body });
    if (!upload.ok) throw new Error("Media copy failed");
    const uploaded = await upload.json(); if (typeof uploaded.id !== "string") throw new Error("Invalid upload");
    replacements.set(id, uploaded.id);
  }
  return replacements;
}

export function usePresentationClipboard({
  selection, selectedIds, canMutate, elements, disabled, contextPosition, reactFlow, viewportCenter,
  presentation, dispatch, setSelectedIds, deleteSelection, latest, t, commandRoot, canvasRef,
}: {
  selection: PresentationElement[];
  selectedIds: string[];
  canMutate: boolean;
  elements: PresentationElement[];
  disabled: boolean;
  contextPosition: { x: number; y: number } | null;
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  viewportCenter: () => { x: number; y: number };
  presentation: PresentationRecord;
  dispatch: (action: PresentationCanvasAction) => void;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  deleteSelection: (ids: string[]) => void;
  latest: RefObject<{ canvas: PresentationCanvasState; readOnly: boolean }>;
  t: ReturnType<typeof useTranslations<"wiki">>;
  commandRoot: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLElement | null>;
}) {
  const failed = () => toast.error(t("presentations.interactions.clipboardError"));
  /** The cursor while it is over the canvas: a keyboard paste lands there. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const lastPaste = useRef<PresentationPasteRecord | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const move = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; };
    const leave = () => { pointer.current = null; };
    canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerdown", move); canvas.addEventListener("pointerleave", leave);
    return () => { canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerdown", move); canvas.removeEventListener("pointerleave", leave); };
  }, [canvasRef]);

  /** Puts the selection on the internal clipboard (cut removes it) and returns what the system clipboard should hold. */
  const take = (cut: boolean) => {
    if (!selection.length || (cut && !canMutate)) return null;
    const raw = serializeSelection(elements, selectedIds);
    internal = { raw, elements: parsePresentationClipboard(raw), source: createId(), deckId: presentation.id, current: true };
    lastPaste.current = null;
    if (cut && !latest.current.readOnly && mutableSelection(latest.current.canvas.elements, selectedIds)) {
      // Cut removes exactly what was copied, a frame's members included.
      deleteSelection([...presentationDescendants(latest.current.canvas.elements, new Set(selectedIds))]);
    }
    return raw;
  };

  const insert = (copied: PresentationElement[], center: { x: number; y: number }) => {
    if (latest.current.readOnly) throw new Error("Editing unavailable");
    const newIds = copied.map(() => createId());
    const rootIds = copied.flatMap((e, index) => !e.parentId ? [newIds[index]] : []);
    const added = copied.map((element, index) => ({ ...element, id: newIds[index] }));
    dispatch(frameInsertionEdit(added, current => {
      let index = 0;
      return pastePresentationObjects(copied, current, center, () => newIds[index++]).elements;
    }, t));
    setSelectedIds(rootIds);
  };

  /** Pastes parsed objects: synchronously unless attachments of another deck have to be copied first. */
  const paste = (source: string, copied: PresentationElement[], fromDeck?: string) => {
    if (disabled) return;
    if (!copied.length || elements.length + copied.length > 500) { failed(); return; }
    const screen = contextPosition ?? pointer.current;
    const point = screen ? reactFlow.screenToFlowPosition(screen) : viewportCenter();
    const record = planPaste(copied, { source, target: `${Math.round(point.x)},${Math.round(point.y)}`, point }, lastPaste.current);
    lastPaste.current = record;
    const present = new Set(elements.flatMap(e => "attachmentId" in e.content ? [e.content.attachmentId] : []));
    const foreign = fromDeck === presentation.id ? [] : [...new Set(copied.flatMap(e => "attachmentId" in e.content && !present.has(e.content.attachmentId) ? [e.content.attachmentId] : []))];
    if (!foreign.length) {
      try { insert(copied, record.center); } catch { failed(); }
      return;
    }
    void copyAttachments(foreign, presentation.id).then(replacements => {
      const next = copied.map(element => "attachmentId" in element.content && replacements.has(element.content.attachmentId)
        ? { ...element, content: { ...element.content, attachmentId: replacements.get(element.content.attachmentId)! } } as PresentationElement : element);
      insert(next, record.center);
    }).catch(failed);
  };

  /** Pastes what the system clipboard holds; the internal copy is used when it is the same text. */
  const pasteText = (raw: string) => {
    if (internal && raw === internal.raw) { paste(internal.source, internal.elements, internal.deckId); return; }
    let copied: PresentationElement[];
    try { copied = parsePresentationClipboard(raw); } catch { failed(); return; }
    paste(`external:${raw.length}:${raw.slice(0, 200)}`, copied);
  };

  /** Menu commands have no clipboard event to use. */
  const copySelection = (cut = false) => {
    const raw = take(cut);
    if (raw) navigator.clipboard?.writeText(raw).catch(() => undefined);
  };
  const pasteSelection = () => {
    if (disabled) return;
    const own = internal;
    if (own?.current) { paste(own.source, own.elements, own.deckId); return; }
    if (!navigator.clipboard?.readText) { if (own) paste(own.source, own.elements, own.deckId); else failed(); return; }
    navigator.clipboard.readText().then(pasteText, () => { if (own) paste(own.source, own.elements, own.deckId); else failed(); });
  };

  const onClipboard = useEffectEvent((event: ClipboardEvent) => {
    const scope = presentationKeyScope(event, commandRoot.current);
    const text = window.getSelection();
    const nativeText = Boolean(text && !text.isCollapsed && !canvasRef.current?.contains(text.anchorNode));
    if (!scope || scope.typing || (event.type !== "paste" && nativeText)) {
      // Someone else's copy: the system clipboard may no longer hold the internal copy.
      if (event.type !== "paste" && internal) internal.current = false;
      return;
    }
    if (event.type === "paste") {
      event.preventDefault();
      if (disabled) return;
      const raw = event.clipboardData?.getData("text/plain");
      if (raw === undefined && internal) paste(internal.source, internal.elements, internal.deckId);
      else if (raw) pasteText(raw);
      else failed();
      return;
    }
    const raw = take(event.type === "cut");
    if (!raw) return;
    event.preventDefault();
    if (event.clipboardData) event.clipboardData.setData("text/plain", raw);
    else navigator.clipboard?.writeText(raw).catch(() => undefined);
  });
  /** Chrome enables copy/cut/paste without an editable selection only if these are cancelled. */
  const onBefore = useEffectEvent((event: Event) => {
    const scope = presentationKeyScope(event, commandRoot.current);
    if (scope && !scope.typing) event.preventDefault();
  });
  useEffect(() => {
    const clipboard = (event: ClipboardEvent) => onClipboard(event);
    const before = (event: Event) => onBefore(event);
    const stale = () => { if (internal) internal.current = false; };
    for (const type of ["copy", "cut", "paste"] as const) document.addEventListener(type, clipboard);
    for (const type of ["beforecopy", "beforecut", "beforepaste"]) document.addEventListener(type, before);
    window.addEventListener("blur", stale);
    return () => {
      for (const type of ["copy", "cut", "paste"] as const) document.removeEventListener(type, clipboard);
      for (const type of ["beforecopy", "beforecut", "beforepaste"]) document.removeEventListener(type, before);
      window.removeEventListener("blur", stale);
    };
  }, []);

  return { copySelection, pasteSelection };
}
