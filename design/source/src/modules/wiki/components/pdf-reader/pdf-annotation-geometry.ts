// Pure geometry helpers for PDF annotations: stored annotation rects and region
// pointer coordinates. Used by pdf-reader.tsx.
import type { PdfRect } from "../../lib/pdf-evidence";
import type { ReaderAnnotation } from "./pdf-reader-types";

export function annotationRects(annotation: ReaderAnnotation) {
  try { return JSON.parse(annotation.geometryJson) as PdfRect[]; } catch { return []; }
}

export function regionPoint(event: React.PointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
}
