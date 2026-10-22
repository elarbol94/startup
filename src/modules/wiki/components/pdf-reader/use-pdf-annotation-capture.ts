"use client";

// Turns the reader's text selection, captured region or page into stored annotations:
// highlight and un-highlight, notes (via the note dialog), bookmarks, and source passages for
// the wiki editor. Used by pdf-reader.tsx (toolbar, selection actions and shortcuts).
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import type { UserMarkColor } from "@/lib/user-mark-colors";
import { createPdfAnnotation, deletePdfAnnotation } from "../../pdf-actions";
import type { PdfRect } from "../../lib/pdf-evidence";
import { rotatePdfRect, type PdfTextSelection } from "../../lib/pdf-selection";
import { rememberSourcePassage } from "../../lib/source-passage";
import { annotationRects } from "./pdf-annotation-geometry";
import type { PendingAnnotation, ReaderAnnotation, ReaderSelection, SelectionAnchor } from "./pdf-reader-types";

export function usePdfAnnotationCapture({
  annotations, setAnnotations, rotation, documentId, pageNumber, sourceTitle, user, t, readerUrl, displayAnnotationRects,
  selection, setSelection, selectionBusy, setSelectionSaving, selectionAnchorPosition, setSelectionAnchor, clearSelection,
  setAnnotationNote, setAnnotationAnchor, setPendingAnnotation, setRegion, setRegionMode, pageShellRef, canvasRef,
}: {
  annotations: ReaderAnnotation[];
  setAnnotations: Dispatch<SetStateAction<ReaderAnnotation[]>>;
  rotation: number;
  documentId: string;
  pageNumber: number;
  sourceTitle: string;
  user: { id: string; name: string; markColor: UserMarkColor };
  t: ReturnType<typeof useTranslations<"wiki">>;
  readerUrl: (nextPage: number, annotationId?: string) => string;
  displayAnnotationRects: (annotation: ReaderAnnotation) => PdfRect[];
  selection: ReaderSelection | null;
  setSelection: Dispatch<SetStateAction<ReaderSelection | null>>;
  selectionBusy: RefObject<boolean>;
  setSelectionSaving: Dispatch<SetStateAction<boolean>>;
  selectionAnchorPosition: { left: number; top: number } | null;
  setSelectionAnchor: Dispatch<SetStateAction<SelectionAnchor | null>>;
  clearSelection: () => void;
  setAnnotationNote: Dispatch<SetStateAction<string>>;
  setAnnotationAnchor: Dispatch<SetStateAction<{ left: number; top: number } | null>>;
  setPendingAnnotation: Dispatch<SetStateAction<PendingAnnotation | null>>;
  setRegion: Dispatch<SetStateAction<PdfRect | null>>;
  setRegionMode: Dispatch<SetStateAction<boolean>>;
  pageShellRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  async function preparePassage(selected: PdfTextSelection) {
    if (selectionBusy.current) return;
    selectionBusy.current = true; setSelectionSaving(true);
    try {
      const existing = annotations.find((item) => item.kind === "text" && item.pageNumber === selected.pageNumber && item.selectedText === selected.text && JSON.stringify(annotationRects(item)) === JSON.stringify(selected.rects.map((rect) => rotatePdfRect(rect, -rotation))));
      const id = existing?.id ?? await saveAnnotation("text", selected.rects, selected.text, undefined, selected.pageNumber);
      rememberSourcePassage({ href: readerUrl(selected.pageNumber, id), title: sourceTitle, quote: selected.text });
      clearSelection();
      toast.success(t("sourcePassageReady"), { duration: 10000 });
    } catch { toast.error(t("sourcePassageFailed")); }
    finally { selectionBusy.current = false; setSelectionSaving(false); }
  }

  const removableHighlights = selection?.parts.flatMap((part) => findOverlappingHighlights(part.pageNumber, part.rects)) ?? [];

  async function changeSelectionHighlight(remove = false) {
    if (!selection || selectionBusy.current) return;
    selectionBusy.current = true; setSelectionSaving(true);
    try {
      if (remove) {
        for (const item of removableHighlights) {
          await deletePdfAnnotation(item.id);
          setAnnotations((items) => items.filter((candidate) => candidate.id !== item.id));
        }
      } else {
        for (const part of selection.parts) await saveAnnotation("text", part.rects, part.text, undefined, part.pageNumber);
      }
      clearSelection();
    } catch { toast.error(t("highlightFailed")); }
    finally { selectionBusy.current = false; setSelectionSaving(false); }
  }

  function requestAnnotation(annotation: PendingAnnotation) {
    setAnnotationNote("");
    if (annotation.kind === "text" && selectionAnchorPosition) setAnnotationAnchor(selectionAnchorPosition);
    else if (annotation.kind === "region" && pageShellRef.current) {
      const bounds = pageShellRef.current.getBoundingClientRect();
      const rect = annotation.geometry[0];
      setAnnotationAnchor({ left: bounds.left + (rect.x + rect.width) * bounds.width, top: bounds.top + (rect.y + rect.height) * bounds.height });
    } else setAnnotationAnchor(null);
    setPendingAnnotation(annotation);
  }

  async function saveAnnotation(kind: "text" | "region" | "bookmark", geometry: PdfRect[], selectedText = "", previewDataUrl?: string, annotationPageNumber = pageNumber, note = "") {
    geometry = geometry.map((rect) => rotatePdfRect(rect, -rotation));
    const result = await createPdfAnnotation({ documentId, pageNumber: annotationPageNumber, kind, geometry, selectedText, note, previewDataUrl });
    const created: ReaderAnnotation = { id: result.id, pageNumber: annotationPageNumber, kind, selectedText, note, label: "", geometryJson: JSON.stringify(geometry), hasPreview: Boolean(previewDataUrl), createdBy: user.id, createdByName: user.name, createdByMarkColor: user.markColor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), comments: [] };
    setAnnotations((items) => [...items, created]);
    toast(t("annotationCreated"), {
      action: {
        label: t("undo"),
        onClick: () => { void deletePdfAnnotation(created.id); setAnnotations((items) => items.filter((item) => item.id !== created.id)); },
      },
    });
    window.getSelection()?.removeAllRanges(); setSelection(null); setSelectionAnchor(null); setAnnotationAnchor(null); setRegion(null); setRegionMode(false);
    return result.id;
  }

  function previewForRegion(rect: PdfRect) {
    const canvas = canvasRef.current; if (!canvas) return undefined;
    const crop = document.createElement("canvas"); crop.width = Math.max(1, Math.round(rect.width * canvas.width)); crop.height = Math.max(1, Math.round(rect.height * canvas.height));
    crop.getContext("2d")?.drawImage(canvas, rect.x * canvas.width, rect.y * canvas.height, rect.width * canvas.width, rect.height * canvas.height, 0, 0, crop.width, crop.height);
    return crop.toDataURL("image/png");
  }

  function findOverlappingHighlights(targetPageNumber: number, geometry: PdfRect[]) {
    return annotations.filter((annotation) => annotation.createdBy === user.id && !annotation.note && annotation.comments.length === 0 && annotation.pageNumber === targetPageNumber && annotation.kind === "text" && displayAnnotationRects(annotation).some((existingRect) => geometry.some((rect) =>
      Math.min(existingRect.x + existingRect.width, rect.x + rect.width) > Math.max(existingRect.x, rect.x) &&
      Math.min(existingRect.y + existingRect.height, rect.y + rect.height) > Math.max(existingRect.y, rect.y),
    )));
  }

  return { preparePassage, removableHighlights, changeSelectionHighlight, requestAnnotation, saveAnnotation, previewForRegion };
}
