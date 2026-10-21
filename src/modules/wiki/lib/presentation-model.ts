// Zod schemas, types and defaults for presentation elements, steps, playback settings and
// the stored canvas envelope. Re-exported by presentation.ts.
import { z } from "zod";
import { presetShapeNameList } from "./preset-shapes/preset-shape-names";
import { isSourcePassageHref } from "./source-passage";
import { arrowHeads, lineDashes, presentationViewSettingsFields, runFormatFields, shapeFormatFields, textFormatFields } from "./presentation-format-model";

export const presentationFrameShapes = ["rect", "circle", "none"] as const;
export type PresentationFrameShape = (typeof presentationFrameShapes)[number];

export const presentationElementTypes = ["text", "image", "frame", "shape", "video", "audio", "chart", "icon"] as const;
export type PresentationElementType = (typeof presentationElementTypes)[number];

export const presentationShapeKinds = ["rect", "roundedRect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "parallelogram", "trapezoid", "chevron", "callout", "plus", "arrow", "doubleArrow", "line"] as const;
export type PresentationShapeKind = (typeof presentationShapeKinds)[number];

const geometrySchema = {
  id: z.string().min(1).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(20).max(20_000),
  height: z.number().finite().min(20).max(20_000),
  rotation: z.number().finite().min(-360).max(360).default(0),
  /** Optional so every presentation saved before backgrounds existed still parses. */
  background: z.string().max(32).optional(),
  parentId: z.string().min(1).max(64).optional(),
  locked: z.boolean().optional(),
  /** The frame this element opens as its detail page while presenting; see presentation-details. */
  detailId: z.string().min(1).max(64).optional(),
  source: z.object({ pageId: z.string().min(1).max(64), sectionId: z.string().max(200), reviewedFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), syncHeading: z.boolean().optional(), syncSubsections: z.boolean().optional(), knownSectionIds: z.array(z.string().min(1).max(200)).max(5000).optional(), approvedStructure: z.object({ level: z.number().int().min(1).max(6), parentSectionId: z.string().min(1).max(200).nullable() }).optional() }).nullable().optional(),
};

export const presentationFonts = ["sans", "serif", "mono", "arial", "georgia", "aptos"] as const;
export const presentationFontFamilies = { sans: "system-ui, sans-serif", serif: "Georgia, serif", mono: "ui-monospace, monospace", arial: "Arial, sans-serif", georgia: "Georgia, serif", aptos: "Aptos, 'Segoe UI', system-ui, sans-serif" };
export const presentationLinkSchema = z.string().max(2000).refine((value) => !value || isSourcePassageHref(value) || /^(https?:\/\/|mailto:)/i.test(value), "Use an http, https or mailto link");
export const presentationTextRunSchema = z.object({
  text: z.string().max(5000), bold: z.boolean().optional(), italic: z.boolean().optional(),
  underline: z.boolean().optional(), color: z.string().max(32).optional(), href: presentationLinkSchema.optional(),
  ...runFormatFields,
});

const textElementSchema = z.object({
  ...geometrySchema,
  type: z.literal("text"),
  content: z.object({
    text: z.string().max(5_000).default(""),
    fontSize: z.number().int().min(8).max(400).default(32),
    autoFit: z.object({ minFontSize: z.number().int().min(8).max(400), maxFontSize: z.number().int().min(8).max(400) }).refine(value => value.minFontSize <= value.maxFontSize).optional(),
    padding: z.number().min(0).max(100).optional(),
    bold: z.boolean().default(false),
    color: z.string().max(32).default(""),
    align: z.enum(["left", "center", "right"]).default("left"),
    font: z.enum(presentationFonts).optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    list: z.enum(["none", "bullet", "number"]).optional(),
    runs: presentationTextRunSchema.array().max(200).optional(),
    ...textFormatFields,
  }),
});

const imageElementSchema = z.object({
  ...geometrySchema,
  type: z.literal("image"),
  content: z.object({
    attachmentId: z.string().min(1).max(64),
    alt: z.string().max(500).default(""),
    fit: z.enum(["contain", "cover"]).optional(),
    mask: z.enum(["none", "circle", "rounded", "diamond"]).optional(),
    cropX: z.number().min(0).max(100).optional(),
    cropY: z.number().min(0).max(100).optional(),
    zoom: z.number().min(1).max(5).optional(),
  }),
});

const frameElementSchema = z.object({
  ...geometrySchema,
  type: z.literal("frame"),
  content: z.object({
    label: z.string().max(200).default(""),
    shape: z.enum(presentationFrameShapes).default("rect"),
    color: z.string().max(32).default(""),
    isGroup: z.boolean().optional(),
  }),
});

const mediaContentSchema = z.object({ attachmentId: z.string().min(1).max(64), title: z.string().max(500).default(""), loop: z.boolean().optional() });
const videoElementSchema = z.object({ ...geometrySchema, type: z.literal("video"), content: mediaContentSchema });
const audioElementSchema = z.object({ ...geometrySchema, type: z.literal("audio"), content: mediaContentSchema });
const chartElementSchema = z.object({ ...geometrySchema, type: z.literal("chart"), content: z.object({
  title: z.string().max(200), kind: z.enum(["bar", "line", "pie"]),
  data: z.object({ label: z.string().max(100), value: z.number().finite().min(-1e12).max(1e12) }).array().min(1).max(50),
  color: z.string().max(32).optional(),
}) });
export const presentationIconNames = ["target", "lightbulb", "users", "rocket", "heart", "globe", "check", "star", "calendar", "chart", "briefcase", "leaf"] as const;
const iconElementSchema = z.object({ ...geometrySchema, type: z.literal("icon"), content: z.object({ name: z.enum(presentationIconNames), color: z.string().max(32).optional(), label: z.string().max(200).optional() }) });

const pointSchema = z.object({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000) });
const connectionSiteNames = ["top", "right", "bottom", "left"] as const;
/** A side of the box, or the index of one of a preset shape's own connection sites. */
const connectionSiteSchema = z.union([z.enum(connectionSiteNames), z.number().int().min(0).max(64)]);

/** Empty `fill`/`stroke` mean "no fill" and "follow the theme", so shapes read on both. */
const shapeElementSchema = z.object({
  ...geometrySchema,
  type: z.literal("shape"),
  content: z.object({
    shape: z.enum(presentationShapeKinds).default("rect"),
    fill: z.string().max(32).default(""),
    stroke: z.string().max(32).default(""),
    strokeWidth: z.number().finite().min(0).max(200).default(2),
    opacity: z.number().finite().min(0).max(1).default(1),
    cornerRadius: z.number().finite().min(0).max(1000).optional(),
    dash: z.enum(lineDashes).optional(),
    startHead: z.enum(arrowHeads).optional(),
    endHead: z.enum(arrowHeads).optional(),
    ...shapeFormatFields,
    headSize: z.number().finite().min(1).max(1000).optional(),
    /** 0..1 setting of the yellow adjustment handle (slant, notch, inner radius...); see presentation-shape-geometry. */
    adjust: z.number().finite().min(0).max(1).optional(),
    /**
     * A PowerPoint (DrawingML) preset this shape draws instead of `shape`, with its
     * adjustment values in DrawingML units; see lib/preset-shapes. `shape` stays a legacy
     * kind for older readers.
     */
    preset: z.enum(presetShapeNameList).optional(),
    adjustments: z.record(z.string().max(16), z.number().finite().min(-100_000_000).max(100_000_000)).optional(),
    /** A freeform, curve or scribble: its path drawn in a `w` × `h` box, scaled to the shape. */
    freeform: z.object({ d: z.string().max(60_000), w: z.number().positive().max(20_000), h: z.number().positive().max(20_000), closed: z.boolean() }).optional(),
    /**
     * A connector: each end is glued to an element (at a connection site, or where the line
     * meets its outline) or free at a canvas point. At least one end is glued.
     */
    connection: z.object({
      fromId: z.string().min(1).max(64).optional(), toId: z.string().min(1).max(64).optional(),
      fromSite: connectionSiteSchema.optional(), toSite: connectionSiteSchema.optional(),
      from: pointSchema.optional(), to: pointSchema.optional(),
    }).refine((connection) => Boolean(connection.fromId || connection.toId)).optional(),
    /** How a line runs between its ends. Elbow and curved lines keep their computed path in `points`. */
    route: z.enum(["straight", "elbow", "curve"]).optional(),
    points: pointSchema.array().min(2).max(8).optional(),
    // Text inside the shape, as in PowerPoint. Same names and limits as a text element's
    // content, so the rich-text editor, its shared fragment and the renderer are reused.
    text: z.string().max(5_000).optional(),
    runs: presentationTextRunSchema.array().max(200).optional(),
    fontSize: z.number().int().min(8).max(400).optional(),
    color: z.string().max(32).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    font: z.enum(presentationFonts).optional(),
    ...textFormatFields,
  }),
});

/** What "Set as Default Shape" keeps: a shape's formatting without its geometry, text or glue. */
export const presentationShapeDefaultsSchema = shapeElementSchema.shape.content.omit({ shape: true, preset: true, adjustments: true, adjust: true, freeform: true, connection: true, route: true, points: true, text: true, runs: true, paragraphs: true }).partial();
export type PresentationShapeDefaults = z.infer<typeof presentationShapeDefaultsSchema>;

export const presentationElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  imageElementSchema,
  frameElementSchema,
  shapeElementSchema,
  videoElementSchema, audioElementSchema, chartElementSchema, iconElementSchema,
]);
export type PresentationElement = z.infer<typeof presentationElementSchema>;
export type PresentationTextElement = z.infer<typeof textElementSchema>;
export type PresentationImageElement = z.infer<typeof imageElementSchema>;
export type PresentationFrameElement = z.infer<typeof frameElementSchema>;
export type PresentationShapeElement = z.infer<typeof shapeElementSchema>;

export const presentationStepSchema = z.object({
  id: z.string().min(1).max(64),
  elementId: z.string().min(1).max(64),
  // Overrides the presentation's default autoplay duration for this stop only.
  durationMs: z.number().int().min(500).max(120_000).optional(),
  // Optional and additive so presentations saved before presenter notes existed still parse.
  notes: z.string().max(5_000).optional(),
  action: z.enum(["camera", "fadeIn", "fadeOut"]).optional(),
  animationMs: z.number().int().min(0).max(5000).optional(),
});
export type PresentationStep = z.infer<typeof presentationStepSchema>;

export const presentationElementsSchema = presentationElementSchema.array().max(500).superRefine((elements, ctx) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  if (byId.size !== elements.length) ctx.addIssue({ code: "custom", message: "Duplicate element ID" });
  for (const element of elements) {
    const seen = new Set([element.id]);
    let parentId = element.parentId;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent || parent.type !== "frame" || seen.has(parentId)) {
        ctx.addIssue({ code: "custom", message: "Invalid frame hierarchy" }); break;
      }
      seen.add(parentId); parentId = parent.parentId;
    }
    if (element.type === "text" && element.content.runs && element.content.runs.map((run) => run.text).join("") !== element.content.text) {
      ctx.addIssue({ code: "custom", message: "Text runs must match the plain text" });
    }
  }
});
export const presentationStepsSchema = presentationStepSchema.array().max(500);

export const presentationCameraEasings = ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "ease-out-back"] as const;
export type PresentationCameraEasing = (typeof presentationCameraEasings)[number];

/** Playback settings for one presentation: autoplay pacing plus the camera curve shared
 * by manual step navigation and autoplay, so the two never feel different. */
export const presentationSettingsSchema = z.object({
  defaultStepDurationMs: z.number().int().min(500).max(120_000).default(4_000),
  loop: z.boolean().default(false),
  cameraTransitionMs: z.number().int().min(100).max(5_000).default(700),
  cameraEasing: z.enum(presentationCameraEasings).default("ease-in-out"),
  ...presentationViewSettingsFields,
  /** Set as Default Shape / Line / Text Box: the format new objects of that kind start with. */
  defaults: z.object({ shape: presentationShapeDefaultsSchema.optional(), line: presentationShapeDefaultsSchema.optional(), textBox: presentationShapeDefaultsSchema.optional() }).default({}),
});
export type PresentationSettings = z.infer<typeof presentationSettingsSchema>;
export const defaultPresentationSettings: PresentationSettings = presentationSettingsSchema.parse({});

// react-flow's fitBounds/fitView take a d3-ease-style `(t) => t` function rather than a
// CSS easing keyword, so the setting's name is mapped to the small set of standard curves.
export const presentationCameraEasingFns: Record<PresentationCameraEasing, (t: number) => number> = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t),
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  // Standard "easeOutBack" curve (easings.net): overshoots past 1 before settling, giving
  // step transitions a slight camera "pop" instead of a flat glide.
  "ease-out-back": (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

export type PresentationBounds = { x: number; y: number; width: number; height: number };

/** Padding around a step target, as a share of the target's size. */
export const PRESENTATION_CAMERA_PADDING = 0.12;

/**
 * The canvas column used to hold a bare element array. It now holds an envelope that can
 * also carry the canvas background and playback settings, and the bare array stays
 * readable so presentations saved before the envelope existed keep opening.
 */
export const presentationCanvasSchema = z.union([
  z.object({
    elements: presentationElementsSchema,
    background: z.string().max(32).default(""),
    settings: presentationSettingsSchema.default(defaultPresentationSettings),
  }),
  presentationElementsSchema.transform((elements) => ({
    elements,
    background: "",
    settings: defaultPresentationSettings,
  })),
]);
export type PresentationCanvas = z.infer<typeof presentationCanvasSchema>;

export function parsePresentationCanvas(json: string): PresentationCanvas {
  try {
    return presentationCanvasSchema.parse(JSON.parse(json));
  } catch {
    return { elements: [], background: "", settings: defaultPresentationSettings };
  }
}
