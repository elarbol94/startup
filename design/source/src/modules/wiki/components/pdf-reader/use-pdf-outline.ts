"use client";

// Loads and flattens the PDF outline (bookmarks) with each entry's page and vertical
// position. Used by pdf-reader.tsx for the navigator's outline tab.
import { useEffect, useState } from "react";
import type { useTranslations } from "next-intl";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfOutlineItem } from "../../lib/pdf-selection";

export function usePdfOutline({ pdf, t }: { pdf: PDFDocumentProxy | null; t: ReturnType<typeof useTranslations<"wiki">> }) {
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const [outlineLoaded, setOutlineLoaded] = useState(false);

  useEffect(() => {
    if (!pdf || outlineLoaded) return;
    const activePdf = pdf;
    let cancelled = false;
    void activePdf.getOutline().then(async (items) => {
      const flattened: PdfOutlineItem[] = [];
      async function visit(entries: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>, depth: number) {
        for (const item of entries ?? []) {
          let page: number | undefined;
          let y = 0;
          try {
            const destination = typeof item.dest === "string" ? await activePdf.getDestination(item.dest) : item.dest;
            if (destination?.[0] !== undefined) {
              page = typeof destination[0] === "number" ? destination[0] + 1 : await activePdf.getPageIndex(destination[0]) + 1;
              const target = await activePdf.getPage(page);
              const view = target.getViewport({ scale: 1 });
              const top = destination[1]?.name === "XYZ" ? destination[3] : ["FitH", "FitBH"].includes(destination[1]?.name) ? destination[2] : null;
              if (typeof top === "number") y = Math.max(0, Math.min(1, view.convertToViewportPoint(0, top)[1] / view.height));
            }
          } catch { /* malformed outline destinations stay visible without a page */ }
          flattened.push({ title: item.title || t("untitled"), pageNumber: page, depth, y });
          await visit(item.items, depth + 1);
        }
      }
      await visit(items, 0);
      if (!cancelled) { setOutline(flattened); setOutlineLoaded(true); }
    }).catch(() => { if (!cancelled) setOutlineLoaded(true); });
    return () => { cancelled = true; };
  }, [outlineLoaded, pdf, t]);

  return { outline, outlineLoaded };
}
