// Maps pptxtojson slide output (points, resolved through layout/master) onto presentation
// elements inside one slide frame. Geometry and font sizes share one scale factor, so a
// slide keeps its proportions; everything the model cannot express is reported per slide.
import type { Chart, CommonChart, Element as PptxElement, Fill, Shape, Table, Text } from "pptxtojson";
import type { PresentationElement, PresentationShapeKind, PresentationTextElement } from "./presentation";
import { pptxImageMime, type PptxFiles, type PptxImportMedia, type PptxImportWarning } from "./presentation-pptx-archive";
import { srcRectToImageCrop, type PptxSrcRect } from "./presentation-pptx-image";
import { parsePptxHtml, pptxColor, pptxHtmlToText, type PptxHtmlParagraph, type PptxHtmlRun } from "./presentation-pptx-text";

export type PptxMapContext = {
  files: PptxFiles; factor: number; media: PptxImportMedia[];
  id: () => string; warn: (code: PptxImportWarning["code"]) => void;
  /** Adds an element unless the 500-object limit is reached; returns whether it was added. */
  add: (element: PresentationElement) => boolean;
};
type Box = { x: number; y: number; width: number; height: number; rotation: number };
type TextContent = PresentationTextElement["content"];
type TextRun = NonNullable<TextContent["runs"]>[number];

const MAX_TABLE_CELLS = 60;
const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const size = (value: number) => Math.max(20, Math.min(20_000, value));
const shapeKinds: Record<string, PresentationShapeKind> = {
  rect: "rect", flowChartProcess: "rect", roundRect: "roundedRect", flowChartAlternateProcess: "roundedRect", ellipse: "ellipse", flowChartConnector: "ellipse",
  triangle: "triangle", diamond: "diamond", flowChartDecision: "diamond", rightArrow: "arrow", leftRightArrow: "doubleArrow",
  line: "line", straightConnector1: "line",
  pentagon: "pentagon", hexagon: "hexagon", star5: "star", parallelogram: "parallelogram", trapezoid: "trapezoid",
  chevron: "chevron", wedgeRectCallout: "callout", wedgeRoundRectCallout: "callout", plus: "plus", mathPlus: "plus",
};
const fonts: Array<[RegExp, NonNullable<TextContent["font"]>]> = [[/georgia/i, "georgia"], [/courier|consolas|mono|menlo/i, "mono"], [/times|cambria|garamond|serif|palatino|book antiqua/i, "serif"], [/arial|helvetica/i, "arial"]];

function fillColor(fill: Fill | null | undefined, ctx: PptxMapContext) {
  if (!fill) return "";
  if (fill.type === "color") return pptxColor(fill.value) ?? "";
  ctx.warn("fillSimplified");
  if (fill.type === "gradient") return pptxColor(fill.value.colors[0]?.color) ?? "";
  if (fill.type === "pattern") return pptxColor(fill.value.foregroundColor) ?? "";
  return "";
}

const sameStyle = (a: TextRun, b: TextRun) => a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color && a.href === b.href;

/** One text box per shape: paragraphs become lines, bullets stay separate lines, nesting is indented. */
export function pptxTextContent(html: string, ctx: PptxMapContext, options: { fontScale?: number; inset?: number } = {}): TextContent | null {
  const paragraphs = parsePptxHtml(html).map((paragraph) => ({ ...paragraph, runs: paragraph.runs.filter((run) => run.text) }));
  const isEmpty = (paragraph: PptxHtmlParagraph) => !paragraph.runs.some((run) => run.text.trim());
  while (paragraphs.length && isEmpty(paragraphs[0])) paragraphs.shift();
  while (paragraphs.length && isEmpty(paragraphs.at(-1)!)) paragraphs.pop();
  if (!paragraphs.length) return null;
  // Bullets inherited from a body placeholder carry only their hanging indent; explicit lists come as <ul>/<ol>.
  const bulleted = (paragraph: PptxHtmlParagraph) => paragraph.list ?? (paragraph.textIndent < 0 && paragraph.marginLeft > 0 ? "bullet" : null);
  const indents = [...new Set(paragraphs.filter((paragraph) => !paragraph.list && bulleted(paragraph)).map((paragraph) => paragraph.marginLeft))].sort((a, b) => a - b);
  const level = (paragraph: PptxHtmlParagraph) => paragraph.list ? paragraph.listDepth : Math.max(0, indents.indexOf(paragraph.marginLeft));
  const content = paragraphs.filter((paragraph) => !isEmpty(paragraph));
  const kinds = new Set(content.map(bulleted));
  const plainList = kinds.size === 1 && !kinds.has(null) && content.every((paragraph) => level(paragraph) === 0) ? [...kinds][0]! : null;
  const counters: number[] = [];
  const first = paragraphs.flatMap((paragraph) => paragraph.runs).find((run) => run.text.trim()) ?? ({ text: "" } as PptxHtmlRun);
  const color = first.color ?? "#172033";
  const runs: TextRun[] = [];
  const push = (run: TextRun) => { const last = runs.at(-1); if (last && sameStyle(last, run)) last.text += run.text; else runs.push(run); };
  paragraphs.forEach((paragraph, index) => {
    if (index) push({ text: "\n" });
    const kind = bulleted(paragraph), depth = level(paragraph);
    if (kind && !plainList && !isEmpty(paragraph)) {
      counters.length = depth + 1; counters[depth] = (counters[depth] ?? 0) + 1;
      push({ text: `${" ".repeat(depth)}${kind === "number" ? `${counters[depth]}. ` : depth ? "◦ " : "• "}` });
    }
    paragraph.runs.forEach((run, runIndex) => {
      const text = runIndex === paragraph.runs.length - 1 ? run.text.replace(/\s+$/, "") : run.text;
      if (!text) return;
      const href = run.href && /^(https?:\/\/|mailto:)/i.test(run.href) ? run.href.slice(0, 2000) : undefined;
      push({ text, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}), ...(run.underline ? { underline: true } : {}), ...(run.color && run.color !== color ? { color: run.color } : {}), ...(href ? { href } : {}) });
    });
  });
  let text = runs.map((run) => run.text).join("");
  if (text.length > 5000 || runs.length > 200) {
    ctx.warn("textTruncated");
    runs.splice(200); let budget = 5000;
    for (const run of runs) { run.text = run.text.slice(0, Math.max(0, budget)); budget -= run.text.length; }
    while (runs.length && !runs.at(-1)!.text) runs.pop();
    text = runs.map((run) => run.text).join("");
  }
  const sizes = new Set(paragraphs.flatMap((paragraph) => paragraph.runs).filter((run) => run.text.trim()).map((run) => run.sizePt ?? 0));
  if (sizes.size > 1) ctx.warn("fontSizes");
  const fontSize = Math.round(Math.max(8, Math.min(400, (first.sizePt ?? 18) * (options.fontScale ?? 1) * ctx.factor)));
  return { text, runs, fontSize, bold: false, color, align: paragraphs[0].align, font: fonts.find(([pattern]) => pattern.test(first.family ?? ""))?.[1] ?? "sans",
    ...(plainList ? { list: plainList } : {}), ...(options.inset ? { padding: Math.min(100, Math.round(options.inset * ctx.factor)) } : {}) };
}

function addText(ctx: PptxMapContext, parentId: string, box: Box, html: string, element?: Text | Shape, background?: string) {
  const fontScale = element?.autoFit?.type === "text" && element.autoFit.fontScale ? element.autoFit.fontScale / 100 : 1;
  const content = pptxTextContent(html, ctx, { fontScale, inset: element?.textInset ? Math.min(element.textInset.l, element.textInset.t) : 0 });
  if (content) ctx.add({ id: ctx.id(), parentId, type: "text", ...box, ...(background ? { background } : {}), content });
}

function addTable(table: Table, ctx: PptxMapContext, parentId: string, box: Box) {
  const cells = table.data.flat().filter((cell) => !cell.hMerge && !cell.vMerge);
  if (cells.length > MAX_TABLE_CELLS || !table.colWidths.length || !table.rowHeights.length) {
    ctx.warn("tableAsText");
    const text = table.data.map((row) => row.filter((cell) => !cell.hMerge).map((cell) => pptxHtmlToText(cell.text).replace(/\n/g, " ")).join(" | ")).join("\n").slice(0, 5000);
    if (text.trim()) ctx.add({ id: ctx.id(), parentId, type: "text", ...box, content: { text, fontSize: Math.round(Math.max(8, 14 * ctx.factor)), bold: false, color: "#172033", align: "left", font: "sans" } });
    return;
  }
  ctx.warn("table");
  const groupId = ctx.id();
  if (!ctx.add({ id: groupId, parentId, type: "frame", ...box, content: { label: "", shape: "none", color: "", isGroup: true } })) return;
  // Row heights in the file are minimums; spread them so the grid fills the table's frame.
  const sx = box.width / table.colWidths.reduce((sum, width) => sum + width, 0), sy = box.height / table.rowHeights.reduce((sum, height) => sum + height, 0);
  const offset = (list: number[], index: number) => list.slice(0, index).reduce((sum, value) => sum + value, 0);
  table.data.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
    if (cell.hMerge || cell.vMerge || columnIndex >= table.colWidths.length || rowIndex >= table.rowHeights.length) return;
    const cellBox = { x: box.x + offset(table.colWidths, columnIndex) * sx, y: box.y + offset(table.rowHeights, rowIndex) * sy, rotation: 0,
      width: size(table.colWidths.slice(columnIndex, columnIndex + (cell.colSpan ?? 1)).reduce((sum, width) => sum + width, 0) * sx),
      height: size(table.rowHeights.slice(rowIndex, rowIndex + (cell.rowSpan ?? 1)).reduce((sum, height) => sum + height, 0) * sy) };
    const border = cell.borders.top ?? cell.borders.left ?? table.borders.top;
    ctx.add({ id: ctx.id(), parentId: groupId, type: "shape", ...cellBox, content: { shape: "rect", fill: pptxColor(cell.fillColor) ?? "", stroke: pptxColor(border?.borderColor) ?? "#94a3b8", strokeWidth: Math.max(1, Math.min(200, (border?.borderWidth || 0.75) * ctx.factor)), opacity: 1 } });
    const content = pptxTextContent(cell.text, ctx, { inset: 5 });
    if (content) ctx.add({ id: ctx.id(), parentId: groupId, type: "text", ...cellBox, content: { ...content, ...(cell.fontBold ? { bold: true } : {}), ...(pptxColor(cell.fontColor) ? { color: pptxColor(cell.fontColor) } : {}) } });
  }));
}

function addChart(source: Chart, ctx: PptxMapContext, parentId: string, box: Box) {
  if (source.chartType === "scatterChart" || source.chartType === "bubbleChart") { ctx.warn("chartDropped"); return; }
  const chart = source as CommonChart;
  const kind = /^bar/.test(chart.chartType) ? "bar" : /^(line|area)/.test(chart.chartType) ? "line" : /^(pie|doughnut)/.test(chart.chartType) ? "pie" : null;
  if (!kind) { ctx.warn("chartDropped"); return; }
  const series = chart.data[0];
  const data = (series?.values ?? []).map((value) => ({ label: String(series.xlabels[value.x] ?? value.x).slice(0, 100), value: Number(value.y) })).filter((point) => Number.isFinite(point.value) && Math.abs(point.value) <= 1e12);
  if (!data.length) { ctx.warn("chartDropped"); return; }
  if (chart.data.length > 1 || data.length > 50 || /area|doughnut|3D/.test(chart.chartType) || chart.barDir === "bar") ctx.warn("chartSimplified");
  ctx.add({ id: ctx.id(), parentId, type: "chart", ...box, content: { title: String(series.key ?? "").slice(0, 200), kind, data: data.slice(0, 50), ...(pptxColor(chart.colors[0] ?? undefined) ? { color: pptxColor(chart.colors[0] ?? undefined) } : {}) } });
}

function addImage(ref: string, ctx: PptxMapContext, parentId: string, box: Box, extra: { geom?: string; rect?: Partial<PptxSrcRect>; flipped?: boolean }) {
  const image = ctx.files[ref], mime = pptxImageMime(ref);
  if (!image || !mime) { ctx.warn(/^[a-z]+:/i.test(ref) ? "externalMedia" : "missingMedia"); return; }
  let item = ctx.media.find((entry) => entry.name === ref);
  if (!item) { item = { key: ctx.id(), name: ref, mime, bytes: image }; ctx.media.push(item); }
  // Crops that need more than the canvas' 5× zoom are shown less tightly cropped.
  const crop = srcRectToImageCrop(extra.rect);
  if (crop?.zoom === 5) ctx.warn("imageCrop");
  if (extra.flipped) ctx.warn("transform");
  const mask = extra.geom === "ellipse" ? "circle" : extra.geom === "roundRect" ? "rounded" : extra.geom === "diamond" ? "diamond" : undefined;
  ctx.add({ id: ctx.id(), parentId, type: "image", ...box, content: { attachmentId: item.key, alt: "", ...crop, ...(mask ? { mask } : {}) } });
}

const isLinear = (kind?: PresentationShapeKind) => kind === "line" || kind === "arrow" || kind === "doubleArrow";
const normalizeDegrees = (degrees: number) => Math.round(((degrees % 360) + 360) % 360);

/**
 * pptxtojson reports group members in the group's unrotated, unflipped space, while the
 * canvas stores absolute geometry, so the group's flip and rotation are applied to every
 * member (a nested group's members are already transformed by their own group). Flips keep
 * text readable, as PowerPoint does; a vertical flip turns non-line objects upside down.
 * Only a flipped picture cannot be represented and is reported.
 */
function transformGroupMembers(members: PresentationElement[], group: Box, flip: { flipH?: boolean; flipV?: boolean }, ctx: PptxMapContext) {
  const centreX = group.x + group.width / 2, centreY = group.y + group.height / 2;
  const radians = group.rotation * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  for (const member of members) {
    let x = member.x + member.width / 2 - centreX, y = member.y + member.height / 2 - centreY, rotation = member.rotation;
    const linear = member.type === "shape" && isLinear(member.content.shape);
    if (flip.flipH) x = -x;
    if (flip.flipV) y = -y;
    if (flip.flipH && flip.flipV) rotation += 180;
    else if (flip.flipH) rotation = -rotation;
    else if (flip.flipV) rotation = linear ? -rotation : 180 - rotation;
    if (flip.flipH && !flip.flipV && member.type === "shape" && linear) {
      // A horizontally mirrored stroke points the other way: its ends swap.
      const c = member.content, start = c.startHead ?? (c.shape === "doubleArrow" ? "triangle" : "none"), end = c.endHead ?? (c.shape === "line" ? "none" : "triangle");
      member.content = { ...c, startHead: end, endHead: start, shape: start !== "none" && end !== "none" ? "doubleArrow" : start !== "none" ? "arrow" : "line" };
    }
    if ((flip.flipH || flip.flipV) && member.type === "image") ctx.warn("transform");
    member.x = centreX + x * cos - y * sin - member.width / 2;
    member.y = centreY + x * sin + y * cos - member.height / 2;
    member.rotation = normalizeDegrees(rotation + group.rotation);
  }
}

/** Adds one pptxtojson element (recursing into groups) below `parentId`, offset by the parent's origin. */
export function addPptxElement(element: PptxElement, ctx: PptxMapContext, parentId: string, origin: { x: number; y: number }) {
  const rotate = "rotate" in element ? element.rotate : 0;
  const box: Box = { x: origin.x + element.left * ctx.factor, y: origin.y + element.top * ctx.factor, width: size(element.width * ctx.factor), height: size(element.height * ctx.factor), rotation: Math.round(rotate || 0) % 360 };
  switch (element.type) {
    case "text":
      addText(ctx, parentId, box, element.content, element, fillColor(element.fill, ctx) || undefined); return;
    case "shape": {
      let known = shapeKinds[element.shapType];
      if (!known) ctx.warn("customShape");
      const stroke = element.borderWidth > 0 ? pptxColor(element.borderColor) ?? "" : "";
      const head = (end?: { type: string }) => end && end.type !== "none" ? (end.type === "arrow" ? "open" as const : "triangle" as const) : undefined;
      const startHead = head(element.headEnd), endHead = head(element.tailEnd);
      let shapeBox = box;
      if (known === "line") {
        // A connector runs corner to corner of its box (mirrored by flips); the canvas draws a
        // horizontal stroke through the box centre, so the same segment becomes a rotated box.
        const width = element.width * ctx.factor, height = element.height * ctx.factor;
        const angle = Math.atan2(element.isFlipV ? -height : height, element.isFlipH ? -width : width) * 180 / Math.PI;
        const length = size(Math.hypot(width, height));
        shapeBox = { x: box.x + width / 2 - length / 2, y: box.y + height / 2 - 10, width: length, height: 20, rotation: normalizeDegrees((rotate || 0) + angle) };
        known = startHead && endHead ? "doubleArrow" : endHead ? "arrow" : "line";
      }
      ctx.add({ id: ctx.id(), parentId, type: "shape", ...shapeBox, content: { shape: known ?? "rect", fill: isLinear(known) ? "" : fillColor(element.fill, ctx), stroke, strokeWidth: Math.min(200, element.borderWidth * ctx.factor), opacity: 1,
        ...(element.borderType !== "solid" ? { dash: element.borderType === "dotted" ? "dot" : "dash" } : {}), ...(startHead ? { startHead } : {}), ...(endHead ? { endHead } : {}) } });
      if (element.content) addText(ctx, parentId, { ...box }, element.content, element);
      return;
    }
    case "image": addImage(element.ref, ctx, parentId, box, { geom: element.geom, rect: element.rect, flipped: element.isFlipH || element.isFlipV }); return;
    case "table": addTable(element, ctx, parentId, box); return;
    case "chart": addChart(element, ctx, parentId, box); return;
    case "video": case "audio": ctx.warn("media"); return;
    case "math": ctx.warn("math"); addText(ctx, parentId, box, `<p><span>${escapeText(element.text || element.latex)}</span></p>`); return;
    case "diagram": case "group": {
      if (element.type === "diagram") ctx.warn("smartArt");
      const groupId = ctx.id();
      if (!ctx.add({ id: groupId, parentId, type: "frame", ...box, content: { label: "", shape: "none", color: "", isGroup: true } })) return;
      // Members are collected (nested ones included) so the group's transform reaches all of them.
      const members: PresentationElement[] = [];
      const inner: PptxMapContext = { ...ctx, add: (child) => { const added = ctx.add(child); if (added) members.push(child); return added; } };
      const children = [...element.elements].sort((a, b) => a.order - b.order);
      if (!children.length && element.type === "diagram") addText(inner, groupId, box, element.textList.map((line) => `<p><span>${escapeText(line)}</span></p>`).join(""));
      for (const child of children) addPptxElement(child, inner, groupId, { x: box.x, y: box.y });
      if (element.type === "group") transformGroupMembers(members, box, { flipH: element.isFlipH, flipV: element.isFlipV }, ctx);
      return;
    }
    default: ctx.warn("unsupported");
  }
}
