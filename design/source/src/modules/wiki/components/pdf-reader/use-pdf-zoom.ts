"use client";

// Zoom handling for the PDF reader: usePdfWheelZoom does smooth ctrl+wheel zoom around the
// cursor (committed to the scale after the gesture); usePdfFitScale attaches that wheel
// listener and recalculates fit-to-width/page scales. Used by pdf-reader.tsx.
import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { calculateFitScale, type FitMode } from "../../lib/pdf-reader-utils";

export function usePdfWheelZoom({
  scale, setScale, setFitMode, viewportRef, pageShellRef,
}: {
  scale: number;
  setScale: Dispatch<SetStateAction<number>>;
  setFitMode: Dispatch<SetStateAction<FitMode>>;
  viewportRef: RefObject<HTMLDivElement | null>;
  pageShellRef: RefObject<HTMLDivElement | null>;
}) {
  const scaleRef = useRef(1.25);
  const zoomFrameRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ deltaY: number; cursorX: number; cursorY: number; viewport: HTMLDivElement } | null>(null);
  const zoomAnchorRef = useRef<{ cursorX: number; cursorY: number; shell: HTMLDivElement | null; x: number; y: number } | null>(null);
  const zoomGestureTimeoutRef = useRef<number | null>(null);
  const zoomCommitTimeoutRef = useRef<number | null>(null);
  const zoomScaleRef = useRef(1.25);
  const zoomCommitPendingRef = useRef(false);
  const zoomContentRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    scaleRef.current = scale;
    zoomScaleRef.current = scale;
    if (zoomCommitPendingRef.current) {
      zoomContentRef.current?.style.removeProperty("zoom");
      zoomCommitPendingRef.current = false;
    }
  }, [scale]);

  useEffect(() => () => {
    if (zoomFrameRef.current !== null) window.cancelAnimationFrame(zoomFrameRef.current);
    if (zoomGestureTimeoutRef.current !== null) window.clearTimeout(zoomGestureTimeoutRef.current);
    if (zoomCommitTimeoutRef.current !== null) window.clearTimeout(zoomCommitTimeoutRef.current);
  }, []);

  const handleViewportWheel = useCallback((event: WheelEvent) => {
    const activeAnchor = zoomAnchorRef.current;
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (zoomGestureTimeoutRef.current !== null) window.clearTimeout(zoomGestureTimeoutRef.current);
    zoomGestureTimeoutRef.current = window.setTimeout(() => {
      zoomAnchorRef.current = null;
      zoomGestureTimeoutRef.current = null;
    }, 500);
    const viewport = viewportRef.current;
    const content = zoomContentRef.current;
    if (!viewport || !content) return;
    const bounds = viewport.getBoundingClientRect();
    const eventElement = event.target instanceof Element ? event.target : null;
    const shell = (eventElement?.closest("[data-page-number]") as HTMLDivElement | null) ?? pageShellRef.current;
    const shellBounds = shell?.getBoundingClientRect();
    const anchor = activeAnchor ?? {
      cursorX: event.clientX - bounds.left,
      cursorY: event.clientY - bounds.top,
      shell,
      x: shellBounds ? (event.clientX - shellBounds.left) / shellBounds.width : 0.5,
      y: shellBounds ? (event.clientY - shellBounds.top) / shellBounds.height : 0.5,
    };
    zoomAnchorRef.current = anchor;
    const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * bounds.height : event.deltaY;
    const pending = pendingZoomRef.current;
    pendingZoomRef.current = {
      deltaY: (pending?.deltaY ?? 0) + deltaY,
      cursorX: anchor.cursorX,
      cursorY: anchor.cursorY,
      viewport,
    };
    if (zoomFrameRef.current !== null) return;
    zoomFrameRef.current = window.requestAnimationFrame(() => {
      zoomFrameRef.current = null;
      const nextPending = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (!nextPending) return;
      const previousVisualScale = zoomScaleRef.current;
      const nextScale = Math.min(3, Math.max(0.5, previousVisualScale * Math.exp(-nextPending.deltaY * 0.0035)));
      if (Math.abs(nextScale - previousVisualScale) < 0.001) return;
      const contentX = nextPending.viewport.scrollLeft + nextPending.cursorX;
      const contentY = nextPending.viewport.scrollTop + nextPending.cursorY;
      zoomScaleRef.current = nextScale;
      content.style.setProperty("zoom", String(nextScale / scaleRef.current));
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = Math.round(nextScale * 100) + "%";
      if (anchor.shell?.isConnected) {
        const viewportBounds = nextPending.viewport.getBoundingClientRect();
        const anchorBounds = anchor.shell.getBoundingClientRect();
        nextPending.viewport.scrollLeft += anchorBounds.left + anchor.x * anchorBounds.width - (viewportBounds.left + anchor.cursorX);
        nextPending.viewport.scrollTop += anchorBounds.top + anchor.y * anchorBounds.height - (viewportBounds.top + anchor.cursorY);
      } else {
        const ratio = nextScale / previousVisualScale;
        nextPending.viewport.scrollLeft = contentX * ratio - nextPending.cursorX;
        nextPending.viewport.scrollTop = contentY * ratio - nextPending.cursorY;
      }
      if (zoomCommitTimeoutRef.current !== null) window.clearTimeout(zoomCommitTimeoutRef.current);
      zoomCommitTimeoutRef.current = window.setTimeout(() => {
        zoomCommitTimeoutRef.current = null;
        const finalScale = zoomScaleRef.current;
        if (Math.abs(finalScale - scaleRef.current) < 0.001) {
          content.style.removeProperty("zoom");
          return;
        }
        zoomCommitPendingRef.current = true;
        setFitMode("custom");
        setScale(finalScale);
      }, 120);
    });
  }, [pageShellRef, setFitMode, setScale, viewportRef]);

  return { zoomContentRef, zoomLabelRef, handleViewportWheel };
}

export function usePdfFitScale({
  viewportRef, handleViewportWheel, fitMode, fitPadding, pageNumber, pdf, rotation, setScale,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  handleViewportWheel: (event: WheelEvent) => void;
  fitMode: FitMode;
  fitPadding: number;
  pageNumber: number;
  pdf: PDFDocumentProxy | null;
  rotation: number;
  setScale: Dispatch<SetStateAction<number>>;
}) {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleViewportWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleViewportWheel);
  }, [handleViewportWheel, viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || fitMode === "custom") return;
    let frame: number | null = null;
    const recalculate = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!pdf || !viewportRef.current) return;
        void Promise.resolve().then(() => pdf.getPage(pageNumber)).then((pdfPage) => {
          if (!viewportRef.current) return;
          const base = pdfPage.getViewport({ scale: 1, rotation });
          const nextScale = calculateFitScale({
            mode: fitMode, pageWidth: base.width, pageHeight: base.height,
            viewportWidth: viewportRef.current.clientWidth, viewportHeight: viewportRef.current.clientHeight,
            padding: fitPadding,
          });
          if (nextScale !== null) setScale(nextScale);
        }).catch(() => {});
      });
    };
    const observer = new ResizeObserver(recalculate);
    observer.observe(viewport);
    recalculate();
    return () => { observer.disconnect(); if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [fitMode, fitPadding, pageNumber, pdf, rotation, setScale, viewportRef]);
}
