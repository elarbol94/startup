// Document zoom limits, the stored zoom level and the scroll correction that keeps the point
// under the cursor in place. Used by wiki-editor.tsx and use-document-zoom-gestures.ts.
import { readEditorStorage } from "../../lib/editor-draft";

export const DOCUMENT_ZOOM_KEY = "wiki:document-zoom:v1";
export const DOCUMENT_ZOOM_MIN = 70;
export const DOCUMENT_ZOOM_MAX = 200;

export function loadDocumentZoom() {
  if (typeof window === "undefined") return 100;
  // Without this guard an absent entry parses as 0 and clamps to the minimum,
  // so a first visit opened the document at 70 % instead of 100 %.
  const stored = Number(readEditorStorage(DOCUMENT_ZOOM_KEY) ?? Number.NaN);
  return Number.isFinite(stored) && stored > 0 ? Math.min(DOCUMENT_ZOOM_MAX, Math.max(DOCUMENT_ZOOM_MIN, stored)) : 100;
}

function scrollableAncestor(element: Element | null, axis: "x" | "y") {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (!/^(auto|scroll|overlay)$/.test(axis === "y" ? style.overflowY : style.overflowX)) continue;
    const scrollable = axis === "y" ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
    if (scrollable > 1) return node;
  }
  return null;
}

// Zooming keeps the point under the cursor in place: whatever the mouse pointed
// at before the wheel notch is scrolled back under the pointer afterwards.
export function keepZoomAnchorInPlace(surface: HTMLElement, deltaX: number, deltaY: number) {
  let restX = deltaX;
  let restY = deltaY;
  const horizontal = scrollableAncestor(surface, "x");
  if (horizontal && restX) {
    const before = horizontal.scrollLeft;
    horizontal.scrollLeft = before + restX;
    restX -= horizontal.scrollLeft - before;
  }
  const vertical = scrollableAncestor(surface, "y");
  if (vertical && restY) {
    const before = vertical.scrollTop;
    vertical.scrollTop = before + restY;
    restY -= vertical.scrollTop - before;
  }
  if (Math.abs(restX) > 0.5 || Math.abs(restY) > 0.5) {
    window.scrollBy({ left: restX, top: restY, behavior: "instant" });
  }
}
