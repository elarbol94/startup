import type { Node } from "@tiptap/pm/model";

/** Resolve a saved origin without changing the document or guessing among duplicates. */
export function resolveTaskOrigin(doc: Node, anchorJson: string): { from: number; to: number } | null {
  let anchor: { from?: unknown; to?: unknown; quote?: unknown };
  try { anchor = JSON.parse(anchorJson); } catch { return null; }
  if (!anchor || typeof anchor !== "object") return null;
  const { from, to, quote } = anchor;
  if (typeof quote !== "string") return null;
  if (typeof from === "number" && typeof to === "number" && Number.isInteger(from) && Number.isInteger(to)
    && from >= 1 && to >= from && to <= doc.content.size
    && doc.textBetween(from, to, " ").trim() === quote) return { from, to };
  if (!quote) return null;
  let text = "";
  const positions: number[] = [];
  doc.descendants((node, position) => {
    if (node.isTextblock && text) { text += " "; positions.push(position); }
    if (node.isText && node.text) {
      for (let offset = 0; offset < node.text.length; offset++) {
        text += node.text[offset]; positions.push(position + offset);
      }
    }
  });
  const index = text.indexOf(quote);
  if (index < 0 || text.indexOf(quote, index + 1) >= 0) return null;
  return { from: positions[index], to: positions[index + quote.length - 1] + 1 };
}
