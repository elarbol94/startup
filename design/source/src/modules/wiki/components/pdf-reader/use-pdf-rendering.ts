"use client";

// Loads the PDF with PDF.js and renders pages to canvases with selectable text layers:
// single/double page mode and the virtualised continuous mode. Used by pdf-reader.tsx.
import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfRect } from "../../lib/pdf-evidence";
import type { PdfViewMode, SearchOccurrence } from "../../lib/pdf-reader-utils";
import { isPdfRenderCancellation, renderReaderTextLayer } from "./pdf-text-layer";
import type { ReaderPage, ReaderSelection } from "./pdf-reader-types";

export function usePdfRendering({
  attachmentId, pdfLoadFailedMessage, pages, currentPage, pageNumber, viewMode, scale, rotation, continuousRenderPages,
  searchOccurrences, activeSearchIndex, selection, selectionDragging, setRendering, setSelection, setRegion, canvasRef,
  textLayerRef, pageShellRef, secondaryCanvasRef, secondaryTextLayerRef, secondaryPageShellRef, continuousCanvasRefs,
  continuousTextLayerRefs, continuousPageRefs, continuousActivePageRef,
}: {
  attachmentId: string;
  pdfLoadFailedMessage: string;
  pages: ReaderPage[];
  currentPage: ReaderPage | undefined;
  pageNumber: number;
  viewMode: PdfViewMode;
  scale: number;
  rotation: number;
  continuousRenderPages: number[];
  searchOccurrences: SearchOccurrence[];
  activeSearchIndex: number;
  selection: ReaderSelection | null;
  selectionDragging: RefObject<boolean>;
  setRendering: Dispatch<SetStateAction<boolean>>;
  setSelection: Dispatch<SetStateAction<ReaderSelection | null>>;
  setRegion: Dispatch<SetStateAction<PdfRect | null>>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  textLayerRef: RefObject<HTMLDivElement | null>;
  pageShellRef: RefObject<HTMLDivElement | null>;
  secondaryCanvasRef: RefObject<HTMLCanvasElement | null>;
  secondaryTextLayerRef: RefObject<HTMLDivElement | null>;
  secondaryPageShellRef: RefObject<HTMLDivElement | null>;
  continuousCanvasRefs: RefObject<Map<number, HTMLCanvasElement>>;
  continuousTextLayerRefs: RefObject<Map<number, HTMLDivElement>>;
  continuousPageRefs: RefObject<Map<number, HTMLDivElement>>;
  continuousActivePageRef: RefObject<number>;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const pdfjsRef = useRef<typeof import("pdfjs-dist") | null>(null);
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [error, setError] = useState("");
  const continuousRenderTasksRef = useRef(new Map<number, { cancel: () => void; promise: Promise<unknown> }>());
  const continuousLoadingPagesRef = useRef(new Set<number>());
  const continuousRenderedPagesRef = useRef(new Set<number>());
  const continuousRenderGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false; let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    void import("pdfjs-dist").then((pdfjs) => {
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      pdfjsRef.current = pdfjs;
      task = pdfjs.getDocument({ url: `/api/files/${attachmentId}`, disableAutoFetch: false, disableRange: false, disableStream: false });
      return task.promise;
    }).then((document) => { if (!cancelled && document) setPdf(document); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : pdfLoadFailedMessage); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [attachmentId, pdfLoadFailedMessage]);

  useEffect(() => {
    if (viewMode === "continuous" || !pdf || !pdfjsRef.current || !canvasRef.current || !textLayerRef.current || !pageShellRef.current) return;
    let cancelled = false; let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    setRendering(true); setSelection(null); setRegion(null);
    void Promise.resolve().then(() => pdf.getPage(pageNumber)).then(async (pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale, rotation });
      const canvas = canvasRef.current!; const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is unavailable");
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
      const shell = pageShellRef.current!; shell.style.width = `${viewport.width}px`; shell.style.height = `${viewport.height}px`;
      shell.style.setProperty("--total-scale-factor", String(viewport.scale));
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      await renderTask.promise;
      if (cancelled) return;
      await renderReaderTextLayer(pdfPage, currentPage, textLayerRef.current!, viewport, pdfjsRef.current!);
      setTextLayerVersion((value) => value + 1);
      setRendering(false);
      }).catch((reason) => { if (!cancelled && !isPdfRenderCancellation(reason)) { setError(reason instanceof Error ? reason.message : pdfLoadFailedMessage); setRendering(false); } });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [canvasRef, currentPage, pageNumber, pageShellRef, pdf, pdfLoadFailedMessage, rotation, scale, setRegion, setRendering, setSelection, textLayerRef, viewMode]);


  useEffect(() => {
    if (!pdf || !pdfjsRef.current || viewMode !== "double" || !secondaryCanvasRef.current || !secondaryTextLayerRef.current || !secondaryPageShellRef.current || pageNumber >= pages.length) return;
    let cancelled = false; let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void Promise.resolve().then(() => pdf.getPage(pageNumber + 1)).then((pdfPage) => {
      if (cancelled || !secondaryCanvasRef.current || !secondaryTextLayerRef.current || !secondaryPageShellRef.current || !pdfjsRef.current) return;
      const viewport = pdfPage.getViewport({ scale, rotation });
      const canvas = secondaryCanvasRef.current; const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = viewport.width + "px"; canvas.style.height = viewport.height + "px";
      secondaryPageShellRef.current.style.width = viewport.width + "px"; secondaryPageShellRef.current.style.height = viewport.height + "px";
      secondaryPageShellRef.current.style.setProperty("--total-scale-factor", String(viewport.scale));
      renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      void renderTask.promise.then(async () => {
        if (cancelled || !secondaryTextLayerRef.current || !pdfjsRef.current) return;
        await renderReaderTextLayer(pdfPage, pages.find((item) => item.pageNumber === pageNumber + 1), secondaryTextLayerRef.current, viewport, pdfjsRef.current);
        setTextLayerVersion((value) => value + 1);
      }).catch((reason) => { if (!cancelled && !isPdfRenderCancellation(reason)) setError(reason instanceof Error ? reason.message : pdfLoadFailedMessage); });
    });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pageNumber, pages, pdf, pdfLoadFailedMessage, rotation, scale, secondaryCanvasRef, secondaryPageShellRef, secondaryTextLayerRef, viewMode]);

  useEffect(() => {
    const generation = ++continuousRenderGenerationRef.current;
    const renderTasks = continuousRenderTasksRef.current;
    const loadingPages = continuousLoadingPagesRef.current;
    const renderedPages = continuousRenderedPagesRef.current;
    return () => {
      if (continuousRenderGenerationRef.current !== generation) return;
      continuousRenderGenerationRef.current += 1;
      renderTasks.forEach((task) => task.cancel());
      renderTasks.clear();
      loadingPages.clear();
      renderedPages.clear();
    };
  }, [pdf, rotation, scale, viewMode]);

  useEffect(() => {
    if (!pdf || viewMode !== "continuous") return;
    const generation = continuousRenderGenerationRef.current;
    const desiredPages = new Set(continuousRenderPages);
    const activeSearchPage = searchOccurrences[activeSearchIndex]?.pageNumber;
    if (activeSearchPage) desiredPages.add(activeSearchPage);
    desiredPages.add(pageNumber);
    for (const page of pages) {
      const canvas = continuousCanvasRefs.current.get(page.pageNumber);
      if (!canvas) continue;
      const shell = continuousPageRefs.current.get(page.pageNumber);
      const rotated = rotation % 180 !== 0;
      const displayWidth = (rotated ? page.height : page.width) * scale;
      const displayHeight = (rotated ? page.width : page.height) * scale;
      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";
      if (shell) {
        shell.style.width = displayWidth + "px";
        shell.style.height = displayHeight + "px";
        shell.style.setProperty("--total-scale-factor", String(scale));
      }
    }
    for (const part of selection?.parts ?? []) desiredPages.add(part.pageNumber);
    if (selectionDragging.current) for (const retained of continuousRenderedPagesRef.current) desiredPages.add(retained);
    for (const [renderedPage, task] of continuousRenderTasksRef.current) {
      if (!desiredPages.has(renderedPage)) {
        task.cancel();
        continuousRenderTasksRef.current.delete(renderedPage);
      }
    }
    for (const renderedPage of continuousRenderedPagesRef.current) {
      if (desiredPages.has(renderedPage)) continue;
      const canvas = continuousCanvasRefs.current.get(renderedPage);
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      continuousTextLayerRefs.current.get(renderedPage)?.replaceChildren();
      continuousRenderedPagesRef.current.delete(renderedPage);
    }
    for (const page of pages) {
      if (!desiredPages.has(page.pageNumber) || continuousRenderedPagesRef.current.has(page.pageNumber) || continuousLoadingPagesRef.current.has(page.pageNumber)) continue;
      const canvas = continuousCanvasRefs.current.get(page.pageNumber);
      if (!canvas) continue;
      continuousLoadingPagesRef.current.add(page.pageNumber);
      void Promise.resolve().then(() => pdf.getPage(page.pageNumber)).then((pdfPage) => {
        if (continuousRenderGenerationRef.current !== generation || (!desiredPages.has(page.pageNumber) && page.pageNumber !== continuousActivePageRef.current)) return;
        const viewport = pdfPage.getViewport({ scale, rotation });
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale); canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = viewport.width + "px"; canvas.style.height = viewport.height + "px";
        const shell = continuousPageRefs.current.get(page.pageNumber);
        if (shell) { shell.style.width = viewport.width + "px"; shell.style.height = viewport.height + "px"; shell.style.setProperty("--total-scale-factor", String(viewport.scale)); }
        const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
        continuousRenderTasksRef.current.set(page.pageNumber, renderTask);
        return renderTask.promise.then(async () => {
          const layer = continuousTextLayerRefs.current.get(page.pageNumber);
          if (continuousRenderGenerationRef.current !== generation || !layer || !pdfjsRef.current) return;
          await renderReaderTextLayer(pdfPage, page, layer, viewport, pdfjsRef.current);
          if (continuousRenderGenerationRef.current === generation) {
            continuousRenderedPagesRef.current.add(page.pageNumber);
            setTextLayerVersion((value) => value + 1);
          }
        }).finally(() => { if (continuousRenderTasksRef.current.get(page.pageNumber) === renderTask) continuousRenderTasksRef.current.delete(page.pageNumber); });
      }).catch((reason) => { if (continuousRenderGenerationRef.current === generation && !isPdfRenderCancellation(reason)) setError(reason instanceof Error ? reason.message : pdfLoadFailedMessage); }).finally(() => { continuousLoadingPagesRef.current.delete(page.pageNumber); });
    }
  }, [activeSearchIndex, continuousRenderPages, pageNumber, pages, pdf, pdfLoadFailedMessage, rotation, scale, searchOccurrences, viewMode, selection, continuousActivePageRef, continuousCanvasRefs, continuousPageRefs, continuousTextLayerRefs, selectionDragging]);

  return { pdf, error, textLayerVersion };
}
