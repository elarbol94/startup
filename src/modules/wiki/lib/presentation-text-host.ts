import type { PresentationElement } from "./presentation";
import { presetTextRect } from "./preset-shapes/preset-geometry";
import { presentationTextFits } from "./presentation-layout";

type TextContent = Extract<PresentationElement, { type: "text" }>["content"];
type ShapeElement = Extract<PresentationElement, { type: "shape" }>;

const LINEAR = new Set(["line", "arrow", "doubleArrow"]);
/** Default size and inset of text typed into a shape. */
export const SHAPE_TEXT_SIZE = 24;
export const SHAPE_TEXT_PADDING = 8;

/** Elements that hold editable text on the canvas: text boxes and every closed shape. */
export function isTextHost(element: PresentationElement | null | undefined): element is Extract<PresentationElement, { type: "text" }> | ShapeElement {
  return element?.type === "text" || (element?.type === "shape" && !LINEAR.has(element.content.shape) && !element.content.connection);
}

/** A shape's text seen as a text element's content, so typography and editing are shared. */
export function shapeTextContent(content: ShapeElement["content"]): TextContent {
  return {
    text: content.text ?? "", runs: content.runs, fontSize: content.fontSize ?? SHAPE_TEXT_SIZE,
    bold: content.bold ?? false, color: content.color ?? "", align: content.align ?? "center",
    italic: content.italic, underline: content.underline, font: content.font, padding: SHAPE_TEXT_PADDING,
    body: content.body, paragraphs: content.paragraphs, textStyle: content.textStyle,
  };
}

/** The editable text of a text host, in a text element's content shape. */
export function textHostContent(element: Extract<PresentationElement, { type: "text" }> | ShapeElement): TextContent {
  return element.type === "text" ? element.content : shapeTextContent(element.content);
}

/** PowerPoint's default text insets inside a shape, in pt (= canvas units). */
export const SHAPE_TEXT_INSET = { x: 7.2, y: 3.6 };

/**
 * Where a shape's text sits, as percentages of its box: a preset's own text rectangle (a
 * triangle's lower middle, a callout's body), or the whole box for the older kinds.
 */
export function shapeTextBox(element: ShapeElement): { left: string; top: string; width: string; height: string } {
  const { preset, adjustments } = element.content;
  const rect = preset ? presetTextRect(preset, element.width, element.height, adjustments) : { x: 0, y: 0, width: element.width, height: element.height };
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  return { left: pct(rect.x, element.width), top: pct(rect.y, element.height), width: pct(rect.width, element.width), height: pct(rect.height, element.height) };
}

/** Writes edited text (and its runs) back into a text host. */
export function withHostText(element: PresentationElement, next: { text: string; runs?: TextContent["runs"]; paragraphs?: TextContent["paragraphs"] }): PresentationElement {
  if (element.type === "text") return { ...element, content: { ...element.content, text: next.text, runs: next.runs, paragraphs: next.paragraphs } };
  if (element.type === "shape") return { ...element, content: { ...element.content, text: next.text || undefined, runs: next.text ? next.runs : undefined, paragraphs: next.text ? next.paragraphs : undefined } };
  return element;
}

type Insets = { left: number; top: number; right: number; bottom: number };
/** Where text sits when its body does not say: text boxes at the top, shapes in the middle (PowerPoint's defaults). */
export function textBodyDefaults(element: Extract<PresentationElement, { type: "text" }> | ShapeElement): { anchor: "top" | "middle"; insets: Insets } {
  if (element.type === "text") {
    const p = element.content.padding ?? 0;
    return { anchor: "top", insets: { left: p, top: p, right: p, bottom: p } };
  }
  const inset = element.content.preset ? SHAPE_TEXT_INSET : { x: SHAPE_TEXT_PADDING, y: SHAPE_TEXT_PADDING };
  return { anchor: "middle", insets: { left: inset.x, top: inset.y, right: inset.x, bottom: inset.y } };
}

/**
 * "Shrink text on overflow" for shape text: the largest font scale (down to a quarter) at
 * which the text fits its text rectangle, by the same conservative measure as text boxes.
 */
export function shapeShrinkScale(element: ShapeElement): number {
  const c = element.content;
  if (c.body?.autofit !== "shrink" || !c.text) return 1;
  const { preset, adjustments } = c;
  const rect = preset ? presetTextRect(preset, element.width, element.height, adjustments) : { x: 0, y: 0, width: element.width, height: element.height };
  const insets = c.body.insets ?? textBodyDefaults(element).insets;
  const probe = (scale: number) => presentationTextFits({
    id: element.id, type: "text", x: 0, y: 0, rotation: 0,
    width: Math.max(1, rect.width - insets.left - insets.right), height: Math.max(1, rect.height - insets.top - insets.bottom),
    content: { ...shapeTextContent(c), padding: 0, fontSize: Math.max(1, Math.round(shapeTextContent(c).fontSize * scale)) },
  });
  if (probe(1)) return 1;
  let low = 0.25, high = 1;
  for (let i = 0; i < 8; i++) { const mid = (low + high) / 2; if (probe(mid)) low = mid; else high = mid; }
  return low;
}

/**
 * "Resize shape to fit text": a shape grows (or shrinks back) to the height its text needs,
 * keeping its top edge, like PowerPoint's spAutoFit. Other shapes are returned unchanged.
 */
export function fitShapeToText(element: ShapeElement): ShapeElement {
  const c = element.content;
  if (c.body?.autofit !== "resize" || !c.text) return element;
  const insets = c.body.insets ?? textBodyDefaults(element).insets;
  const fits = (height: number) => {
    const rect = c.preset ? presetTextRect(c.preset, element.width, height, c.adjustments) : { x: 0, y: 0, width: element.width, height };
    return presentationTextFits({ id: element.id, type: "text", x: 0, y: 0, rotation: 0,
      width: Math.max(1, rect.width - insets.left - insets.right), height: Math.max(1, rect.height - insets.top - insets.bottom),
      content: { ...shapeTextContent(c), padding: 0 } });
  };
  let low = 20, high = 20_000;
  while (low < high) { const mid = Math.floor((low + high) / 2); if (fits(mid)) high = mid; else low = mid + 1; }
  return Math.abs(low - element.height) < 1 ? element : { ...element, height: low };
}
