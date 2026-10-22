"use client";

// The reader's text selection: reading the browser selection off the text layer once a drag
// ends, and keeping its screen anchor (where the selection actions float) in place while the
// viewport scrolls or resizes. Used by pdf-reader.tsx.
import { useEffect, useEffectEvent, useState, type RefObject } from "react";
import { toast } from "sonner";
import type { useTranslations } from "next-intl";
import { readPdfSelection } from "../../lib/pdf-selection";
import type { PdfViewMode } from "../../lib/pdf-reader-utils";
import type { PendingAnnotation, ReaderSelection, SelectionAnchor } from "./pdf-reader-types";

export function usePdfTextSelection({
  t, viewMode, scale, rotation, pageNumber, pendingAnnotation, regionMode, selectionBusy, selectionDragging,
  viewportRef, pageShellRef, secondaryPageShellRef, continuousPageRefs,
}: {
  t: ReturnType<typeof useTranslations<"wiki">>;
  viewMode: PdfViewMode;
  scale: number;
  rotation: number;
  pageNumber: number;
  pendingAnnotation: PendingAnnotation | null;
  regionMode: boolean;
  selectionBusy: RefObject<boolean>;
  selectionDragging: RefObject<boolean>;
  viewportRef: RefObject<HTMLDivElement | null>;
  pageShellRef: RefObject<HTMLDivElement | null>;
  secondaryPageShellRef: RefObject<HTMLDivElement | null>;
  continuousPageRefs: RefObject<Map<number, HTMLDivElement>>;
}) {
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [selectionSaving, setSelectionSaving] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [selectionAnchorPosition, setSelectionAnchorPosition] = useState<{ left: number; top: number; side: SelectionAnchor["side"] } | null>(null);

  useEffect(() => {
    if (!selectionAnchor) return;

    let frame = 0;
    const updatePosition = () => {
      frame = 0;
      const shell = viewMode === "continuous"
        ? continuousPageRefs.current.get(selectionAnchor.pageNumber)
        : selectionAnchor.pageNumber === pageNumber + 1 && viewMode === "double" ? secondaryPageShellRef.current : pageShellRef.current;
      if (!shell) return;
      const bounds = shell.getBoundingClientRect();
      setSelectionAnchorPosition({
        left: bounds.left + selectionAnchor.x * bounds.width,
        top: bounds.top + selectionAnchor.y * bounds.height,
        side: selectionAnchor.side,
      });
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePosition);
    };
    const viewport = viewportRef.current;
    scheduleUpdate();
    viewport?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [selectionAnchor, viewMode, scale, rotation, pageNumber, continuousPageRefs, secondaryPageShellRef, pageShellRef, viewportRef]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSelection(null); setSelectionAnchor(null); setSelectionAnchorPosition(null);
  }

  function captureSelection() {
    if (selectionBusy.current || pendingAnnotation || regionMode) return;
    const browserSelection = window.getSelection();
    const viewport = viewportRef.current;
    if (!browserSelection || !viewport) return;
    const parts = readPdfSelection(browserSelection, viewport);
    if (!parts.length) { setSelection(null); setSelectionAnchor(null); return; }
    if (parts.some((part) => part.text.length > 20_000 || part.rects.length > 200)) {
      setSelection(null); setSelectionAnchor(null); toast.error(t("selectionTooLong")); return;
    }
    const range = browserSelection.getRangeAt(0);
    const backwards = browserSelection.anchorNode === range.endContainer && browserSelection.anchorOffset === range.endOffset;
    const endpoint = backwards ? parts[0] : parts.at(-1)!;
    const rect = backwards ? endpoint.rects[0] : endpoint.rects.at(-1)!;
    setSelection({ ...parts[0], parts });
    setSelectionAnchor({ pageNumber: endpoint.pageNumber, x: backwards ? rect.x : rect.x + rect.width, y: rect.y + rect.height, side: backwards ? "left" : "right" });
  }

  const captureLatestSelection = useEffectEvent(captureSelection);
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => { if (!selectionDragging.current) captureLatestSelection(); }, 60);
    };
    const release = () => { selectionDragging.current = false; schedule(); };
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", release);
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", schedule); document.removeEventListener("pointerup", release); document.removeEventListener("pointercancel", release); };
  }, [selectionDragging]);

  return {
    selection, setSelection, selectionSaving, setSelectionSaving, setSelectionAnchor, selectionAnchorPosition,
    clearSelection, captureSelection,
  };
}
