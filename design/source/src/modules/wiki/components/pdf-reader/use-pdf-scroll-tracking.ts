"use client";

// Scroll tracking for the PDF reader: the outline reading position, the visible page and
// render window in continuous mode, and restoring the scroll position. Used by pdf-reader.tsx.
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { useRouter } from "next/navigation";
import type { PdfViewMode } from "../../lib/pdf-reader-utils";

export function usePdfScrollTracking({
  initialPage, sourceId, documentId, router, pageNumber, setPageNumber, viewMode, scale, rotation, textLayerVersion,
  viewportRef, continuousPageRefs, restoreContinuousPage, setContinuousRenderPages,
}: {
  initialPage: number;
  sourceId: string;
  documentId: string;
  router: ReturnType<typeof useRouter>;
  pageNumber: number;
  setPageNumber: Dispatch<SetStateAction<number>>;
  viewMode: PdfViewMode;
  scale: number;
  rotation: number;
  textLayerVersion: number;
  viewportRef: RefObject<HTMLDivElement | null>;
  continuousPageRefs: RefObject<Map<number, HTMLDivElement>>;
  restoreContinuousPage: RefObject<number | null>;
  setContinuousRenderPages: Dispatch<SetStateAction<number[]>>;
}) {
  const [outlinePosition, setOutlinePosition] = useState({ page: initialPage, y: 0 });
  const initialContinuousScroll = useRef(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = viewport.getBoundingClientRect();
      const readingLine = bounds.top + Math.min(120, bounds.height * 0.25);
      const shells = Array.from(viewport.querySelectorAll<HTMLElement>("[data-page-number]"));
      const shell = shells.find((item) => item.getBoundingClientRect().bottom > readingLine) ?? shells.at(-1);
      if (!shell) return;
      const pageBounds = shell.getBoundingClientRect();
      const next = { page: Number(shell.dataset.pageNumber), y: Math.max(0, Math.min(1, (readingLine - pageBounds.top) / pageBounds.height)) };
      setOutlinePosition((previous) => previous.page === next.page && Math.abs(previous.y - next.y) < 0.002 ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    viewport.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule); observer.observe(viewport);
    schedule();
    return () => { viewport.removeEventListener("scroll", schedule); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [viewMode, pageNumber, scale, rotation, textLayerVersion, viewportRef]);

  useEffect(() => {
    if (viewMode !== "continuous" || !viewportRef.current) return;
    const viewport = viewportRef.current;
    let frame: number | null = null;
    const updateVisiblePage = () => {
      frame = null;
      const viewportBounds = viewport.getBoundingClientRect();
      const viewportCenter = viewportBounds.top + viewportBounds.height / 2;
      const measuredPages = [...continuousPageRefs.current.entries()]
        .map(([number, element]) => ({ number, bounds: element.getBoundingClientRect() }));
      const overscan = viewportBounds.height;
      const nextRenderPages = measuredPages
        .filter(({ bounds }) => bounds.bottom >= viewportBounds.top - overscan && bounds.top <= viewportBounds.bottom + overscan)
        .map(({ number }) => number);
      setContinuousRenderPages((current) => current.length === nextRenderPages.length && current.every((value, index) => value === nextRenderPages[index]) ? current : nextRenderPages);
      const visible = measuredPages
        .filter(({ bounds }) => bounds.bottom >= viewportBounds.top && bounds.top <= viewportBounds.bottom)
        .sort((a, b) => {
          const distance = (bounds: DOMRect) => Math.max(bounds.top - viewportCenter, 0, viewportCenter - bounds.bottom);
          return distance(a.bounds) - distance(b.bounds);
        })[0];
      const nextPage = visible?.number;
      if (restoreContinuousPage.current !== null) {
        if (nextPage !== restoreContinuousPage.current) return;
        restoreContinuousPage.current = null;
      }
      if (!nextPage || nextPage === pageNumber) return;
      setPageNumber(nextPage);
      router.replace("/wiki/sources/" + sourceId + "/read/" + documentId + "?page=" + nextPage, { scroll: false });
    };
    const scheduleVisiblePageUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateVisiblePage);
    };
    viewport.addEventListener("scroll", scheduleVisiblePageUpdate, { passive: true });
    scheduleVisiblePageUpdate();
    return () => {
      viewport.removeEventListener("scroll", scheduleVisiblePageUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [continuousPageRefs, documentId, pageNumber, restoreContinuousPage, router, setContinuousRenderPages, setPageNumber, sourceId, viewMode, viewportRef]);

  useEffect(() => {
    if (viewMode !== "continuous") return;
    const targetPage = restoreContinuousPage.current;
    if (targetPage === null && !initialContinuousScroll.current) return;
    const pageToScrollTo = targetPage ?? pageNumber;
    const timer = window.setTimeout(() => {
      continuousPageRefs.current.get(pageToScrollTo)?.scrollIntoView({ behavior: "auto", block: "start" });
      restoreContinuousPage.current = null;
      initialContinuousScroll.current = false;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [continuousPageRefs, pageNumber, restoreContinuousPage, viewMode]);

  return { outlinePosition };
}
