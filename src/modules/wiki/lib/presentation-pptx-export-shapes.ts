// DrawingML for one exported slide: text boxes with runs, preset shapes, straight
// connectors, pictures, groups and labelled placeholders for what PowerPoint cannot hold
// natively. Geometry arrives in canvas px and leaves in EMU through `SlideContext`.
import type { PresentationElement, PresentationShapeElement, PresentationTextElement } from "./presentation";
import { imagePlacement, imageSize } from "./presentation-pptx-image";
import { xmlEscape } from "./presentation-pptx-export-parts";

export const pptxExportWarningCodes = ["chart", "icon", "video", "audio", "missingMedia", "unsupportedImage"] as const;
export type PptxExportWarningCode = (typeof pptxExportWarningCodes)[number];
export type PptxExportMedia = Record<string, { bytes: Uint8Array; mime: string }>;

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

const DEFAULT_TEXT = "172033";
const fonts = { sans: "Calibri", serif: "Times New Roman", mono: "Courier New", arial: "Arial", georgia: "Georgia" } as const;

/** `#rgb`, `#rrggbb` or `#rrggbbaa` to `RRGGBB` plus alpha; anything else (themes, CSS variables) is null. */
export function hexColor(value: string | undefined): { hex: string; alpha: number } | null {
  const match = /^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  return { hex: digits.slice(0, 6).toUpperCase(), alpha: digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1 };
}
const colorXml = (value: string | undefined, opacity = 1, fallback?: string) => {
  const color = hexColor(value) ?? (fallback ? { hex: fallback, alpha: 1 } : null);
  if (!color) return null;
  const alpha = Math.round(Math.max(0, Math.min(1, color.alpha * opacity)) * 100000);
  return alpha < 100000 ? `<a:srgbClr val="${color.hex}"><a:alpha val="${alpha}"/></a:srgbClr>` : `<a:srgbClr val="${color.hex}"/>`;
};
const solidFill = (value: string | undefined, opacity = 1, fallback?: string) => { const color = colorXml(value, opacity, fallback); return color ? `<a:solidFill>${color}</a:solidFill>` : "<a:noFill/>"; };

const emu = (px: number, ctx: SlideContext) => Math.round(px * ctx.scale);
const rotationAttr = (degrees: number) => { const rot = Math.round((((degrees % 360) + 360) % 360) * 60000); return rot ? ` rot="${rot}"` : ""; };
export const xfrm = (box: Box, ctx: SlideContext, extra = "") => `<a:xfrm${rotationAttr(box.rotation)}><a:off x="${emu(box.x - ctx.originX, ctx)}" y="${emu(box.y - ctx.originY, ctx)}"/><a:ext cx="${Math.max(0, emu(box.width, ctx))}" cy="${Math.max(0, emu(box.height, ctx))}"/>${extra}</a:xfrm>`;
const nv = (tag: "Sp" | "Pic" | "CxnSp" | "GrpSp", ctx: SlideContext, name: string, inner = "", descr = "") => {
  const id = ctx.nextId();
  return `<p:nv${tag}Pr><p:cNvPr id="${id}" name="${xmlEscape(`${name} ${id}`)}"${descr ? ` descr="${xmlEscape(descr.slice(0, 500))}"` : ""}/><p:cNv${tag}Pr${inner ? `>${inner}</p:cNv${tag}Pr>` : "/>"}<p:nvPr/></p:nv${tag}Pr>`;
};
const geometry = (preset: string, adjust?: number) => `<a:prstGeom prst="${preset}">${adjust !== undefined ? `<a:avLst><a:gd name="adj" fmla="val ${Math.round(adjust)}"/></a:avLst>` : "<a:avLst/>"}</a:prstGeom>`;

type Run = NonNullable<PresentationTextElement["content"]["runs"]>[number];
/** Paragraphs of styled runs: element-level bold/italic/underline/colour apply where a run sets nothing. */
export function textBodyXml(content: PresentationTextElement["content"], ctx: SlideContext, options: { anchor?: "t" | "ctr"; inset?: number } = {}) {
  const runs: Run[] = content.runs?.length ? content.runs : [{ text: content.text }];
  const paragraphs: Run[][] = [[]];
  for (const run of runs) run.text.split("\n").forEach((part, index) => {
    if (index) paragraphs.push([]);
    if (part) paragraphs.at(-1)!.push({ ...run, text: part });
  });
  const size = Math.round(Math.max(1, Math.min(4000, content.fontSize * ctx.scale / 12700)) * 100);
  const typeface = fonts[content.font ?? "sans"];
  const align = content.align === "center" ? "ctr" : content.align === "right" ? "r" : "l";
  const bullet = content.list === "bullet" ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : content.list === "number" ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>' : "<a:buNone/>";
  const indent = content.list && content.list !== "none" ? ` marL="${emu(content.fontSize * 1.2, ctx)}" indent="-${emu(content.fontSize * 1.2, ctx)}"` : ' marL="0" indent="0"';
  const runXml = (run: Run) => {
    const bold = run.bold ?? content.bold, italic = run.italic ?? content.italic, underline = run.underline ?? content.underline;
    const link = run.href && /^(https?:\/\/|mailto:)/i.test(run.href) ? `<a:hlinkClick r:id="${ctx.hyperlink(run.href)}"/>` : "";
    return `<a:r><a:rPr lang="de-AT" sz="${size}"${bold ? ' b="1"' : ""}${italic ? ' i="1"' : ""}${underline ? ' u="sng"' : ""} dirty="0">${solidFill(run.color || content.color, 1, DEFAULT_TEXT)}<a:latin typeface="${typeface}"/>${link}</a:rPr><a:t>${xmlEscape(run.text)}</a:t></a:r>`;
  };
  const inset = emu(options.inset ?? content.padding ?? 0, ctx);
  const body = paragraphs.map((paragraph) => `<a:p><a:pPr algn="${align}"${indent}>${paragraph.length ? bullet : "<a:buNone/>"}</a:pPr>${paragraph.map(runXml).join("")}<a:endParaRPr lang="de-AT" sz="${size}" dirty="0"/></a:p>`).join("");
  return `<p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" rtlCol="0" anchor="${options.anchor ?? "t"}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody>`;
}

function textXml(element: PresentationTextElement, ctx: SlideContext) {
  return `<p:sp>${nv("Sp", ctx, "TextBox", "", "").replace("<p:cNvSpPr/>", '<p:cNvSpPr txBox="1"/>')}<p:spPr>${xfrm(element, ctx)}${geometry("rect")}${solidFill(element.background)}</p:spPr>${textBodyXml(element.content, ctx)}</p:sp>`;
}

const presets: Record<string, string> = { rect: "rect", roundedRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond" };
const heads = { triangle: "triangle", open: "arrow" } as const;
export const isLinearKind = (kind: PresentationShapeElement["content"]["shape"]) => kind === "line" || kind === "arrow" || kind === "doubleArrow";

function lineXml(content: PresentationShapeElement["content"], ctx: SlideContext, endpoints?: { start: string; end: string }) {
  if (!content.strokeWidth) return "<a:ln><a:noFill/></a:ln>";
  const dash = content.dash === "dash" ? "dash" : content.dash === "dot" ? "sysDot" : "solid";
  const ratio = (content.headSize ?? Math.max(content.strokeWidth * 3, 10)) / content.strokeWidth;
  const headSize = ratio < 2.5 ? "sm" : ratio < 4 ? "med" : "lg";
  const end = (tag: string, style: string) => style === "none" ? "" : `<a:${tag} type="${heads[style as keyof typeof heads]}" w="${headSize}" len="${headSize}"/>`;
  return `<a:ln w="${Math.max(0, emu(content.strokeWidth, ctx))}">${solidFill(content.stroke, content.opacity, DEFAULT_TEXT)}<a:prstDash val="${dash}"/><a:round/>${endpoints ? end("headEnd", endpoints.start) + end("tailEnd", endpoints.end) : ""}</a:ln>`;
}

function shapeXml(element: PresentationShapeElement, ctx: SlideContext) {
  const c = element.content;
  if (isLinearKind(c.shape)) {
    // The canvas draws every linear shape as a horizontal stroke through the box centre, so
    // the connector is that stroke: zero height at mid-box, rotated about the same centre.
    const start = c.startHead ?? (c.shape === "doubleArrow" ? "triangle" : "none");
    const end = c.endHead ?? (c.shape === "arrow" || c.shape === "doubleArrow" ? "triangle" : "none");
    const box = { ...element, y: element.y + element.height / 2, height: 0 };
    return `<p:cxnSp>${nv("CxnSp", ctx, "Connector")}<p:spPr>${xfrm(box, ctx)}${geometry("line")}${lineXml(c, ctx, { start, end })}</p:spPr></p:cxnSp>`;
  }
  const radius = c.shape === "roundedRect" ? Math.min(50000, (Math.min(c.cornerRadius ?? 20, element.width / 2, element.height / 2) / Math.min(element.width, element.height)) * 100000) : undefined;
  const fill = c.fill ? solidFill(c.fill, c.opacity) : solidFill(element.background, c.opacity);
  return `<p:sp>${nv("Sp", ctx, "Shape")}<p:spPr>${xfrm(element, ctx)}${geometry(presets[c.shape], radius)}${fill}${lineXml(c, ctx)}</p:spPr></p:sp>`;
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
