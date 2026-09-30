// Shared types for the PDF reader: pages, annotations, pending annotations and anchors.
// Used by pdf-reader.tsx and the other files in pdf-reader/.
import type { UserMarkColor } from "@/lib/user-mark-colors";
import type { PdfRect } from "../../lib/pdf-evidence";
import type { PdfTextSelection } from "../../lib/pdf-selection";

export type ReaderPage = {
  pageNumber: number; width: number; height: number; text: string;
  textLayerJson: string; extractionMethod: "native" | "ocr" | "empty"; hasThumbnail: boolean;
};
export type ReaderAnnotation = {
  id: string; pageNumber: number; kind: "text" | "region" | "bookmark";
  selectedText: string; note: string; label: string; geometryJson: string;
  hasPreview: boolean; createdBy: string; createdByName: string; createdByMarkColor: UserMarkColor; createdAt: string; updatedAt: string;
  comments: Array<{ id: string; body: string; createdBy: string; createdByName: string; createdByMarkColor: UserMarkColor; createdAt: string }>;
};
export type PendingAnnotation = {
  kind: "text" | "region" | "bookmark"; geometry: PdfRect[]; selectedText: string;
  previewDataUrl?: string; pageNumber: number;
};
export type SelectionAnchor = {
  pageNumber: number;
  x: number;
  y: number;
  side: "left" | "right";
};
export type CommentPanelState = { mode: "closed" } | { mode: "list" } | { mode: "thread"; annotationId: string };
export type PdfTaskAnchor = { pageNumber?: number; rects?: PdfRect[]; quote?: string };
/** The current text selection: its first part plus every per-page part. */
export type ReaderSelection = PdfTextSelection & { parts: PdfTextSelection[] };
