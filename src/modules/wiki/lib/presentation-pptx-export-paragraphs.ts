// `<p:txBody>` for text boxes and shape text: the Text Box section (`a:bodyPr`), per-paragraph
// format (`a:pPr`: level, indents, spacing, bullets and numbering), character format
// (`a:rPr`: strike, caps, spacing, baseline, highlight) and WordArt fill, outline and effects.
// Children are written in DrawingML's schema order, which PowerPoint enforces.
import type { PresentationTextElement } from "./presentation";
import type { PresentationParagraph, PresentationTextStyle } from "./presentation-format-model";
import { colorXml, DEFAULT_TEXT, effectsXml, emu, gradientFillXml, hexColor, opaque, patternFillXml, pt100, solidFill, threeDXml } from "./presentation-pptx-export-format";
import { xmlEscape } from "./presentation-pptx-export-parts";
import type { SlideContext } from "./presentation-pptx-export-shapes";

type TextContent = PresentationTextElement["content"];
type Run = NonNullable<TextContent["runs"]>[number];

const fonts = { sans: "Calibri", serif: "Times New Roman", mono: "Courier New", arial: "Arial", georgia: "Georgia", aptos: "Aptos" } as const;
const aligns = { left: "l", center: "ctr", right: "r", justify: "just", distributed: "dist" } as const;
const anchors = { top: "t", middle: "ctr", bottom: "b" } as const;
const directions = { horizontal: "horz", vertical: "vert", vertical270: "vert270", stacked: "wordArtVert" } as const;
/** Each list level indents by a further half inch, as in PowerPoint. */
const LEVEL_INDENT = 36;

const bulletXml = (bullet: NonNullable<PresentationParagraph["bullet"]>) => {
  if (bullet.kind === "char") return `<a:buFont typeface="${xmlEscape(bullet.font || "Arial")}"/><a:buChar char="${xmlEscape(bullet.char)}"/>`;
  if (bullet.kind === "number") return `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${bullet.scheme}"${bullet.start && bullet.start !== 1 ? ` startAt="${bullet.start}"` : ""}/>`;
  return "<a:buNone/>";
};

/** The run's text fill: a WordArt fill when set (a run colour still wins over a solid one). */
function textFillXml(style: PresentationTextStyle | undefined, color: string) {
  const fill = style?.fill;
  if (!fill) return solidFill(color, 1, DEFAULT_TEXT);
  if (fill.type === "none") return "<a:noFill/>";
  if (fill.type === "gradient") return gradientFillXml(fill);
  if (fill.type === "pattern") return patternFillXml(fill);
  return solidFill(color || fill.color, opaque(fill.transparency), DEFAULT_TEXT);
}

/** Paragraphs of styled runs: element-level bold/italic/underline/colour apply where a run sets nothing. */
export function textBodyXml(content: TextContent, ctx: SlideContext, options: { anchor?: "t" | "ctr"; inset?: number } = {}) {
  const runs: Run[] = content.runs?.length ? content.runs : [{ text: content.text }];
  const paragraphs: Run[][] = [[]];
  for (const run of runs) run.text.split("\n").forEach((part, index) => {
    if (index) paragraphs.push([]);
    if (part) paragraphs.at(-1)!.push({ ...run, text: part });
  });
  const fontSize = (value: number) => Math.round(Math.max(1, Math.min(4000, value * ctx.scale / 12700)) * 100);
  const size = fontSize(content.fontSize);
  const typeface = fonts[content.font ?? "sans"];
  const align = aligns[content.align] ?? "l";
  const listBullet = content.list === "bullet" ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : content.list === "number" ? '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>' : "<a:buNone/>";
  const listed = Boolean(content.list && content.list !== "none");
  const hang = emu(content.fontSize * 1.2, ctx);
  const indent = listed ? ` marL="${hang}" indent="-${hang}"` : ' marL="0" indent="0"';
  const style = content.textStyle;
  const outline = style?.outline ? `<a:ln w="${Math.max(0, emu(style.outline.width, ctx))}">${solidFill(style.outline.color, opaque(style.outline.transparency), DEFAULT_TEXT)}</a:ln>` : "";
  const textEffects = effectsXml(style?.effects && { shadow: style.effects.shadow, reflection: style.effects.reflection, glow: style.effects.glow }, ctx);

  const runXml = (run: Run) => {
    const bold = run.bold ?? content.bold, italic = run.italic ?? content.italic, underline = run.underline ?? content.underline;
    const link = run.href && /^(https?:\/\/|mailto:)/i.test(run.href) ? `<a:hlinkClick r:id="${ctx.hyperlink(run.href)}"/>` : "";
    const character = `${run.strike ? ` strike="${run.strike === "double" ? "dblStrike" : "sngStrike"}"` : ""}${run.caps ? ` cap="${run.caps}"` : ""}${run.spacing ? ` spc="${pt100(run.spacing, ctx)}"` : ""}${run.baseline ? ` baseline="${Math.round(run.baseline * 1000)}"` : ""}`;
    const highlight = hexColor(run.highlight) ? `<a:highlight>${colorXml(run.highlight)}</a:highlight>` : "";
    return `<a:r><a:rPr lang="de-AT" sz="${run.size ? fontSize(run.size) : size}"${bold ? ' b="1"' : ""}${italic ? ' i="1"' : ""}${underline ? ' u="sng"' : ""}${character} dirty="0">${outline}${textFillXml(style, run.color || content.color)}${textEffects}${highlight}<a:latin typeface="${typeface}"/>${link}</a:rPr><a:t>${xmlEscape(run.text)}</a:t></a:r>`;
  };

  const paragraphProperties = (index: number, empty: boolean) => {
    const format = content.paragraphs?.[index];
    if (!format || !Object.keys(format).length) return `<a:pPr algn="${align}"${indent}>${empty ? "<a:buNone/>" : listBullet}</a:pPr>`;
    const level = format.level ?? 0;
    const bulleted = format.bullet ? format.bullet.kind !== "none" : listed;
    const marL = format.indent !== undefined ? emu(format.indent, ctx) : (bulleted ? hang : 0) + emu(level * LEVEL_INDENT, ctx);
    const by = emu(format.by ?? 0, ctx);
    const first = format.special === "firstLine" ? by : format.special === "hanging" ? -by : format.special === "none" ? 0 : bulleted ? -hang : 0;
    const spacing = format.lineSpacing ? `<a:lnSpc>${format.lineSpacing.rule === "exactly" ? `<a:spcPts val="${pt100(format.lineSpacing.value, ctx)}"/>` : `<a:spcPct val="${Math.round(format.lineSpacing.value * 100000)}"/>`}</a:lnSpc>` : "";
    const before = format.spaceBefore !== undefined ? `<a:spcBef><a:spcPts val="${pt100(format.spaceBefore, ctx)}"/></a:spcBef>` : "";
    const after = format.spaceAfter !== undefined ? `<a:spcAft><a:spcPts val="${pt100(format.spaceAfter, ctx)}"/></a:spcAft>` : "";
    const bullet = empty ? "<a:buNone/>" : format.bullet ? bulletXml(format.bullet) : listBullet;
    return `<a:pPr algn="${format.align ? aligns[format.align] : align}" marL="${marL}" indent="${first}"${format.level !== undefined ? ` lvl="${format.level}"` : ""}>${spacing}${before}${after}${bullet}</a:pPr>`;
  };

  const body = content.body;
  const uniform = emu(options.inset ?? content.padding ?? 0, ctx);
  const insets = body?.insets ? [body.insets.left, body.insets.top, body.insets.right, body.insets.bottom].map((value) => emu(value, ctx)) : [uniform, uniform, uniform, uniform];
  const anchor = body?.anchor ? anchors[body.anchor] : options.anchor ?? "t";
  const columns = body?.columns && body.columns > 1 ? ` numCol="${body.columns}"${body.columnSpacing ? ` spcCol="${emu(body.columnSpacing, ctx)}"` : ""}` : "";
  const autofit = body?.autofit === "shrink" ? "<a:normAutofit/>" : body?.autofit === "resize" ? "<a:spAutoFit/>" : "<a:noAutofit/>";
  // WordArt's 3-D bevel lives on the text body, after the autofit choice.
  const text3d = threeDXml(style?.effects?.bevel ? { bevel: style.effects.bevel } : undefined, ctx);
  const bodyPr = `<a:bodyPr${body?.direction ? ` vert="${directions[body.direction]}"` : ""} wrap="${body?.wrap === false ? "none" : "square"}" lIns="${insets[0]}" tIns="${insets[1]}" rIns="${insets[2]}" bIns="${insets[3]}"${columns} rtlCol="0" anchor="${anchor}"${body?.anchorCenter ? ' anchorCtr="1"' : ""}>${autofit}${text3d}</a:bodyPr>`;
  const xml = paragraphs.map((paragraph, index) => `<a:p>${paragraphProperties(index, !paragraph.length)}${paragraph.map(runXml).join("")}<a:endParaRPr lang="de-AT" sz="${size}" dirty="0"/></a:p>`).join("");
  return `<p:txBody>${bodyPr}<a:lstStyle/>${xml}</p:txBody>`;
}
