// PDF.js page helpers: render-cancellation detection, the selectable text layer (native
// text or OCR words) and locating search matches in a rendered text layer.
// Used by use-pdf-rendering.ts and use-pdf-search-highlights.ts.
import type { PDFPageProxy } from "pdfjs-dist";
import { rotatePdfRect } from "../../lib/pdf-selection";
import { findSearchOccurrences } from "../../lib/pdf-reader-utils";
import type { ReaderPage } from "./pdf-reader-types";

export function isPdfRenderCancellation(reason: unknown) {
  return reason instanceof Error && reason.name === "RenderingCancelledException";
}

export function searchRangeInTextLayer(
  layer: HTMLDivElement,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  occurrenceIndex: number,
) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent) nodes.push(walker.currentNode as Text);
  }
  const offsets: Array<{ node: Text; start: number; end: number }> = [];
  let text = "";
  for (const node of nodes) {
    const start = text.length;
    text += node.data;
    offsets.push({ node, start, end: text.length });
  }
  const occurrence = findSearchOccurrences(
    [{ pageNumber: Number(layer.parentElement?.dataset.pageNumber) || 1, text }],
    { query, caseSensitive, wholeWord },
  )[occurrenceIndex];
  if (!occurrence) return null;
  const startNode = offsets.find((item) => occurrence.start >= item.start && occurrence.start < item.end);
  const endNode = offsets.find((item) => occurrence.end > item.start && occurrence.end <= item.end);
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode.node, occurrence.start - startNode.start);
  range.setEnd(endNode.node, occurrence.end - endNode.start);
  return range;
}

export async function renderReaderTextLayer(pdfPage: PDFPageProxy, metadata: ReaderPage | undefined, layer: HTMLDivElement, viewport: ReturnType<PDFPageProxy["getViewport"]>, pdfjs: typeof import("pdfjs-dist")) {
  const textContent = await pdfPage.getTextContent();
  layer.replaceChildren();
  if (textContent.items.some((item) => "str" in item && item.str.trim())) {
    await new pdfjs.TextLayer({ textContentSource: textContent, container: layer, viewport }).render();
    return;
  }
  if (metadata?.extractionMethod !== "ocr") return;
  let words: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];
  try { words = JSON.parse(metadata.textLayerJson) as typeof words; } catch { return; }
  const measurement = document.createElement("canvas").getContext("2d");
  const quarterTurn = viewport.rotation % 180 !== 0;
  const pageWidth = quarterTurn ? viewport.height : viewport.width;
  const pageHeight = quarterTurn ? viewport.width : viewport.height;
  for (const word of words) {
    if (!word.text || word.width <= 0 || word.height <= 0) continue;
    const span = document.createElement("span"); span.textContent = `${word.text} `;
    const rect = rotatePdfRect(word, viewport.rotation);
    const fontSize = word.height * pageHeight;
    if (measurement) measurement.font = `${fontSize}px sans-serif`;
    const textWidth = measurement?.measureText(word.text).width || word.width * pageWidth;
    const x = rect.x + ([90, 180].includes(viewport.rotation) ? rect.width : 0);
    const y = rect.y + ([180, 270].includes(viewport.rotation) ? rect.height : 0);
    Object.assign(span.style, { left: `${x * 100}%`, top: `${y * 100}%`, fontFamily: "sans-serif", fontSize: `${fontSize}px`, transform: `rotate(${viewport.rotation}deg) scaleX(${word.width * pageWidth / textWidth})` });
    layer.appendChild(span);
  }
}
