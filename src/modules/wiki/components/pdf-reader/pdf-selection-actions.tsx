"use client";

// The small toolbar that floats next to a text selection (highlight, note, source passage,
// cancel) or a captured region (highlight, note, cancel).
// Used by pdf-reader.tsx.
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { Eraser, Highlighter, Link2, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PdfRect } from "../../lib/pdf-evidence";
import type { usePdfAnnotationCapture } from "./use-pdf-annotation-capture";
import type { ReaderSelection, SelectionAnchor } from "./pdf-reader-types";

type AnnotationCapture = ReturnType<typeof usePdfAnnotationCapture>;

export function PdfSelectionActions({
  t, selection, region, selectionAnchorPosition, selectionSaving, removableHighlights, changeSelectionHighlight,
  requestAnnotation, preparePassage, clearSelection, saveAnnotation, previewForRegion, pageNumber, setRegion,
  setSelectionAnchor, selectionActionsStyle,
}: {
  t: ReturnType<typeof useTranslations<"wiki">>;
  selection: ReaderSelection | null;
  region: PdfRect | null;
  selectionAnchorPosition: { left: number; top: number; side: "left" | "right" } | null;
  selectionSaving: boolean;
  removableHighlights: AnnotationCapture["removableHighlights"];
  changeSelectionHighlight: AnnotationCapture["changeSelectionHighlight"];
  requestAnnotation: AnnotationCapture["requestAnnotation"];
  preparePassage: AnnotationCapture["preparePassage"];
  clearSelection: () => void;
  saveAnnotation: AnnotationCapture["saveAnnotation"];
  previewForRegion: AnnotationCapture["previewForRegion"];
  pageNumber: number;
  setRegion: Dispatch<SetStateAction<PdfRect | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<SelectionAnchor | null>>;
  selectionActionsStyle: (anchor: { left: number; top: number; side: "left" | "right" }) => CSSProperties;
}) {
  return <>{selection && selectionAnchorPosition && <div data-testid="pdf-selection-actions" role="toolbar" className="fixed z-40 flex gap-1 rounded-lg border bg-background p-1 shadow-xl" style={selectionActionsStyle(selectionAnchorPosition)} onMouseDown={(event) => event.preventDefault()} onMouseUp={(event) => event.stopPropagation()}>
          <Button size="icon-sm" disabled={selectionSaving} aria-label={t(removableHighlights.length ? "removeHighlight" : "highlight")} title={t(removableHighlights.length ? "removeHighlight" : "highlight")} onClick={() => void changeSelectionHighlight(Boolean(removableHighlights.length))}>{removableHighlights.length ? <Eraser className="size-4" /> : <Highlighter className="size-4" />}</Button>
          <Button size="icon-sm" variant="outline" disabled={selectionSaving || selection.parts.length > 1} aria-label={t("note")} title={t(selection.parts.length > 1 ? "singlePagePassage" : "note")} onClick={() => requestAnnotation({ kind: "text", geometry: selection.rects, selectedText: selection.text, pageNumber: selection.pageNumber })}><MessageCircle className="size-4" /></Button>
          <Button size="icon-sm" variant="outline" disabled={selectionSaving || selection.parts.length > 1} aria-label={t("prepareSourcePassage")} title={t(selection.parts.length > 1 ? "singlePagePassage" : "prepareSourcePassage")} onClick={() => void preparePassage(selection)}><Link2 className="size-4" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("cancel")} title={t("cancel")} onClick={clearSelection}><X className="size-4" /></Button>
        </div>}{region && selectionAnchorPosition && <div data-testid="pdf-selection-actions" className="fixed z-40 flex gap-1 rounded-lg border bg-background p-1 shadow-xl" style={selectionActionsStyle(selectionAnchorPosition)} onMouseDown={(event) => event.preventDefault()} onMouseUp={(event) => event.stopPropagation()}><Button size="icon-sm" aria-label={t("highlight")} title={t("highlight")} onClick={() => void saveAnnotation("region", [region], "", previewForRegion(region), pageNumber, "")}><Highlighter className="size-4" /></Button><Button size="icon-sm" variant="outline" aria-label={t("note")} title={t("note")} onClick={() => requestAnnotation({ kind: "region", geometry: [region], selectedText: "", previewDataUrl: previewForRegion(region), pageNumber })}><MessageCircle className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setRegion(null); setSelectionAnchor(null); }}>{t("cancel")}</Button></div>}</>;
}
