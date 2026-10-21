// DrawingML for the Format pane: colours, solid/gradient/pattern/picture fills, line details
// (dash, compound, cap, join, arrowheads), the effect list and 3-D scene/bevel. Lengths arrive
// in canvas units (pt on a 960-wide slide) and leave in EMU through the slide's scale, exactly
// like geometry, so an exported slide keeps the canvas proportions.
import type { PresentationShapeElement } from "./presentation";
import type { PresentationEffects, PresentationFillStyle, PresentationGradient } from "./presentation-format-model";
import type { SlideContext } from "./presentation-pptx-export-shapes";

export const DEFAULT_TEXT = "172033";
type ShapeContent = PresentationShapeElement["content"];

/** `#rgb`, `#rrggbb` or `#rrggbbaa` to `RRGGBB` plus alpha; anything else (themes, CSS variables) is null. */
export function hexColor(value: string | undefined): { hex: string; alpha: number } | null {
  const match = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return { hex: digits.slice(0, 6).toUpperCase(), alpha: digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1 };
}
export const colorXml = (value: string | undefined, opacity = 1, fallback?: string) => {
  const color = hexColor(value) ?? (fallback ? { hex: fallback, alpha: 1 } : null);
  if (!color) return null;
  const alpha = Math.round(Math.max(0, Math.min(1, color.alpha * opacity)) * 100000);
  return alpha < 100000 ? `<a:srgbClr val="${color.hex}"><a:alpha val="${alpha}"/></a:srgbClr>` : `<a:srgbClr val="${color.hex}"/>`;
};
export const solidFill = (value: string | undefined, opacity = 1, fallback?: string) => { const color = colorXml(value, opacity, fallback); return color ? `<a:solidFill>${color}</a:solidFill>` : "<a:noFill/>"; };

export const emu = (px: number, ctx: SlideContext) => Math.round(px * ctx.scale);
/** A canvas length as hundredths of a slide point, the unit of font sizes and spacing. */
export const pt100 = (value: number, ctx: SlideContext) => Math.round(value * ctx.scale / 12700 * 100);
/** Degrees to DrawingML's 60000ths, normalised to 0..360. */
export const angle60k = (degrees: number) => Math.round((((degrees % 360) + 360) % 360) * 60000);
/** A 0..1 share in DrawingML's 1000ths of a percent. */
const pct = (share: number) => Math.round(share * 100000);
export const opaque = (transparency?: number) => 1 - (transparency ?? 0);

export function gradientFillXml(gradient: PresentationGradient, opacity = 1) {
  const stops = [...gradient.stops].sort((a, b) => a.position - b.position)
    .map((stop) => `<a:gs pos="${pct(stop.position)}">${colorXml(stop.color, opacity * opaque(stop.transparency), "000000")}</a:gs>`).join("");
  const path = gradient.kind === "radial" ? "circle" : gradient.kind === "rectangular" ? "rect" : "shape";
  const shade = gradient.kind === "linear" ? `<a:lin ang="${angle60k(gradient.angle)}" scaled="0"/>` : `<a:path path="${path}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>`;
  return `<a:gradFill rotWithShape="${gradient.rotateWithShape === false ? 0 : 1}"><a:gsLst>${stops}</a:gsLst>${shade}</a:gradFill>`;
}

export const patternFillXml = (fill: Extract<PresentationFillStyle, { type: "pattern" }>, opacity = 1) =>
  `<a:pattFill prst="${fill.pattern}"><a:fgClr>${colorXml(fill.foreground, opacity, "000000")}</a:fgClr><a:bgClr>${colorXml(fill.background, opacity, "FFFFFF")}</a:bgClr></a:pattFill>`;

/** A picture fill through the slide's image relationships; null when the image cannot be embedded. */
function pictureFillXml(fill: Extract<PresentationFillStyle, { type: "picture" }>, ctx: SlideContext, opacity: number) {
  const media = ctx.image(fill.attachmentId);
  if (!media) return null;
  const alpha = opacity * opaque(fill.transparency);
  return `<a:blipFill rotWithShape="1"><a:blip r:embed="${media.rId}">${alpha < 1 ? `<a:alphaModFix amt="${pct(alpha)}"/>` : ""}</a:blip>${fill.tile ? '<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>' : "<a:stretch><a:fillRect/></a:stretch>"}</a:blipFill>`;
}

/** A closed shape's fill: the fill style when one is set, else the solid colour (or the element background). */
export function shapeFillXml(content: ShapeContent, background: string | undefined, ctx: SlideContext) {
  if (content.freeform && !content.freeform.closed) return "<a:noFill/>";
  const opacity = content.opacity * opaque(content.fillTransparency);
  const style = content.fillStyle;
  if (style?.type === "gradient") return gradientFillXml(style, opacity);
  if (style?.type === "pattern") return patternFillXml(style, opacity);
  if (style?.type === "picture") { const xml = pictureFillXml(style, ctx, opacity); if (xml) return xml; }
  return content.fill ? solidFill(content.fill, opacity) : solidFill(background, opacity);
}

const dashes: Record<NonNullable<ShapeContent["dash"]>, string> = {
  solid: "solid", roundDot: "sysDot", squareDot: "sysDot", dash: "dash", dashDot: "dashDot",
  longDash: "lgDash", longDashDot: "lgDashDot", longDashDotDot: "lgDashDotDot", dot: "sysDot",
};
const caps = { flat: "flat", round: "rnd", square: "sq" } as const;
const compounds = { single: "sng", double: "dbl", thickThin: "thickThin", thinThick: "thinThick", triple: "tri" } as const;
const heads = { triangle: "triangle", open: "arrow", stealth: "stealth", diamond: "diamond", oval: "oval" } as const;
export type LineEnds = { start: string; end: string };

/** `<a:ln>`: fill, dash, join, then the head and tail ends, in schema order. */
export function lineXml(content: ShapeContent, ctx: SlideContext, endpoints?: LineEnds) {
  if (!content.strokeWidth) return "<a:ln><a:noFill/></a:ln>";
  const dash = dashes[content.dash ?? "solid"] ?? "solid";
  const cap = content.cap ? caps[content.cap] : content.dash === "roundDot" ? "rnd" : undefined;
  const attributes = `${cap ? ` cap="${cap}"` : ""}${content.compound ? ` cmpd="${compounds[content.compound]}"` : ""}`;
  const join = content.join === "bevel" ? "<a:bevel/>" : content.join === "miter" ? '<a:miter lim="800000"/>' : "<a:round/>";
  const ratio = (content.headSize ?? Math.max(content.strokeWidth * 3, 10)) / content.strokeWidth;
  const headSize = ratio < 2.5 ? "sm" : ratio < 4 ? "med" : "lg";
  const end = (tag: string, style: string, size = content[tag === "headEnd" ? "startSize" : "endSize"]) => style === "none" || !(style in heads) ? ""
    : `<a:${tag} type="${heads[style as keyof typeof heads]}" w="${size?.width ?? headSize}" len="${size?.length ?? headSize}"/>`;
  const fill = solidFill(content.stroke, content.opacity * opaque(content.lineTransparency), DEFAULT_TEXT);
  return `<a:ln w="${Math.max(0, emu(content.strokeWidth, ctx))}"${attributes}>${fill}<a:prstDash val="${dash}"/>${join}${endpoints ? end("headEnd", endpoints.start) + end("tailEnd", endpoints.end) : ""}</a:ln>`;
}

/** `<a:effectLst>` in schema order (glow, innerShdw, outerShdw, reflection, softEdge), or "" when empty. */
export function effectsXml(effects: Partial<PresentationEffects> | undefined, ctx: SlideContext) {
  if (!effects) return "";
  const parts: string[] = [];
  const { glow, shadow, reflection } = effects;
  if (glow && glow.size > 0) parts.push(`<a:glow rad="${emu(glow.size, ctx)}">${colorXml(glow.color, opaque(glow.transparency), "000000")}</a:glow>`);
  if (shadow) {
    const color = colorXml(shadow.color, opaque(shadow.transparency), "000000");
    const placement = `blurRad="${emu(shadow.blur, ctx)}" dist="${emu(shadow.distance, ctx)}" dir="${angle60k(shadow.angle)}"`;
    const scale = Math.round(shadow.size * 1000);
    if (shadow.type === "inner") parts.push(`<a:innerShdw ${placement}>${color}</a:innerShdw>`);
    // A perspective shadow is PowerPoint's flattened, skewed outer shadow cast behind the shape.
    else if (shadow.type === "perspective") parts.push(`<a:outerShdw ${placement} sx="${scale}" sy="${Math.round(scale * 0.23)}" kx="1200000" algn="b" rotWithShape="0">${color}</a:outerShdw>`);
    else parts.push(`<a:outerShdw ${placement}${scale !== 100000 ? ` sx="${scale}" sy="${scale}"` : ""} algn="ctr" rotWithShape="0">${color}</a:outerShdw>`);
  }
  if (reflection) parts.push(`<a:reflection blurRad="${emu(reflection.blur, ctx)}" stA="${pct(opaque(reflection.transparency))}" endPos="${Math.round(reflection.size * 1000)}" dist="${emu(reflection.distance, ctx)}" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>`);
  if (effects.softEdges) parts.push(`<a:softEdge rad="${emu(effects.softEdges, ctx)}"/>`);
  return parts.length ? `<a:effectLst>${parts.join("")}</a:effectLst>` : "";
}

/** `<a:scene3d>` and `<a:sp3d>` for 3-D rotation and a top bevel, or "" when neither is set. */
export function threeDXml(effects: Pick<PresentationEffects, "bevel" | "rotation3d"> | undefined, ctx: SlideContext) {
  if (!effects?.bevel && !effects?.rotation3d) return "";
  const r = effects.rotation3d;
  const rot = r && (r.x || r.y || r.z) ? `<a:rot lat="${angle60k(r.y)}" lon="${angle60k(r.x)}" rev="${angle60k(r.z)}"/>` : "";
  const camera = r?.perspective ? `<a:camera prst="perspectiveFront" fov="${Math.round(r.perspective * 60000)}">${rot}</a:camera>` : rot ? `<a:camera prst="orthographicFront">${rot}</a:camera>` : '<a:camera prst="orthographicFront"/>';
  const bevel = effects.bevel ? `<a:sp3d><a:bevelT w="${emu(effects.bevel.width, ctx)}" h="${emu(effects.bevel.height, ctx)}" prst="${effects.bevel.preset}"/></a:sp3d>` : "";
  return `<a:scene3d>${camera}<a:lightRig rig="threePt" dir="t"/></a:scene3d>${bevel}`;
}
