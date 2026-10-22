"use client";

// Keyboard routing for the PDF reader: matches key presses inside the reader to the user's
// shortcut bindings, and handles the fixed keys (Escape, arrows, page keys, +/-) on the
// window. Used by pdf-reader.tsx, which owns the actions the shortcuts run.
import { useEffect, useEffectEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useRouter } from "next/navigation";
import type { PdfRect } from "../../lib/pdf-evidence";
import type { FitMode, NavigatorTab, PdfViewMode } from "../../lib/pdf-reader-utils";
import {
  normalizePdfShortcut, PDF_SHORTCUT_ACTIONS, type PdfShortcutAction, type PdfShortcutBindings,
} from "../../lib/pdf-shortcuts";
import type { CommentPanelState, ReaderPage } from "./pdf-reader-types";

export function usePdfKeyboard({
  readerRef, shortcuts, runPdfShortcut, searchInputRef, query, setQuery, setNavigatorTab, setRegionMode, setRegion,
  clearSelection, setPageNumber, setCommentPanel, setActiveAnnotationId, router, sourceId, documentId, viewMode,
  continuousPageRefs, reducedMotion, pageNumber, pages, scale, setFitMode, setScale,
}: {
  readerRef: RefObject<HTMLDivElement | null>;
  shortcuts: PdfShortcutBindings;
  runPdfShortcut: (action: PdfShortcutAction) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setNavigatorTab: Dispatch<SetStateAction<NavigatorTab>>;
  setRegionMode: Dispatch<SetStateAction<boolean>>;
  setRegion: Dispatch<SetStateAction<PdfRect | null>>;
  clearSelection: () => void;
  setPageNumber: Dispatch<SetStateAction<number>>;
  setCommentPanel: Dispatch<SetStateAction<CommentPanelState>>;
  setActiveAnnotationId: Dispatch<SetStateAction<string>>;
  router: ReturnType<typeof useRouter>;
  sourceId: string;
  documentId: string;
  viewMode: PdfViewMode;
  continuousPageRefs: RefObject<Map<number, HTMLDivElement>>;
  reducedMotion: RefObject<boolean>;
  pageNumber: number;
  pages: ReaderPage[];
  scale: number;
  setFitMode: Dispatch<SetStateAction<FitMode>>;
  setScale: Dispatch<SetStateAction<number>>;
}) {
  function handlePdfShortcut(event: KeyboardEvent | React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    const activeElement = document.activeElement as HTMLElement | null;
    const documentHasReaderFocus = target === document.body || target === document.documentElement;
    const eventTarget = readerRef.current?.contains(target)
      ? target
      : readerRef.current?.contains(activeElement)
        ? activeElement
        : documentHasReaderFocus
          ? readerRef.current
          : null;
    if (!readerRef.current?.contains(eventTarget) || event.defaultPrevented || ("nativeEvent" in event ? event.nativeEvent.isComposing : event.isComposing)) return false;
    const shortcut = normalizePdfShortcut(event);
    if (!shortcut) return false;
    const action = PDF_SHORTCUT_ACTIONS.find((candidate) => shortcuts[candidate] === shortcut);
    if (!action) return false;
    if (eventTarget?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [data-shortcut-recorder]") && action !== "search") return false;
    event.preventDefault();
    event.stopPropagation();
    runPdfShortcut(action);
    return true;
  }

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
      if (handlePdfShortcut(event)) return;
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing) {
        if (event.key === "Escape" && event.target === searchInputRef.current) {
          event.preventDefault();
          if (query) setQuery(""); else setNavigatorTab("pages");
        }
        return;
      }
      if (event.key === "Escape") {
        setRegionMode(false); setRegion(null); clearSelection();
      }
      if (event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const goToPage = (nextPage: number) => {
        setPageNumber(nextPage);
        setCommentPanel((panel) => panel.mode === "thread" ? { mode: "list" } : panel);
        setActiveAnnotationId("");
        router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${nextPage}`, { scroll: false });
        if (viewMode === "continuous") window.setTimeout(() => continuousPageRefs.current.get(nextPage)?.scrollIntoView({ behavior: reducedMotion.current ? "auto" : "smooth", block: "start" }), 0);
      };
      if (event.key === "ArrowLeft" || event.key === "PageUp") goToPage(Math.max(1, pageNumber - 1));
      if (event.key === "ArrowRight" || event.key === "PageDown") goToPage(Math.min(pages.length, pageNumber + 1));
      if (event.key === "+" || event.key === "=") { setFitMode("custom"); setScale(Math.min(3, scale + 0.15)); }
      if (event.key === "-") { setFitMode("custom"); setScale(Math.max(0.5, scale - 0.15)); }
  });

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => handleWindowKeyDown(event);
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  }, []);

  return { handlePdfShortcut };
}
