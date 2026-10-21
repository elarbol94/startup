// Zod schemas for PowerPoint's Format pane, text body and paragraph options: fills, line
// details, effects, WordArt text styling, text box layout and paragraphs. All of them are
// optional additions to an element's content, so presentations saved before they existed parse
// unchanged. Evidence: docs/plans/presentation-powerpoint-formatting.md.
import { z } from "zod";
import { powerPointPatternNames } from "./powerpoint-patterns";

const color = z.string().max(32);
/** A share from 0 to 1: a transparency or a gradient stop's position. */
const share = z.number().finite().min(0).max(1);
const points = (max: number) => z.number().finite().min(0).max(max);

export const gradientKinds = ["linear", "radial", "rectangular", "path"] as const;
export const gradientFillSchema = z.object({
  type: z.literal("gradient"), kind: z.enum(gradientKinds), angle: z.number().finite().min(-360).max(360),
  stops: z.object({ color, position: share, transparency: share.optional() }).array().min(2).max(10),
  rotateWithShape: z.boolean().optional(),
});
export const patternFillSchema = z.object({ type: z.literal("pattern"), pattern: z.enum(powerPointPatternNames), foreground: color, background: color });
export const pictureFillSchema = z.object({ type: z.literal("picture"), attachmentId: z.string().min(1).max(64), tile: z.boolean().optional(), transparency: share.optional() });
/** A fill other than solid colour; a shape's plain `fill` stays the solid colour. */
export const fillStyleSchema = z.discriminatedUnion("type", [gradientFillSchema, patternFillSchema, pictureFillSchema]);
export type PresentationFillStyle = z.infer<typeof fillStyleSchema>;
export type PresentationGradient = z.infer<typeof gradientFillSchema>;

/** PowerPoint's dash types; `dash` and `dot` are the two kinds saved before them. */
export const lineDashes = ["solid", "roundDot", "squareDot", "dash", "dashDot", "longDash", "longDashDot", "longDashDotDot", "dot"] as const;
export type PresentationLineDash = (typeof lineDashes)[number];
export const lineCompounds = ["single", "double", "thickThin", "thinThick", "triple"] as const;
export const lineCaps = ["flat", "round", "square"] as const;
export const lineJoins = ["round", "bevel", "miter"] as const;
export const arrowHeads = ["none", "triangle", "open", "stealth", "diamond", "oval"] as const;
export type PresentationArrowHead = (typeof arrowHeads)[number];
export const arrowSizes = ["sm", "med", "lg"] as const;
export const arrowSizeSchema = z.object({ width: z.enum(arrowSizes), length: z.enum(arrowSizes) });

export const shadowSchema = z.object({
  type: z.enum(["outer", "inner", "perspective"]), color, transparency: share,
  /** Size in percent of the shape. */
  size: z.number().finite().min(1).max(200), blur: points(100), angle: z.number().finite().min(0).max(360), distance: points(200),
});
export const reflectionSchema = z.object({ transparency: share, size: z.number().finite().min(0).max(100), blur: points(100), distance: points(100) });
export const glowSchema = z.object({ color, size: points(150), transparency: share });
export const bevelPresets = ["circle", "relaxedInset", "cross", "coolSlant", "angle", "softRound", "convex", "slope", "divot", "riblet", "hardEdge", "artDeco"] as const;
export const bevelSchema = z.object({ preset: z.enum(bevelPresets), width: points(100), height: points(100) });
export const rotation3dSchema = z.object({
  x: z.number().finite().min(0).max(360), y: z.number().finite().min(0).max(360), z: z.number().finite().min(0).max(360),
  perspective: z.number().finite().min(0).max(120),
});
export const effectsSchema = z.object({
  shadow: shadowSchema.optional(), reflection: reflectionSchema.optional(), glow: glowSchema.optional(),
  softEdges: points(100).optional(), bevel: bevelSchema.optional(), rotation3d: rotation3dSchema.optional(),
});
export type PresentationEffects = z.infer<typeof effectsSchema>;

/** The Format pane's Text Box section. Absent fields keep the element kind's default. */
export const textBodySchema = z.object({
  anchor: z.enum(["top", "middle", "bottom"]).optional(),
  anchorCenter: z.boolean().optional(),
  direction: z.enum(["horizontal", "vertical", "vertical270", "stacked"]).optional(),
  autofit: z.enum(["none", "shrink", "resize"]).optional(),
  insets: z.object({ left: points(1000), top: points(1000), right: points(1000), bottom: points(1000) }).optional(),
  wrap: z.boolean().optional(),
  columns: z.number().int().min(1).max(16).optional(),
  columnSpacing: points(1000).optional(),
});
export type PresentationTextBody = z.infer<typeof textBodySchema>;

export const numberSchemes = ["arabicPeriod", "arabicParenR", "romanUcPeriod", "alphaUcPeriod", "alphaLcParenR", "alphaLcPeriod", "romanLcPeriod"] as const;
export type PresentationNumberScheme = (typeof numberSchemes)[number];
export const paragraphAligns = ["left", "center", "right", "justify", "distributed"] as const;
/** One paragraph's format, by position: `paragraphs[i]` formats the i-th line of the text. */
export const paragraphSchema = z.object({
  level: z.number().int().min(0).max(8).optional(),
  bullet: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("char"), char: z.string().min(1).max(4), font: z.string().max(64).optional() }),
    z.object({ kind: z.literal("number"), scheme: z.enum(numberSchemes), start: z.number().int().min(1).max(32767).optional() }),
  ]).optional(),
  align: z.enum(paragraphAligns).optional(),
  /** "Before text" indent and the special first-line indent, in pt. */
  indent: points(4000).optional(),
  special: z.enum(["none", "firstLine", "hanging"]).optional(),
  by: points(4000).optional(),
  spaceBefore: points(1584).optional(),
  spaceAfter: points(1584).optional(),
  lineSpacing: z.object({ rule: z.enum(["multiple", "exactly"]), value: z.number().finite().min(0).max(1584) }).optional(),
});
export type PresentationParagraph = z.infer<typeof paragraphSchema>;
export const paragraphsSchema = paragraphSchema.array().max(1000);

/** Character formatting beyond bold/italic/underline/colour, shared by every text run. */
export const runFormatFields = {
  strike: z.enum(["single", "double"]).optional(),
  /** Superscript/subscript offset in percent: PowerPoint uses +30 and −25. */
  baseline: z.number().finite().min(-100).max(100).optional(),
  highlight: color.optional(),
  /** Character spacing in pt; negative condenses. */
  spacing: z.number().finite().min(-100).max(1584).optional(),
  size: z.number().finite().min(1).max(400).optional(),
  caps: z.enum(["all", "small"]).optional(),
};

/** WordArt: Text Fill, Text Outline and Text Effects of a text box or shape text. */
export const textStyleSchema = z.object({
  fill: z.union([z.object({ type: z.literal("none") }), z.object({ type: z.literal("solid"), color, transparency: share.optional() }), gradientFillSchema, patternFillSchema]).optional(),
  outline: z.object({ color, width: points(100), transparency: share.optional() }).optional(),
  effects: effectsSchema.pick({ shadow: true, reflection: true, glow: true, bevel: true }).optional(),
  /** The WordArt gallery entry last applied, so the gallery can show it as current. */
  wordArt: z.number().int().min(0).max(19).optional(),
});
export type PresentationTextStyle = z.infer<typeof textStyleSchema>;

/** Text-related additions shared by text elements and shapes. */
export const textFormatFields = {
  body: textBodySchema.optional(),
  paragraphs: paragraphsSchema.optional(),
  textStyle: textStyleSchema.optional(),
};

/** Shape-only additions: the rest of the Format pane. */
export const shapeFormatFields = {
  fillStyle: fillStyleSchema.optional(),
  fillTransparency: share.optional(),
  lineTransparency: share.optional(),
  compound: z.enum(lineCompounds).optional(),
  cap: z.enum(lineCaps).optional(),
  join: z.enum(lineJoins).optional(),
  startSize: arrowSizeSchema.optional(),
  endSize: arrowSizeSchema.optional(),
  effects: effectsSchema.optional(),
};

/** Canvas-wide grid, guide and ruler settings (View → Grid and Guides). */
export const presentationGuideSchema = z.object({ id: z.string().min(1).max(64), axis: z.enum(["x", "y"]), position: z.number().finite().min(-1_000_000).max(1_000_000) });
export type PresentationGuide = z.infer<typeof presentationGuideSchema>;
export const PRESENTATION_GRID_SPACING = 28.35;
export const presentationViewSettingsFields = {
  /** `transparency` 0..1 of the gridline dots over the slide; 0 is fully opaque. */
  grid: z.object({ spacing: z.number().finite().min(1).max(1000), snap: z.boolean(), show: z.boolean(), transparency: share.default(0.15) }).default({ spacing: PRESENTATION_GRID_SPACING, snap: false, show: false, transparency: 0.15 }),
  guides: z.object({ show: z.boolean(), smart: z.boolean(), list: presentationGuideSchema.array().max(200) }).default({ show: false, smart: true, list: [] }),
  ruler: z.boolean().default(false),
};
