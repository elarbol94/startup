import type { PdfRect } from "./pdf-evidence";

export type PdfTextSelection = { text: string; rects: PdfRect[]; pageNumber: number };

/** Read only selected text nodes, avoiding whole-span rectangles returned by Range. */
export function readPdfSelection(selection: Selection, viewport: HTMLElement): PdfTextSelection[] {
  if (!selection.rangeCount || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  const result: PdfTextSelection[] = [];
  for (const layer of viewport.querySelectorAll<HTMLElement>("[data-pdf-text-layer]")) {
    if (!range.intersectsNode(layer)) continue;
    const shell = layer.closest<HTMLElement>("[data-page-number]");
    if (!shell) continue;
    const bounds = shell.getBoundingClientRect();
    if (!bounds.width || !bounds.height) continue;
    const rects: PdfRect[] = [];
    const pieces: string[] = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let lastBottom = 0;
    let lastRight = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!range.intersectsNode(node)) continue;
      const part = document.createRange();
      part.selectNodeContents(node);
      if (node === range.startContainer) part.setStart(node, range.startOffset);
      if (node === range.endContainer) part.setEnd(node, range.endOffset);
      const text = part.toString();
      if (!text) continue;
      const boxes = Array.from(part.getClientRects()).filter((box) => box.width > 0 && box.height > 0);
      if (!boxes.length) continue;
      const first = boxes[0];
      if (pieces.length && !/\s$/.test(pieces.at(-1)!) && !/^\s/.test(text)) {
        if (Math.abs(first.bottom - lastBottom) > first.height * 0.5) pieces.push("\n");
        else if (first.left - lastRight > first.height * 0.12) pieces.push(" ");
      }
      pieces.push(text);
      lastBottom = boxes.at(-1)!.bottom;
      lastRight = boxes.at(-1)!.right;
      for (const box of boxes) {
        const left = Math.max(box.left, bounds.left), top = Math.max(box.top, bounds.top);
        const right = Math.min(box.right, bounds.right), bottom = Math.min(box.bottom, bounds.bottom);
        if (right > left && bottom > top) rects.push({ x: (left - bounds.left) / bounds.width, y: (top - bounds.top) / bounds.height, width: (right - left) / bounds.width, height: (bottom - top) / bounds.height });
      }
    }
    const text = pieces.join("").trim();
    if (text && rects.length) result.push({ text, rects, pageNumber: Number(shell.dataset.pageNumber) });
  }
  return result;
}

export type PdfOutlineItem = { title: string; pageNumber?: number; depth: number; y?: number };

export function activePdfOutlineIndex(outline: PdfOutlineItem[], page: number, y: number) {
  let active = -1;
  for (let index = 0; index < outline.length; index++) {
    const item = outline[index];
    if (item.pageNumber && (item.pageNumber < page || (item.pageNumber === page && (item.y ?? 0) <= y + 0.01))) {
      const previous = outline[active];
      if (!previous || item.pageNumber > previous.pageNumber! || (item.pageNumber === previous.pageNumber && (item.y ?? 0) >= (previous.y ?? 0))) active = index;
    }
  }
  return active;
}

export function visiblePdfOutlineIndices(outline: PdfOutlineItem[], collapsed: ReadonlySet<number>) {
  const visible: number[] = [];
  let hiddenBelow: number | null = null;
  outline.forEach((item, index) => {
    if (hiddenBelow !== null && item.depth > hiddenBelow) return;
    hiddenBelow = null;
    visible.push(index);
    if (collapsed.has(index)) hiddenBelow = item.depth;
  });
  return visible;
}

/** Convert normalized page geometry through clockwise quarter turns. */
export function rotatePdfRect(rect: PdfRect, rotation: number): PdfRect {
  switch ((rotation % 360 + 360) % 360) {
    case 90: return { x: Math.max(0, 1 - rect.y - rect.height), y: rect.x, width: rect.height, height: rect.width };
    case 180: return { x: Math.max(0, 1 - rect.x - rect.width), y: Math.max(0, 1 - rect.y - rect.height), width: rect.width, height: rect.height };
    case 270: return { x: rect.y, y: Math.max(0, 1 - rect.x - rect.width), width: rect.height, height: rect.width };
    default: return rect;
  }
}
