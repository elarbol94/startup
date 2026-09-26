import type { PresentationElement } from "./presentation";

/** Canvas distance (x and y) between repeated pastes of the same content. */
export const PRESENTATION_PASTE_OFFSET = 24;

/** Where the previous paste went, so the next paste of the same content lands beside it. */
export type PresentationPasteRecord = { source: string; target: string; center: { x: number; y: number } };

function contentCenter(elements: PresentationElement[]) {
  const left = Math.min(...elements.map((e) => e.x)), top = Math.min(...elements.map((e) => e.y));
  const right = Math.max(...elements.map((e) => e.x + e.width)), bottom = Math.max(...elements.map((e) => e.y + e.height));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/**
 * The centre for the next paste. `source` identifies the copied content (one copy action) and
 * `target` where the author aims (the cursor position or "centre"). Pasting the same content
 * at the same target again moves on by `offset` from the previous paste, and a paste that
 * would land on (or within half a step of) the copied original is moved by one step, so nothing stacks unseen.
 */
export function planPaste(
  copied: PresentationElement[],
  { source, target, point, offset = PRESENTATION_PASTE_OFFSET }: { source: string; target: string; point: { x: number; y: number }; offset?: number },
  previous: PresentationPasteRecord | null,
): PresentationPasteRecord {
  let center = previous && previous.source === source && previous.target === target
    ? { x: previous.center.x + offset, y: previous.center.y + offset }
    : point;
  const original = copied.length ? contentCenter(copied) : null;
  if (original && Math.abs(original.x - center.x) < offset / 2 && Math.abs(original.y - center.y) < offset / 2) center = { x: center.x + offset, y: center.y + offset };
  return { source, target, center };
}
