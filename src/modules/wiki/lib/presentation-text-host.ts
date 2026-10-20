import type { PresentationElement } from "./presentation";

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
  };
}

/** The editable text of a text host, in a text element's content shape. */
export function textHostContent(element: Extract<PresentationElement, { type: "text" }> | ShapeElement): TextContent {
  return element.type === "text" ? element.content : shapeTextContent(element.content);
}

/** Writes edited text (and its runs) back into a text host. */
export function withHostText(element: PresentationElement, next: { text: string; runs?: TextContent["runs"] }): PresentationElement {
  if (element.type === "text") return { ...element, content: { ...element.content, text: next.text, runs: next.runs } };
  if (element.type === "shape") return { ...element, content: { ...element.content, text: next.text || undefined, runs: next.text ? next.runs : undefined } };
  return element;
}
