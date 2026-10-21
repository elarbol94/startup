// Maps the Format-pane details pptxtojson exposes back onto the model: gradient, pattern and
// picture fills, fill and line transparency, dash kinds, arrowhead kinds and sizes, the outer
// shadow and the text box layout (anchor, wrap, autofit, insets, vertical text). Everything
// else (glow, reflection, 3-D, compound lines, caps, joins, WordArt) is not in its output.
import type { Fill, LineEnd, Shadow, Shape, Text } from "pptxtojson";
import { powerPointPatternNames } from "./powerpoint-patterns";
import type { PresentationShapeElement } from "./presentation";
import type { PresentationFillStyle, PresentationTextBody } from "./presentation-format-model";
import { pptxImageMime } from "./presentation-pptx-archive";
import type { PptxMapContext } from "./presentation-pptx-map";
import { pptxColor } from "./presentation-pptx-text";

type ShapeContent = PresentationShapeElement["content"];
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A pptxtojson colour (`#rrggbb` or `#rrggbbaa`) as `#rrggbb` plus its transparency. */
export function pptxColorAlpha(value?: string | null) {
  const color = pptxColor(value ?? undefined);
  if (!color) return undefined;
  const alpha = value!.length === 9 ? parseInt(value!.slice(7), 16) / 255 : 1;
  return { color, transparency: round(clamp(1 - alpha, 0, 1)) };
}

/** A gradient, pattern or picture fill as a fill style; null for solid or unmappable fills. */
export function pptxFillStyle(fill: Fill | null | undefined, ctx: PptxMapContext): PresentationFillStyle | null {
  if (fill?.type === "gradient") {
    const stops = fill.value.colors.flatMap((stop) => {
      const color = pptxColorAlpha(stop.color);
      const position = parseFloat(stop.pos) / 100;
      return color ? [{ color: color.color, position: round(clamp(Number.isFinite(position) ? position : 0, 0, 1), 4), ...(color.transparency ? { transparency: color.transparency } : {}) }] : [];
    }).slice(0, 10);
    if (stops.length < 2) return null;
    const kind = fill.value.path === "circle" ? "radial" : fill.value.path === "rect" ? "rectangular" : fill.value.path === "shape" ? "path" : "linear";
    return { type: "gradient", kind, angle: kind === "linear" ? ((Math.round(fill.value.rot || 0) % 360) + 360) % 360 : 0, stops };
  }
  if (fill?.type === "pattern") {
    const pattern = powerPointPatternNames.find((name) => name === fill.value.type);
    const foreground = pptxColor(fill.value.foregroundColor), background = pptxColor(fill.value.backgroundColor);
    return pattern && foreground && background ? { type: "pattern", pattern, foreground, background } : null;
  }
  if (fill?.type === "image") {
    const ref = fill.value.ref, bytes = ref ? ctx.files[ref] : undefined, mime = ref ? pptxImageMime(ref) : undefined;
    if (!ref || !bytes || !mime) return null;
    let item = ctx.media.find((entry) => entry.name === ref);
    if (!item) { item = { key: ctx.id(), name: ref, mime, bytes }; ctx.media.push(item); }
    const opacity = Number.isFinite(fill.value.opacity) ? clamp(fill.value.opacity, 0, 1) : 1;
    return { type: "picture", attachmentId: item.key, ...(opacity < 1 ? { transparency: round(1 - opacity) } : {}) };
  }
  return null;
}

/** pptxtojson's dash arrays, one per DrawingML prstDash it knows. */
const dashArrays: Record<string, NonNullable<ShapeContent["dash"]>> = {
  "5": "dash", "5, 5, 1, 5": "dashDot", "1, 5": "dot", "10, 5": "longDash", "10, 5, 1, 5, 1, 5": "longDashDotDot",
  "5, 2": "dash", "5, 2, 1, 5": "dashDot", "5, 2, 1, 5, 1, 5": "longDashDotDot", "2, 5": "squareDot",
};
const headKinds = { triangle: "triangle", arrow: "open", stealth: "stealth", diamond: "diamond", oval: "oval" } as const;
export const pptxHead = (end?: LineEnd) => end && end.type !== "none" ? headKinds[end.type] : undefined;
const headSize = (end?: LineEnd) => end && end.type !== "none" && (end.width || end.length) ? { width: end.width ?? "med", length: end.length ?? "med" } : undefined;

function shadowEffect(shadow: Shadow | undefined, factor: number): NonNullable<ShapeContent["effects"]>["shadow"] | undefined {
  if (!shadow || !Number.isFinite(shadow.h) || !Number.isFinite(shadow.v)) return undefined;
  const color = pptxColorAlpha(shadow.color) ?? { color: "#000000", transparency: 0 };
  const blur = typeof shadow.blur === "number" && Number.isFinite(shadow.blur) ? shadow.blur : 0;
  const angle = ((Math.round(Math.atan2(shadow.v, shadow.h) * 180 / Math.PI) % 360) + 360) % 360;
  return { type: "outer", color: color.color, transparency: color.transparency, size: 100, blur: round(clamp(blur * factor, 0, 100)), angle, distance: round(clamp(Math.hypot(shadow.h, shadow.v) * factor, 0, 200)) };
}

/** The Format-pane fields of a pptxtojson shape that go beyond fill colour, stroke and width. */
export function pptxShapeFormat(element: Shape, ctx: PptxMapContext, linear: boolean): Partial<ShapeContent> {
  const format: Partial<ShapeContent> = {};
  const fillStyle = linear ? null : pptxFillStyle(element.fill, ctx);
  if (fillStyle) format.fillStyle = fillStyle;
  const fill = !linear && element.fill?.type === "color" ? pptxColorAlpha(element.fill.value) : undefined;
  if (fill?.transparency) format.fillTransparency = fill.transparency;
  const line = element.borderWidth > 0 ? pptxColorAlpha(element.borderColor) : undefined;
  if (line?.transparency) format.lineTransparency = line.transparency;
  const dash = dashArrays[element.borderStrokeDasharray?.trim() ?? ""];
  if (dash) format.dash = dash;
  const startSize = headSize(element.headEnd), endSize = headSize(element.tailEnd);
  if (startSize) format.startSize = startSize;
  if (endSize) format.endSize = endSize;
  const shadow = shadowEffect(element.shadow, ctx.factor);
  if (shadow) format.effects = { shadow };
  return format;
}

/** The Text Box layout of a text or shape body; undefined when everything is the default. */
export function pptxTextBody(element: Text | Shape | undefined, factor: number): PresentationTextBody | undefined {
  if (!element) return undefined;
  const body: PresentationTextBody = {};
  if (element.vAlign === "mid") body.anchor = "middle";
  else if (element.vAlign === "down") body.anchor = "bottom";
  if (element.wrap === false) body.wrap = false;
  if (element.autoFit?.type === "shape") body.autofit = "resize";
  else if (element.autoFit?.type === "text") body.autofit = "shrink";
  if (element.type === "text" && element.isVertical) body.direction = "vertical";
  const inset = element.textInset;
  if (inset && !(inset.l === inset.t && inset.t === inset.r && inset.r === inset.b)) {
    const pt = (value: number) => round(clamp(value * factor, 0, 1000));
    body.insets = { left: pt(inset.l), top: pt(inset.t), right: pt(inset.r), bottom: pt(inset.b) };
  }
  return Object.keys(body).length ? body : undefined;
}
