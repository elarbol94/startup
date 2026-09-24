// DOM measurement of text lines and table rows so on-screen document pagination can break
// inside a block. Used by use-document-pagination.ts.
import type { Editor } from "@tiptap/react";
import type { PaginationSplit } from "../../lib/document-pagination";

// Measures the line boxes of a text block and maps each line start back to a
// document position, so a paragraph or code block can break between its lines.
export function measureTextLines(editor: Editor, element: HTMLElement, natural: (value: number) => number) {
  const range = document.createRange();
  const rectAt = (text: Text, offset: number) => {
    if (offset < 0 || offset >= text.length) return null;
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    const rect = range.getBoundingClientRect();
    return rect.height > 0 ? rect : null;
  };
  const splits: PaginationSplit[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.length || text.parentElement?.closest("[contenteditable=\"false\"]")) continue;
    let offset = 0;
    while (offset < text.length) {
      const rect = rectAt(text, offset);
      if (!rect) {
        offset += 1;
        continue;
      }
      const top = natural(rect.top);
      const previous = splits[splits.length - 1];
      // A line box can span several text nodes when marks interrupt it.
      if (previous && Math.abs(previous.top - top) < 1) previous.bottom = Math.max(previous.bottom, natural(rect.bottom));
      else splits.push({ position: editor.view.posAtDOM(text, offset), top, bottom: natural(rect.bottom) });
      // Probing every character is too slow on a paragraph that fills a page, so
      // the end of the line box is found by bisection instead.
      let low = offset + 1;
      let high = text.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const probe = rectAt(text, middle - 1);
        if (probe && Math.abs(probe.top - rect.top) < 1) low = middle;
        else high = middle - 1;
      }
      offset = Math.max(low, offset + 1);
    }
  }
  return splits;
}

// ponytail: split tables between rows without repeating the header row on the
// following page; the export renderers own that, this is the on-screen preview.
export function measureTableRows(editor: Editor, table: HTMLElement, natural: (value: number) => number) {
  const rows = table.querySelectorAll<HTMLTableRowElement>(":scope > tr, :scope > tbody > tr");
  return Array.from(rows, (row) => {
    const rect = row.getBoundingClientRect();
    return { position: Math.max(0, editor.view.posAtDOM(row, 0) - 1), top: natural(rect.top), bottom: natural(rect.bottom) };
  });
}
