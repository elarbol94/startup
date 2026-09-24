"use client";
// Paginates the wiki editor into paper-sized pages in document mode by measuring the mounted
// layout and placing page-break spacers. Used by wiki-editor.tsx.
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { headingVisibilityChanged } from "../collapsible-heading";
import { getDocumentPaginationBreaks, samePaginationBreaks, setDocumentPaginationBreaks } from "../document-extension";
import { computeDocumentPagination, type PaginationItem } from "../../lib/document-pagination";
import type { DocumentSettingsV1 } from "../../lib/document-settings";
import type { WikiTypographySettingsV1 } from "../../lib/wiki-typography";
import { measureTableRows, measureTextLines } from "./document-pagination-measure";

// Typing bursts arrive faster than a frame. Both the page measurement and the
// content snapshot wait out the burst instead of running per keystroke.
const PAGINATION_TYPING_DELAY = 120;
// Line geometry is only measured for blocks that actually reach a page edge, and
// each such block moves the flow, so a couple of rounds settle the whole page.
const PAGINATION_MEASURE_ROUNDS = 3;

export function useDocumentPagination({ editor, documentMode, documentSettings, documentZoom, typography, editorRootRef, setDocumentPageCount }: {
  editor: Editor | null;
  documentMode: boolean;
  documentSettings: DocumentSettingsV1;
  documentZoom: number;
  typography: WikiTypographySettingsV1;
  editorRootRef: RefObject<HTMLDivElement | null>;
  setDocumentPageCount: Dispatch<SetStateAction<number>>;
}) {
  useEffect(() => {
    if (!editor) return;
    if (!documentMode) {
      setDocumentPaginationBreaks(editor, []);
      return;
    }

    let disposed = false;
    let frame = 0;
    let typingTimer: ReturnType<typeof setTimeout> | null = null;
    const paginate = () => {
      frame = 0;
      if (disposed || editor.isDestroyed) return;
      const canvas = editorRootRef.current?.querySelector<HTMLElement>(".wiki-document-canvas");
      const proseMirror = editor.view.dom;
      if (!canvas || !proseMirror.isConnected || canvas.offsetWidth <= 0 || proseMirror.getBoundingClientRect().width <= 0) return;
      // Dispatching into a running composition drops dead keys and IME candidates.
      // The update that ends the composition schedules the next run.
      if (editor.view.composing) return;
      observeLayout();

      // The spacers are removed, measured against and restored within this single
      // frame, so no paint ever shows the collapsed page stack.
      const previousBreaks = getDocumentPaginationBreaks(editor);
      if (previousBreaks.length) setDocumentPaginationBreaks(editor, []);

      const portraitWidthMm = documentSettings.page.size === "A4" ? 210 : 215.9;
      const portraitHeightMm = documentSettings.page.size === "A4" ? 297 : 279.4;
      const paperWidthMm = documentSettings.page.orientation === "portrait" ? portraitWidthMm : portraitHeightMm;
      const paperHeightMm = documentSettings.page.orientation === "portrait" ? portraitHeightMm : portraitWidthMm;
      const zoomFactor = documentZoom / 100;
      const pixelsPerMm = canvas.offsetWidth / paperWidthMm;
      const pageHeight = paperHeightMm * pixelsPerMm;
      const pageGap = 12 * pixelsPerMm;
      const marginTop = documentSettings.page.marginsMm.top * pixelsPerMm;
      const marginBottom = documentSettings.page.marginsMm.bottom * pixelsPerMm;
      const usableHeight = pageHeight - marginTop - marginBottom;
      // Page arithmetic is relative to the body; the cover has its own page stack.
      const canvasTop = proseMirror.getBoundingClientRect().top;
      const natural = (value: number) => (value - canvasTop) / zoomFactor;

      const elements: HTMLElement[] = [];
      const items: PaginationItem[] = [];
      const collectPaginationElements = (element: HTMLElement, inheritedBreak = false) => {
        if (element.classList.contains("wiki-document-auto-page-break") || element.closest(".wiki-collapsed-section")) return;
        // React node views have a wrapper with zero height around a floated figure.
        // Measure the artwork and attached caption, while retaining the wrapper's document position.
        const media = element.matches(".node-commentableImage, .node-mermaidDiagram") ? element.querySelector<HTMLElement>("figure[data-figure-view]") : null;
        const rect = (media || element).getBoundingClientRect();
        const elementHeight = rect.height / zoomFactor;
        const canSplit = element.matches("ul, ol, li, blockquote, section[data-document-columns], nav[data-figure-list]");
        const breakBefore = inheritedBreak || element.dataset.pageBreakBefore === "true";
        if (canSplit && elementHeight > usableHeight && element.children.length > 0) {
          for (const [index, child] of (Array.from(element.children) as HTMLElement[]).entries()) collectPaginationElements(child, index === 0 && breakBefore);
          return;
        }
        const isTable = element.matches("table");
        elements.push(element);
        items.push({
          position: Math.max(0, editor.view.posAtDOM(element, 0) - 1),
          top: natural(rect.top),
          bottom: natural(rect.bottom),
          kind: element.tagName === "LI" ? "listItem" : "block",
          splitKind: isTable ? "tableRow" : "inline",
          splittable: !element.matches(".wiki-figure-list-row") && (isTable || element.matches("p, pre, li, blockquote")),
          pageBreak: element.hasAttribute("data-document-page-break"),
          breakBefore,
          heading: /^H[1-6]$/.test(element.tagName),
          keepWithNext: element.hasAttribute("data-keep-with-next"),
          keepTogether: Boolean(media) || element.hasAttribute("data-keep-together"),
        });
      };
      for (const element of Array.from(proseMirror.children) as HTMLElement[]) collectPaginationElements(element);

      const geometry = { pageHeight, pageGap, marginTop, marginBottom };
      let plan = computeDocumentPagination(items, geometry);
      // Line geometry is expensive, so it is only measured for the blocks the
      // plan reports as reaching a page edge, and the plan is then redone.
      for (let round = 0; round < PAGINATION_MEASURE_ROUNDS && plan.measure.length; round += 1) {
        let measured = false;
        for (const index of plan.measure) {
          const element = elements[index];
          if (items[index].splits || !element) continue;
          try {
            items[index] = {
              ...items[index],
              splits: element.matches("table")
                ? measureTableRows(editor, element, natural)
                : measureTextLines(editor, element, natural),
            };
          } catch {
            items[index] = { ...items[index], splits: [] };
          }
          measured = true;
        }
        if (!measured) break;
        plan = computeDocumentPagination(items, geometry);
      }

      // Re-dispatching an unchanged set would rebuild every spacer widget for nothing.
      if (samePaginationBreaks(previousBreaks, plan.breaks)) {
        if (previousBreaks.length) setDocumentPaginationBreaks(editor, previousBreaks);
      } else {
        setDocumentPaginationBreaks(editor, plan.breaks);
      }
      setDocumentPageCount(plan.pageCount);
    };

    const schedule = (delay = 0) => {
      if (disposed || editor.isDestroyed) return;
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = null;
      cancelAnimationFrame(frame);
      if (!delay) {
        frame = requestAnimationFrame(paginate);
        return;
      }
      typingTimer = setTimeout(() => {
        typingTimer = null;
        frame = requestAnimationFrame(paginate);
      }, delay);
    };
    // Re-measuring every block on each keystroke forces a full reflow and makes
    // typing lag; the mapped spacers stay put until the burst settles.
    const scheduleAfterTyping = () => schedule(PAGINATION_TYPING_DELAY);
    const scheduleAfterReveal = ({ transaction }: { transaction: import("@tiptap/pm/state").Transaction }) => {
      if (headingVisibilityChanged(transaction)) schedule();
      else if (transaction.docChanged) scheduleAfterTyping();
    };
    // Observe the actual mounted layout, including late React node views. Root
    // height catches first-open reflow; child sizes also catch changes within the
    // paper's minimum height. ResizeObserver compares final sizes, so removing
    // and restoring identical spacers in one frame does not create a loop.
    const observed = new Set<Element>();
    const mediaResizeObserver = new ResizeObserver(() => {
      if (!typingTimer) schedule();
    });
    const observeLayout = () => {
      const canvas = editorRootRef.current?.querySelector<HTMLElement>(".wiki-document-canvas");
      const targets = new Set<Element>([
        ...(canvas ? [canvas] : []),
        editor.view.dom,
        ...Array.from(editor.view.dom.children).filter(element => !element.classList.contains("wiki-document-auto-page-break")),
        ...editor.view.dom.querySelectorAll("img, figure, table"),
      ]);
      for (const element of observed) {
        if (!targets.has(element)) {
          mediaResizeObserver.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of targets) {
        if (!observed.has(element)) {
          observed.add(element);
          mediaResizeObserver.observe(element);
        }
      }
    };
    observeLayout();
    const scheduleAfterMediaLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) schedule();
    };
    const scheduleFromEvent = () => schedule();
    editor.view.dom.addEventListener("load", scheduleAfterMediaLoad, true);
    editor.view.dom.addEventListener("compositionend", scheduleAfterTyping);
    document.fonts?.addEventListener("loadingdone", scheduleFromEvent);
    void document.fonts?.ready.then(() => {
      if (!disposed) schedule();
    });
    editor.on("transaction", scheduleAfterReveal);
    window.addEventListener("resize", scheduleFromEvent);
    // EditorContent and React node views must finish mounting before measuring.
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (typingTimer) clearTimeout(typingTimer);
      mediaResizeObserver.disconnect();
      document.fonts?.removeEventListener("loadingdone", scheduleFromEvent);
      editor.view.dom.removeEventListener("load", scheduleAfterMediaLoad, true);
      editor.view.dom.removeEventListener("compositionend", scheduleAfterTyping);
      editor.off("transaction", scheduleAfterReveal);
      window.removeEventListener("resize", scheduleFromEvent);
      setDocumentPaginationBreaks(editor, []);
    };
  }, [documentMode, documentSettings.page, documentZoom, editor, typography, editorRootRef, setDocumentPageCount]);
}
