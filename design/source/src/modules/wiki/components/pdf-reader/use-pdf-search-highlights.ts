"use client";

// In-document search highlighting for the PDF reader: keeps the active match index valid,
// draws/scrolls match highlights over rendered text layers and reveals the search box.
// Used by pdf-reader.tsx.
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { NavigatorTab, PdfViewMode, SearchOccurrence } from "../../lib/pdf-reader-utils";
import styles from "../pdf-reader.module.css";
import { searchRangeInTextLayer } from "./pdf-text-layer";

export function usePdfSearchHighlights({
  query, searchPending, searchOccurrences, activeSearchIndex, setActiveSearchIndex, caseSensitiveSearch, wholeWordSearch,
  pageNumber, viewMode, textLayerVersion, showThumbnails, navigatorTab, reducedMotion, searchInputRef, textLayerRef,
  secondaryTextLayerRef, continuousTextLayerRefs,
}: {
  query: string;
  searchPending: boolean;
  searchOccurrences: SearchOccurrence[];
  activeSearchIndex: number;
  setActiveSearchIndex: Dispatch<SetStateAction<number>>;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  pageNumber: number;
  viewMode: PdfViewMode;
  textLayerVersion: number;
  showThumbnails: boolean;
  navigatorTab: NavigatorTab;
  reducedMotion: RefObject<boolean>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  textLayerRef: RefObject<HTMLDivElement | null>;
  secondaryTextLayerRef: RefObject<HTMLDivElement | null>;
  continuousTextLayerRefs: RefObject<Map<number, HTMLDivElement>>;
}) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!query.trim()) { setActiveSearchIndex(-1); return; }
      setActiveSearchIndex((value) => value >= 0 && value < searchOccurrences.length ? value : searchOccurrences.length ? 0 : -1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [query, searchOccurrences.length, setActiveSearchIndex]);

  useEffect(() => {
    const layers = [textLayerRef.current, secondaryTextLayerRef.current, ...continuousTextLayerRefs.current.values()].filter((layer): layer is HTMLDivElement => Boolean(layer));
    const clearOverlays = () => layers.forEach((layer) => layer.parentElement?.querySelector("[data-pdf-search-overlay]")?.replaceChildren());
    clearOverlays();
    if (!query.trim() || searchPending) return;
    let activeMarker: HTMLDivElement | null = null;
    for (const layer of layers) {
      const layerPage = Number(layer.parentElement?.dataset.pageNumber) || pageNumber;
      const shell = layer.parentElement;
      const overlay = shell?.querySelector<HTMLDivElement>("[data-pdf-search-overlay]");
      if (!shell || !overlay) continue;
      const shellBounds = shell.getBoundingClientRect();
      const pageOccurrences = searchOccurrences.filter((occurrence) => occurrence.pageNumber === layerPage);
      for (const occurrence of pageOccurrences) {
        const range = searchRangeInTextLayer(layer, query, caseSensitiveSearch, wholeWordSearch, occurrence.pageOccurrenceIndex);
        if (!range) continue;
        const active = searchOccurrences[activeSearchIndex]?.id === occurrence.id;
        for (const rect of Array.from(range.getClientRects()).filter((item) => item.width > 0 && item.height > 0)) {
          const marker = document.createElement("div");
          marker.dataset.pdfSearchMatch = occurrence.id;
          if (active) marker.dataset.pdfSearchActive = "true";
          marker.className = active ? `${styles.searchMatch} ${styles.searchMatchActive}` : styles.searchMatch;
          Object.assign(marker.style, {
            left: `${rect.left - shellBounds.left}px`,
            top: `${rect.top - shellBounds.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          });
          overlay.appendChild(marker);
          if (active && !activeMarker) activeMarker = marker;
        }
      }
    }
    if (activeMarker) {
      const marker = activeMarker;
      window.requestAnimationFrame(() => marker.scrollIntoView({
        behavior: reducedMotion.current ? "auto" : "smooth",
        block: "center",
        inline: "center",
      }));
    }
    return clearOverlays;
  }, [activeSearchIndex, caseSensitiveSearch, continuousTextLayerRefs, pageNumber, query, reducedMotion, searchOccurrences, searchPending, secondaryTextLayerRef, textLayerRef, textLayerVersion, viewMode, wholeWordSearch]);

  useEffect(() => {
    if (!showThumbnails || navigatorTab !== "search") return;
    let secondFrame: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        searchInputRef.current?.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [navigatorTab, searchInputRef, showThumbnails]);
}
