"use client";

// Opening the PDF reader from a task or deadline: turn to the page it is anchored to, then
// scroll its marker into view and focus it (or say it has no marker). Used by pdf-reader.tsx.
import { useEffect, useEffectEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import type { useRouter } from "next/navigation";
import type { useTranslations } from "next-intl";
import type { ContextDeadlineMarker, ContextTaskMarker } from "@/modules/tasks/types";
import type { PdfViewMode } from "../../lib/pdf-reader-utils";
import { deadlineAnchorPage, taskAnchorPage } from "./pdf-marker-anchors";

export function usePdfContextAnchors({
  initialTaskId, contextTasks, initialDeadlineId, contextDeadlines, pageNumber, setPageNumber, rendering, router,
  sourceId, documentId, viewMode, tTasks, tDeadlines, readerRef, restoreContinuousPage, scrollToPage,
}: {
  initialTaskId?: string;
  contextTasks: ContextTaskMarker[];
  initialDeadlineId?: string;
  contextDeadlines: ContextDeadlineMarker[];
  pageNumber: number;
  setPageNumber: Dispatch<SetStateAction<number>>;
  rendering: boolean;
  router: ReturnType<typeof useRouter>;
  sourceId: string;
  documentId: string;
  viewMode: PdfViewMode;
  tTasks: ReturnType<typeof useTranslations<"tasks">>;
  tDeadlines: ReturnType<typeof useTranslations<"deadlines">>;
  readerRef: RefObject<HTMLDivElement | null>;
  restoreContinuousPage: RefObject<number | null>;
  scrollToPage: (targetPage: number, block?: ScrollLogicalPosition) => void;
}) {
  // scrollToPage only reads refs, so the effects need not re-run when its identity changes.
  const scrollToAnchoredPage = useEffectEvent((targetPage: number) => scrollToPage(targetPage, "center"));

  useEffect(() => {
    if (!initialTaskId) return;
    const anchoredPage = taskAnchorPage(contextTasks, initialTaskId);
    if (anchoredPage && anchoredPage !== pageNumber) {
      router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${anchoredPage}&task=${encodeURIComponent(initialTaskId)}`, { scroll: false });
      const syncPage = window.setTimeout(() => {
        restoreContinuousPage.current = anchoredPage;
        setPageNumber(anchoredPage);
      }, 0);
      return () => window.clearTimeout(syncPage);
    }
    if (rendering) return;
    const targetPage = anchoredPage ?? pageNumber;
    router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${targetPage}&task=${encodeURIComponent(initialTaskId)}`, { scroll: false });
    if (viewMode === "continuous") scrollToAnchoredPage(targetPage);
    const timeout = window.setTimeout(() => {
      const marker = readerRef.current?.querySelector<HTMLElement>(
        `[data-task-marker="${CSS.escape(initialTaskId)}"]`,
      );
      if (marker) {
        marker.scrollIntoView({ behavior: "smooth", block: "center" });
        marker.focus({ preventScroll: true });
      } else {
        toast.info(tTasks("sourceFallback"));
      }
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [contextTasks, documentId, initialTaskId, pageNumber, rendering, router, sourceId, tTasks, viewMode, readerRef, restoreContinuousPage, setPageNumber]);

  useEffect(() => {
    if (!initialDeadlineId) return;
    const anchoredPage = deadlineAnchorPage(contextDeadlines, initialDeadlineId);
    if (anchoredPage && anchoredPage !== pageNumber) {
      router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${anchoredPage}&deadline=${encodeURIComponent(initialDeadlineId)}`, { scroll: false });
      const syncPage = window.setTimeout(() => {
        restoreContinuousPage.current = anchoredPage;
        setPageNumber(anchoredPage);
      }, 0);
      return () => window.clearTimeout(syncPage);
    }
    if (rendering) return;
    const targetPage = anchoredPage ?? pageNumber;
    router.replace(`/wiki/sources/${sourceId}/read/${documentId}?page=${targetPage}&deadline=${encodeURIComponent(initialDeadlineId)}`, { scroll: false });
    if (viewMode === "continuous") scrollToAnchoredPage(targetPage);
    const timeout = window.setTimeout(() => {
      const marker = readerRef.current?.querySelector<HTMLElement>(
        `[data-deadline-marker="${CSS.escape(initialDeadlineId)}"]`,
      );
      if (marker) {
        marker.scrollIntoView({ behavior: "smooth", block: "center" });
        marker.focus({ preventScroll: true });
      } else {
        toast.info(tDeadlines("sourceFallback"));
      }
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [contextDeadlines, documentId, initialDeadlineId, pageNumber, rendering, router, sourceId, tDeadlines, viewMode, readerRef, restoreContinuousPage, setPageNumber]);
}
