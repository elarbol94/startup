// DrawingML for one exported slide: text boxes with runs, preset shapes, straight
// connectors, pictures, groups and labelled placeholders for what PowerPoint cannot hold
// natively. Geometry arrives in canvas px and leaves in EMU through `SlideContext`.
import type { PresentationElement, PresentationShapeElement, PresentationTextElement } from "./presentation";
import { imagePlacement, imageSize } from "./presentation-pptx-image";
import { xmlEscape } from "./presentation-pptx-export-parts";
import { effectsXml, emu, hexColor, lineXml, shapeFillXml, solidFill, threeDXml, type LineEnds } from "./presentation-pptx-export-format";
import { textBodyXml } from "./presentation-pptx-export-paragraphs";
import { SHAPE_TEXT_PADDING, shapeTextContent } from "./presentation-text-host";

export const pptxExportWarningCodes = ["chart", "icon", "video", "audio", "missingMedia", "unsupportedImage"] as const;
export type PptxExportWarningCode = (typeof pptxExportWarningCodes)[number];
export type PptxExportMedia = Record<string, { bytes: Uint8Array; mime: string }>;
export { hexColor, textBodyXml };

export type SlideContext = {
  /** EMU per canvas px and the canvas point that lands on the slide origin. */
  scale: number; originX: number; originY: number;
  nextId: () => number;
  /** Relationship id for an embedded image, or null (after a warning) when its bytes are missing or unsupported. */
  image: (attachmentId: string) => { rId: string; bytes: Uint8Array } | null;
  hyperlink: (href: string) => string;
  warn: (code: PptxExportWarningCode) => void;
};
type Box = { x: number; y: number; width: number; height: number; rotation: number };

const rotationAttr = (degrees: number) => { const rot = Math.round((((degrees % 360) + 360) % 360) * 60000); return rot ? ` rot="${rot}"` : ""; };
export const xfrm = (box: Box, ctx: SlideContext, extra = "") => `<a:xfrm${rotationAttr(box.rotation)}><a:off x="${emu(box.x - ctx.originX, ctx)}" y="${emu(box.y - ctx.originY, ctx)}"/><a:ext cx="${Math.max(0, emu(box.width, ctx))}" cy="${Math.max(0, emu(box.height, ctx))}"/>${extra}</a:xfrm>`;
const nv = (tag: "Sp" | "Pic" | "CxnSp" | "GrpSp", ctx: SlideContext, name: string, inner = "", descr = "") => {
  const id = ctx.nextId();
  return `<p:nv${tag}Pr><p:cNvPr id="${id}" name="${xmlEscape(`${name} ${id}`)}"${descr ? ` descr="${xmlEscape(descr.slice(0, 500))}"` : ""}/><p:cNv${tag}Pr${inner ? `>${inner}</p:cNv${tag}Pr>` : "/>"}<p:nvPr/></p:nv${tag}Pr>`;
};
const geometry = (preset: string, adjust?: number) => `<a:prstGeom prst="${preset}">${adjust !== undefined ? `<a:avLst><a:gd name="adj" fmla="val ${Math.round(adjust)}"/></a:avLst>` : "<a:avLst/>"}</a:prstGeom>`;

function textXml(element: PresentationTextElement, ctx: SlideContext) {
  return `<p:sp>${nv("Sp", ctx, "TextBox", "", "").replace("<p:cNvSpPr/>", '<p:cNvSpPr txBox="1"/>')}<p:spPr>${xfrm(element, ctx)}${geometry("rect")}${solidFill(element.background)}</p:spPr>${textBodyXml(element.content, ctx)}</p:sp>`;
}

// The newer kinds map to PowerPoint's own presets so they stay editable there; their adjustment
// handle positions keep PowerPoint's defaults.
const presets: Record<string, string> = {
  rect: "rect", roundedRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond",
  pentagon: "pentagon", hexagon: "hexagon", star: "star5", parallelogram: "parallelogram", trapezoid: "trapezoid",
  chevron: "chevron", callout: "wedgeRectCallout", plus: "plus",
};
export const isLinearKind = (kind: PresentationShapeElement["content"]["shape"]) => kind === "line" || kind === "arrow" || kind === "doubleArrow";
/** Effects and 3-D after the line, in `p:spPr` schema order. */
const decorationXml = (content: PresentationShapeElement["content"], ctx: SlideContext) => effectsXml(content.effects, ctx) + threeDXml(content.effects, ctx);

function shapeXml(element: PresentationShapeElement, ctx: SlideContext) {
  const c = element.content;
  if (isLinearKind(c.shape)) {
    // The canvas draws every linear shape as a horizontal stroke through the box centre, so
    // the connector is that stroke: zero height at mid-box, rotated about the same centre.
    const start = c.startHead ?? (c.shape === "doubleArrow" ? "triangle" : "none");
    const end = c.endHead ?? (c.shape === "arrow" || c.shape === "doubleArrow" ? "triangle" : "none");
    if (c.points && c.route && c.route !== "straight") return routedLineXml(element, ctx, { start, end });
    const box = { ...element, y: element.y + element.height / 2, height: 0 };
    return `<p:cxnSp>${nv("CxnSp", ctx, "Connector")}<p:spPr>${xfrm(box, ctx)}${geometry("line")}${lineXml(c, ctx, { start, end })}${decorationXml(c, ctx)}</p:spPr></p:cxnSp>`;
  }
  const radius = c.shape === "roundedRect" ? Math.min(50000, (Math.min(c.cornerRadius ?? 20, element.width / 2, element.height / 2) / Math.min(element.width, element.height)) * 100000) : undefined;
  const fill = shapeFillXml(c, element.background, ctx);
  const text = c.text ? textBodyXml({ ...shapeTextContent(c), body: c.body, paragraphs: c.paragraphs, textStyle: c.textStyle }, ctx, { anchor: "ctr", inset: SHAPE_TEXT_PADDING }) : "";
  // An open freeform carries arrowheads like a line.
  const ends = c.freeform && !c.freeform.closed && (c.startHead || c.endHead) ? { start: c.startHead ?? "none", end: c.endHead ?? "none" } : undefined;
  // A PowerPoint preset goes back as itself, with its adjustment values: a lossless round trip.
  const shapeGeometry = c.freeform ? freeformGeometry(c.freeform, element, ctx)
    : c.preset ? `<a:prstGeom prst="${c.preset}">${c.adjustments && Object.keys(c.adjustments).length ? `<a:avLst>${Object.entries(c.adjustments).map(([name, value]) => `<a:gd name="${xmlEscape(name)}" fmla="val ${Math.round(value)}"/>`).join("")}</a:avLst>` : "<a:avLst/>"}</a:prstGeom>`
    : geometry(presets[c.shape] ?? "rect", radius);
  return `<p:sp>${nv("Sp", ctx, "Shape")}<p:spPr>${xfrm(element, ctx)}${shapeGeometry}${fill}${lineXml(c, ctx, ends)}${decorationXml(c, ctx)}</p:spPr>${text}</p:sp>`;
}

/** A freeform, curve or scribble as custom geometry: its path in its own w × h space. */
function freeformGeometry(freeform: NonNullable<PresentationShapeElement["content"]["freeform"]>, element: PresentationShapeElement, ctx: SlideContext) {
  const tokens = freeform.d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const sx = element.width / freeform.w, sy = element.height / freeform.h;
  const pt = (x: string, y: string) => `<a:pt x="${emu(Number(x) * sx, ctx)}" y="${emu(Number(y) * sy, ctx)}"/>`;
  let xml = "";
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === "M") { xml += `<a:moveTo>${pt(tokens[i], tokens[i + 1])}</a:moveTo>`; i += 2; }
    else if (command === "L") { xml += `<a:lnTo>${pt(tokens[i], tokens[i + 1])}</a:lnTo>`; i += 2; }
    else if (command === "C") { xml += `<a:cubicBezTo>${pt(tokens[i], tokens[i + 1])}${pt(tokens[i + 2], tokens[i + 3])}${pt(tokens[i + 4], tokens[i + 5])}</a:cubicBezTo>`; i += 6; }
    else if (command === "Z") xml += "<a:close/>";
  }
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.max(1, emu(element.width, ctx))}" h="${Math.max(1, emu(element.height, ctx))}">${xml}</a:path></a:pathLst></a:custGeom>`;
}

/** An elbow or curved connector: its path as custom geometry inside its box, with the same line ends. */
function routedLineXml(element: PresentationShapeElement, ctx: SlideContext, ends: LineEnds) {
  const points = element.content.points!;
  const w = Math.max(1, emu(element.width, ctx)), h = Math.max(1, emu(element.height, ctx));
  const pt = (p: { x: number; y: number }) => `<a:pt x="${emu(p.x, ctx)}" y="${emu(p.y, ctx)}"/>`;
  const segments = element.content.route === "curve" && points.length === 4
    ? `<a:cubicBezTo>${pt(points[1])}${pt(points[2])}${pt(points[3])}</a:cubicBezTo>`
    : points.slice(1).map((p) => `<a:lnTo>${pt(p)}</a:lnTo>`).join("");
  const geometryXml = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}" fill="none"><a:moveTo>${pt(points[0])}</a:moveTo>${segments}</a:path></a:pathLst></a:custGeom>`;
  return `<p:sp>${nv("Sp", ctx, "Connector")}<p:spPr>${xfrm({ ...element, rotation: 0 }, ctx)}${geometryXml}<a:noFill/>${lineXml(element.content, ctx, ends)}${decorationXml(element.content, ctx)}</p:spPr></p:sp>`;
}

const masks = { circle: "ellipse", rounded: "roundRect", diamond: "diamond" } as const;
function imageXml(element: Extract<PresentationElement, { type: "image" }>, ctx: SlideContext) {
  const media = ctx.image(element.content.attachmentId);
  if (!media) return placeholderXml(element, element.content.alt || "Image", ctx);
  const placement = imagePlacement(element, element.content, imageSize(media.bytes));
  if (!placement) return "";
  // The visible part may be smaller than the box (contain, panning); its centre is moved
  // with the box rotation so the picture stays where the canvas draws it.
  const radians = element.rotation * Math.PI / 180;
  const dx = placement.x + placement.width / 2 - element.width / 2, dy = placement.y + placement.height / 2 - element.height / 2;
  const cx = element.x + element.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians);
  const cy = element.y + element.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians);
  const box = { x: cx - placement.width / 2, y: cy - placement.height / 2, width: placement.width, height: placement.height, rotation: element.rotation };
  const pct = (value: number) => Math.round(value * 100000);
  const { l, t, r, b } = placement.crop;
  const crop = [["l", l], ["t", t], ["r", r], ["b", b]].filter(([, value]) => pct(value as number) > 0).map(([key, value]) => ` ${key}="${pct(value as number)}"`).join("");
  const mask = element.content.mask && element.content.mask !== "none" ? masks[element.content.mask] : "rect";
  return `<p:pic>${nv("Pic", ctx, "Picture", '<a:picLocks noChangeAspect="1"/>', element.content.alt)}<p:blipFill><a:blip r:embed="${media.rId}"/>${crop ? `<a:srcRect${crop}/>` : ""}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box, ctx)}${geometry(mask, mask === "roundRect" ? 10000 : undefined)}</p:spPr></p:pic>`;
}

/** A dashed, labelled box standing in for an object PowerPoint gets no native equivalent of. */
function placeholderXml(element: PresentationElement, text: string, ctx: SlideContext) {
  const fontSize = Math.max(8, Math.min(28, Math.round(Math.min(element.height / 6, element.width / 12))));
  const content: PresentationTextElement["content"] = { text: text.slice(0, 5000), fontSize, bold: false, color: "#312e81", align: "center" };
  return `<p:sp>${nv("Sp", ctx, "Placeholder")}<p:spPr>${xfrm(element, ctx)}${geometry("rect")}${solidFill("#eef2ff")}<a:ln w="${emu(1.5, ctx)}">${solidFill("#6366f1")}<a:prstDash val="dash"/></a:ln></p:spPr>${textBodyXml(content, ctx, { anchor: "ctr", inset: 8 })}</p:sp>`;
}

/** One element as DrawingML; `children` is the already rendered content of a group. */
export function elementXml(element: PresentationElement, ctx: SlideContext, children = ""): string {
  switch (element.type) {
    case "text": return textXml(element, ctx);
    case "shape": return shapeXml(element, ctx);
    case "image": return imageXml(element, ctx);
    case "frame": {
      if (element.content.isGroup) {
        if (!children) return "";
        const box = { ...element, rotation: 0 };
        // Children carry absolute, already rotated geometry, so the group adds no transform.
        return `<p:grpSp>${nv("GrpSp", ctx, "Group")}<p:grpSpPr>${xfrm(box, ctx, `<a:chOff x="${emu(element.x - ctx.originX, ctx)}" y="${emu(element.y - ctx.originY, ctx)}"/><a:chExt cx="${emu(element.width, ctx)}" cy="${emu(element.height, ctx)}"/>`)}</p:grpSpPr>${children}</p:grpSp>`;
      }
      // A section frame inside another slide's area: only its fill is visible content.
      const fill = hexColor(element.background) ? `<p:sp>${nv("Sp", ctx, "Frame")}<p:spPr>${xfrm(element, ctx)}${geometry(element.content.shape === "circle" ? "ellipse" : "rect")}${solidFill(element.background)}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>` : "";
      return fill + children;
    }
    case "chart": ctx.warn("chart"); return placeholderXml(element, [element.content.title, ...element.content.data.map((point) => `${point.label}: ${point.value}`)].filter(Boolean).join("\n"), ctx);
    case "icon": ctx.warn("icon"); return placeholderXml(element, element.content.label || element.content.name, ctx);
    case "video": ctx.warn("video"); return placeholderXml(element, `▶ ${element.content.title || "Video"}`, ctx);
    case "audio": ctx.warn("audio"); return placeholderXml(element, `♪ ${element.content.title || "Audio"}`, ctx);
  }
}
