// "Set as Default Shape / Line / Text Box": the formatting of one object becomes the starting
// format of new objects of its kind, stored with the presentation like PowerPoint's object
// defaults. Geometry, text and glue are never part of it.
import { isLinearShape } from "./presentation-interactions";
import { presentationShapeDefaultsSchema, type PresentationElement, type PresentationSettings, type PresentationShapeDefaults } from "./presentation-model";

type Kind = keyof PresentationSettings["defaults"];
const SHAPE_KEYS = ["fill", "stroke", "strokeWidth", "opacity", "dash", "fillStyle", "fillTransparency", "lineTransparency", "compound", "cap", "join", "effects", "startHead", "endHead", "startSize", "endSize", "headSize", "color", "fontSize", "bold", "italic", "underline", "font", "align", "body", "textStyle"] as const;
const TEXT_KEYS = ["color", "fontSize", "bold", "italic", "underline", "font", "align", "body", "textStyle"] as const;

export function defaultsKind(element: PresentationElement): Kind | null {
  if (element.type === "text") return "textBox";
  if (element.type !== "shape" || element.content.connection) return element.type === "shape" ? "line" : null;
  return isLinearShape(element) ? "line" : "shape";
}

/** The object's format as a default; a picture fill is left out, as its file belongs to this object. */
export function pickDefaults(element: PresentationElement): { kind: Kind; defaults: PresentationShapeDefaults } | null {
  const kind = defaultsKind(element);
  if (!kind || (element.type !== "shape" && element.type !== "text")) return null;
  const source = element.content as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of kind === "textBox" ? TEXT_KEYS : SHAPE_KEYS) if (source[key] !== undefined) picked[key] = source[key];
  if ((picked.fillStyle as { type?: string } | undefined)?.type === "picture") delete picked.fillStyle;
  const parsed = presentationShapeDefaultsSchema.safeParse(picked);
  return parsed.success ? { kind, defaults: parsed.data } : null;
}

/** A newly drawn object in the presentation's default format for its kind. */
export function applyDefaults(element: PresentationElement, defaults: PresentationSettings["defaults"] | undefined): PresentationElement {
  const kind = defaultsKind(element), format = kind && defaults?.[kind];
  if (!format) return element;
  if (element.type === "text") {
    const { color, fontSize, bold, italic, underline, font, align, body, textStyle } = format;
    return { ...element, content: { ...element.content, ...(color !== undefined && { color }), ...(fontSize !== undefined && { fontSize }), ...(bold !== undefined && { bold }),
      ...(italic !== undefined && { italic }), ...(underline !== undefined && { underline }), ...(font !== undefined && { font }), ...(align !== undefined && { align }),
      ...(body !== undefined && { body }), ...(textStyle !== undefined && { textStyle }) } };
  }
  if (element.type === "shape") return { ...element, content: { ...element.content, ...format } };
  return element;
}
