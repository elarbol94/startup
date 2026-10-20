/**
 * PowerPoint's keyboard edits of a selection, as observed in Microsoft 365 PowerPoint (see
 * docs/plans/presentation-powerpoint-parity.md): Arrow moves 0.72 pt, Shift+Arrow resizes by
 * 10 % of that side around the centre (Ctrl+Shift+Arrow by 1 %), Alt+Left/Right turns by 15°,
 * and Ctrl+Shift+>/< steps the font size along PowerPoint's size list.
 */
import type { PresentationElement } from "./presentation-model";
import type { PresentationGeometryChange } from "./presentation-transform";

/** One arrow press without snap to grid: 0.01 in. */
export const NUDGE_STEP = 0.72;
export const ROTATE_STEP = 15;
const MIN_SIZE = 20;
/** The sizes PowerPoint's font-size list offers (10.5 is skipped: sizes are whole points here). */
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];

export type ArrowKey = "arrowup" | "arrowdown" | "arrowleft" | "arrowright";

/** The next size up or down the list; beyond 96 it moves in steps of 12, up to 400. */
export function stepFontSize(size: number, up: boolean): number {
  if (up) return FONT_SIZES.find((candidate) => candidate > size) ?? Math.min(400, Math.floor(size / 12) * 12 + 12);
  if (size > 96) return Math.max(96, Math.ceil(size / 12) * 12 - 12);
  return [...FONT_SIZES].reverse().find((candidate) => candidate < size) ?? 8;
}

/** Arrow / Ctrl+Arrow: move every element by one nudge. */
export function nudge(elements: PresentationElement[], key: ArrowKey): PresentationGeometryChange[] {
  const dx = key === "arrowright" ? NUDGE_STEP : key === "arrowleft" ? -NUDGE_STEP : 0;
  const dy = key === "arrowdown" ? NUDGE_STEP : key === "arrowup" ? -NUDGE_STEP : 0;
  return elements.map((element) => ({ id: element.id, x: element.x + dx, y: element.y + dy }));
}

/**
 * Shift+Arrow resize: Right/Up grow the width/height by `fine` 1 % or 10 % of it, Left/Down
 * shrink it, keeping the centre where it is (observed: 120 → 132 wide, 80 → 88 tall).
 */
export function keyboardResize(elements: PresentationElement[], key: ArrowKey, fine: boolean): PresentationGeometryChange[] {
  const factor = fine ? 0.01 : 0.1;
  return elements.map((element) => {
    const horizontal = key === "arrowright" || key === "arrowleft";
    const grow = key === "arrowright" || key === "arrowup";
    const size = horizontal ? element.width : element.height;
    const next = Math.max(MIN_SIZE, Math.min(20_000, size + (grow ? 1 : -1) * size * factor));
    const delta = next - size;
    return horizontal
      ? { id: element.id, x: element.x - delta / 2, width: next, resizing: true }
      : { id: element.id, y: element.y - delta / 2, height: next, resizing: true };
  });
}

type TextContent = Extract<PresentationElement, { type: "text" }>["content"];
export type TextFormatKey = "bold" | "italic" | "underline" | "alignLeft" | "alignCenter" | "alignRight" | "fontBigger" | "fontSmaller";

/**
 * Ctrl+B/I/U, Ctrl+L/E/R and the font-size keys on a selected text box or shape: they apply to
 * all of its text, like PowerPoint. Bold, italic and underline toggle from the first element.
 */
export function formatTextHosts(elements: PresentationElement[], ids: ReadonlySet<string>, format: TextFormatKey): PresentationElement[] {
  const hosts = elements.filter((element) => ids.has(element.id) && (element.type === "text" || element.type === "shape"));
  const first = hosts[0];
  if (!first) return elements;
  const read = (element: PresentationElement): Partial<TextContent> => (element.content as Partial<TextContent>);
  const toggled = (flag: "bold" | "italic" | "underline") => !read(first)[flag];
  return elements.map((element) => {
    if (!hosts.includes(element)) return element;
    const content = read(element);
    let patch: Partial<TextContent>;
    switch (format) {
      case "bold": case "italic": case "underline": patch = { [format]: toggled(format), runs: content.runs?.map((run) => ({ ...run, [format]: undefined })) }; break;
      case "alignLeft": patch = { align: "left" }; break;
      case "alignCenter": patch = { align: "center" }; break;
      case "alignRight": patch = { align: "right" }; break;
      case "fontBigger": case "fontSmaller": {
        const size = content.fontSize ?? (element.type === "shape" ? 24 : 32);
        const next = stepFontSize(size, format === "fontBigger");
        patch = { fontSize: next, ...(element.type === "text" && element.content.autoFit ? { autoFit: { minFontSize: Math.min(element.content.autoFit.minFontSize, next), maxFontSize: next } } : {}) };
        break;
      }
    }
    return { ...element, content: { ...element.content, ...patch } } as PresentationElement;
  });
}
