import {
  Document, HeadingLevel, type IParagraphOptions, Packer, PageBreak, Paragraph,
  Table, TableCell, TableRow, TextRun, WidthType, ImageRun, Bookmark, SimpleField,
  InternalHyperlink, TableOfContents, type ParagraphChild, type IFrameOptions,
  ExternalHyperlink, CommentRangeStart, CommentRangeEnd, CommentReference,
} from "docx";
import sharp from "sharp";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser, XMLSerializer, type Element as XmlElement, type Node as XmlNode } from "@xmldom/xmldom";
import type { TiptapNode } from "./tiptap";
import type { DocumentSettingsV1 } from "./document-settings";
import type { DocumentImageResolver } from "./document-image";
import { collectAnnexes, collectHeadings, collectTables } from "./document-renderer";
import { resolveCrossReferenceLabels } from "./figure-caption";
import { documentFigures, figureCrop, figureWidth, hasFigureList, isFigure, stripFigureNumber, type FigureCrop } from "./figure";

const bookmark = (id: string) => `fig_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(0, 40);
type Block = Paragraph | Table | TableOfContents;
type Context = {
  labels: Map<string, string>; figures: ReturnType<typeof documentFigures>; figureLabel: string;
  images: DocumentImageResolver; settings: DocumentSettingsV1; crops: Map<string, FigureCrop>;
  office?: OfficeContext;
};

/**
 * Office (ONLYOFFICE) conversion: connections become tagged content controls
 * (see office/docx-extract.ts), links stay clickable and open comment threads
 * become Word comments.
 */
export type OfficeDocxOptions = {
  /** Absolute app origin for internal links (e.g. https://host). */
  origin: string;
  /** Default text language, e.g. "de-AT"; the editor checks spelling in it. */
  language?: string;
  comments: Array<{ threadId: string; author: string; date: Date; text: string }>;
};
type OfficeContext = OfficeDocxOptions & { tags: string[]; commentIds: Map<string, number>; anchored: Set<string> };

const TAG_BOOKMARK = "mpsdt_";
const officeTag = (kind: string, data: object) => `mp:${kind}:${JSON.stringify(data)}`;

/** Marks runs for a tagged content control; post-processing turns the bookmark into a `w:sdt`. */
function tagged(context: Context, tag: string, children: ParagraphChild[]): ParagraphChild[] {
  if (!context.office) return children;
  const index = context.office.tags.push(tag) - 1;
  return [new Bookmark({ id: `${TAG_BOOKMARK}${index}`, children })];
}

function absoluteHref(href: string, context: Context) {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("/") && context.office) return `${context.office.origin}${href}`;
  return null;
}

function referenceRuns(node: TiptapNode, context: Context): ParagraphChild[] | null {
  const attrs = node.attrs ?? {};
  if (node.type === "taskReference" || node.type === "deadlineReference") {
    const kind = node.type === "taskReference" ? "task" : "deadline";
    const id = String(attrs[`${kind}Id`] || "");
    const title = String(attrs.title || "") || (kind === "task" ? "Aufgabe" : "Frist");
    return id ? tagged(context, officeTag(kind, { id }), [new TextRun(title)]) : [new TextRun(title)];
  }
  if (node.type === "pdfEvidence") {
    const quote = String(attrs.quote || attrs.label || "").replace(/\s+/g, " ").trim();
    const text = `„${quote}“ (${String(attrs.sourceTitle || "")}, S. ${String(attrs.pageNumber || 1)})`;
    const id = String(attrs.annotationId || "");
    return id ? tagged(context, officeTag("evidence", { id }), [new TextRun(text)]) : [new TextRun(text)];
  }
  if (node.type === "citation") {
    const label = String(attrs.label || "");
    const items = Array.isArray(attrs.items) ? attrs.items as Array<{ sourceId?: unknown; locator?: unknown }> : attrs.sourceId ? [{ sourceId: attrs.sourceId, locator: attrs.locator }] : [];
    const ids = items.map((item) => String(item.sourceId || "")).filter(Boolean);
    const loc = items.map((item) => String(item.locator || "")).filter(Boolean).join("; ");
    return ids.length ? tagged(context, officeTag("cite", { ids, ...(loc ? { loc } : {}) }), [new TextRun(label || "[?]")]) : [new TextRun(label)];
  }
  return null;
}

function textRuns(node: TiptapNode, context: Context): ParagraphChild[] {
  const marks = new Set((node.marks ?? []).map((mark) => mark.type));
  const run = new TextRun({ text: node.text ?? "", bold: marks.has("bold"), italics: marks.has("italic"), strike: marks.has("strike"), subScript: marks.has("subscript"), superScript: marks.has("superscript") });
  const href = String(node.marks?.find((mark) => mark.type === "link")?.attrs?.href ?? "");
  const link = href ? absoluteHref(href, context) : null;
  let children: ParagraphChild[] = [link ? new ExternalHyperlink({ link, children: [run] }) : run];
  const office = context.office;
  if (office) {
    // A thread is anchored once, on the first text it marks.
    for (const mark of node.marks ?? []) {
      if (mark.type !== "comment") continue;
      const ids = [mark.attrs?.threadId, ...(Array.isArray(mark.attrs?.threadIds) ? mark.attrs.threadIds : [])].filter((id): id is string => typeof id === "string");
      for (const id of ids) {
        const commentId = office.commentIds.get(id);
        if (commentId === undefined || office.anchored.has(id)) continue;
        office.anchored.add(id);
        children = [new CommentRangeStart(commentId), ...children, new CommentRangeEnd(commentId), new TextRun({ children: [new CommentReference(commentId)] })];
      }
    }
  }
  return children;
}
function runs(node: TiptapNode, context: Context): ParagraphChild[] {
  if (node.text !== undefined) return textRuns(node, context);
  const reference = context.office ? referenceRuns(node, context) : null;
  if (reference) return reference;
  if (node.type === "hardBreak") return [new TextRun({ break: 1 })];
  if (node.type === "crossReference") {
    const id = String(node.attrs?.targetId || "");
    const label = context.labels.get(id);
    return label ? [new SimpleField(`REF ${bookmark(id)} \\h`, label)] : [new TextRun(context.figureLabel === "Abbildung" ? "Verweisziel fehlt" : "Reference target missing")];
  }
  if (node.type === "documentVariable") return [new TextRun(context.settings.variables[String(node.attrs?.key)] || String(node.attrs?.label || ""))];
  if (node.type === "citation") return [new TextRun(String(node.attrs?.label || ""))];
  return (node.content ?? []).flatMap((child) => runs(child, context));
}
function paragraph(node: TiptapNode, context: Context, options: IParagraphOptions = {}) {
  return new Paragraph({ ...options, children: runs(node, context) });
}
function figureList(title: string, context: Context, pageBreakBefore = false): Block[] {
  const rows = context.figures.filter((figure) => figure.included).map((figure) => new Paragraph({
    children: [new InternalHyperlink({ anchor: bookmark(figure.nodeId), children: [new TextRun(`${context.figureLabel} ${figure.number}: ${figure.caption}`)] }), new TextRun("\t"), new SimpleField(`PAGEREF ${bookmark(figure.nodeId)} \\h`)],
    tabStops: [{ type: "right", position: 8500, leader: "dot" }],
  }));
  return [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, pageBreakBefore }), new TableOfContents(undefined, { captionLabelIncludingNumbers: "Figure", hyperlink: true, contentChildren: rows, beginDirty: true })];
}
async function figureBlock(node: TiptapNode, context: Context): Promise<Block[]> {
  const attrs = node.attrs || {};
  const id = String(attrs.nodeId || "");
  const figure = context.figures.find((item) => item.nodeId === id);
  const caption = stripFigureNumber(String(attrs.caption || ""));
  const image = context.images(id);
  const label: ParagraphChild[] = figure ? [new TextRun(`${context.figureLabel} `), new SimpleField("SEQ Figure \\* ARABIC", String(figure.number))] : [];
  const captionRuns: ParagraphChild[] = [new Bookmark({ id: bookmark(id), children: label.length ? label : [new TextRun(caption)] }), ...(label.length ? [new TextRun(`: ${caption}`)] : [])];
  if (!image) return [new Paragraph({ children: [new TextRun(context.figureLabel === "Abbildung" ? "Bild nicht verfügbar" : "Image unavailable")] }), new Paragraph({ children: captionRuns })];
  const crop = figureCrop(attrs.crop);
  context.crops.set(id, crop);
  const landscape = context.settings.page.orientation === "landscape";
  const pageWidth = context.settings.page.size === "A4" ? 210 : 215.9;
  const pageHeight = context.settings.page.size === "A4" ? 297 : 279.4;
  const margins = context.settings.page.marginsMm;
  const usableWidth = ((landscape ? pageHeight : pageWidth) - margins.left - margins.right) * 96 / 25.4;
  const usableHeight = ((landscape ? pageWidth : pageHeight) - margins.top - margins.bottom - 16) * 96 / 25.4;
  const ratio = image.width * crop.width / (image.height * crop.height);
  const width = Math.min(usableWidth * figureWidth(attrs.widthPercent) / 100, usableHeight * ratio);
  const height = width / ratio;
  const transformation = { width, height };
  const data = Buffer.from(image.bytes);
  const png = image.mimeType === "image/webp" || image.mimeType === "image/svg+xml" ? await sharp(data, { limitInputPixels: 40_000_000 }).png().toBuffer() : undefined;
  const imageRun = image.mimeType === "image/svg+xml"
    ? new ImageRun({ type: "svg", data, fallback: { type: "png", data: png! }, transformation, altText: { name: `figure:${id}`, description: String(attrs.alt || ""), title: caption } })
    : new ImageRun({ type: image.mimeType === "image/jpeg" ? "jpg" : "png", data: png || data, transformation, altText: { name: `figure:${id}`, description: String(attrs.alt || ""), title: caption } });
  const alignment = attrs.alignment === "left" || attrs.alignment === "right" ? attrs.alignment : "center";
  const wrap = attrs.wrap === "left" || attrs.wrap === "right" ? attrs.wrap : null;
  // Identical frame properties on adjacent image/caption paragraphs keep them in one anchored frame.
  const frame: IFrameOptions | undefined = wrap ? { type: "alignment", alignment: { x: wrap, y: "top" }, anchor: { horizontal: "margin", vertical: "text" }, width: Math.round(width * 15), height: 0, rule: "auto", wrap: "around", space: { horizontal: 180, vertical: 120 } } : undefined;
  const blocks: Block[] = [new Paragraph({ children: [imageRun], alignment, keepNext: Boolean(figure || caption), keepLines: true, frame })];
  if (figure || caption) blocks.push(new Paragraph({ children: captionRuns, style: "Caption", keepLines: true, frame, alignment }));
  return blocks;
}
async function block(node: TiptapNode, context: Context): Promise<Block[]> {
  if (isFigure(node.type)) return figureBlock(node, context);
  if (node.type === "figureList") return figureList(String(node.attrs?.title || context.settings.figures.heading), context, node.attrs?.pageBreakBefore === true);
  if (node.type === "figureListEntry") return [];
  if (node.type === "heading" || node.type === "annexMarker") {
    const id = String(node.attrs?.id || node.attrs?.annexId || "");
    const children = node.type === "annexMarker" ? [new TextRun(String(node.attrs?.title || "Annex"))] : runs(node, context);
    return [new Paragraph({ heading: Number(node.attrs?.level) === 1 ? HeadingLevel.HEADING_1 : Number(node.attrs?.level) === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, children: id ? [new Bookmark({ id: bookmark(id), children })] : children })];
  }
  if (node.type === "paragraph") return [paragraph(node, context)];
  if (context.office && (node.type === "taskReference" || node.type === "deadlineReference" || node.type === "pdfEvidence")) {
    return [new Paragraph({ children: referenceRuns(node, context) ?? [] })];
  }
  if (node.type === "taskList") {
    const result: Block[] = [];
    for (const item of node.content || []) {
      const box = new TextRun(item.attrs?.checked ? "☑ " : "☐ ");
      for (const [index, child] of (item.content || []).entries()) {
        if (index === 0 && child.type === "paragraph") result.push(new Paragraph({ children: [box, ...runs(child, context)] }));
        else result.push(...await block(child, context));
      }
    }
    return result;
  }
  if (node.type === "blockquote") return [paragraph(node, context, { indent: { left: 420 } })];
  if (node.type === "bulletList" || node.type === "orderedList") {
    const result: Block[] = [];
    for (const item of node.content || []) {
      for (const [index, child] of (item.content || []).entries()) {
        if (index === 0 && child.type === "paragraph") result.push(paragraph(child, context, node.type === "bulletList" ? { bullet: { level: 0 } } : { numbering: { reference: "proposal-numbering", level: 0 } }));
        else result.push(...await block(child, context));
      }
    }
    return result;
  }
  if (node.type === "markdownTable") {
    const rows: TableRow[] = [];
    for (const row of node.content || []) {
      const cells: TableCell[] = [];
      for (const cell of row.content || []) {
        const children = (await Promise.all((cell.content || []).map((child) => block(child, context)))).flat().filter((entry): entry is Paragraph | Table => !(entry instanceof TableOfContents));
        cells.push(new TableCell({ children: children.length ? children : [new Paragraph("")] }));
      }
      rows.push(new TableRow({ children: cells }));
    }
    const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
    const id = String(node.attrs?.tableId || "");
    const caption = String(node.attrs?.caption || "");
    return caption ? [new Paragraph({ children: [new Bookmark({ id: bookmark(id), children: [new TextRun(context.labels.get(id) || caption)] }), new TextRun(`: ${caption}`)], style: "Caption", keepNext: true }), table] : [table];
  }
  if (node.type === "pageBreak") return [new Paragraph({ children: [new PageBreak()] })];
  if (node.type === "signatureBlock") return [new Paragraph({ spacing: { before: 720 }, children: [new TextRun("____________________________")]}), new Paragraph({ text: String(node.attrs?.name || "") })];
  return (await Promise.all((node.content || []).map((child) => block(child, context)))).flat();
}

/** docx exposes the drawing but not DrawingML's source crop; add that standard element without altering source media. */
export function applyDocxFigureCrops(bytes: Uint8Array, crops: Map<string, FigureCrop>) {
  const files = unzipSync(bytes);
  const document = new DOMParser().parseFromString(strFromU8(files["word/document.xml"]), "application/xml");
  for (const drawing of Array.from(document.getElementsByTagName("w:drawing"))) {
    const properties = drawing.getElementsByTagName("wp:docPr")[0];
    const id = properties?.getAttribute("name")?.replace(/^figure:/, "");
    const crop = id ? crops.get(id) : undefined;
    if (!crop || (!crop.x && !crop.y && crop.width === 1 && crop.height === 1)) continue;
    const fill = drawing.getElementsByTagName("pic:blipFill")[0];
    if (!fill) continue;
    for (const existing of Array.from(fill.getElementsByTagName("a:srcRect"))) fill.removeChild(existing);
    const rect = document.createElementNS("http://schemas.openxmlformats.org/drawingml/2006/main", "a:srcRect");
    for (const [key, value] of Object.entries({ l: crop.x, t: crop.y, r: 1 - crop.x - crop.width, b: 1 - crop.y - crop.height })) rect.setAttribute(key, String(Math.round(value * 100000)));
    const stretch = fill.getElementsByTagName("a:stretch")[0];
    fill.insertBefore(rect, stretch || null);
  }
  files["word/document.xml"] = strToU8(new XMLSerializer().serializeToString(document));
  return Buffer.from(zipSync(files));
}
export async function generateDocumentDocx(title: string, doc: TiptapNode, settings: DocumentSettingsV1, labels: { figureLabel?: string; tableLabel?: string } = {}, images: DocumentImageResolver = () => undefined, office?: OfficeDocxOptions) {
  const figures = documentFigures(doc);
  const officeContext: OfficeContext | undefined = office && { ...office, tags: [], anchored: new Set(), commentIds: new Map(office.comments.map((comment, index) => [comment.threadId, index])) };
  const context: Context = { labels: resolveCrossReferenceLabels({ headings: collectHeadings(doc), annexes: collectAnnexes(doc), figures: figures.map((figure) => ({ id: figure.nodeId, caption: figure.caption })), tables: collectTables(doc).map((table) => ({ id: table.tableId, caption: table.caption })), figureLabel: labels.figureLabel || "Figure", tableLabel: labels.tableLabel || "Table" }), figures, figureLabel: labels.figureLabel || "Figure", images, settings, crops: new Map(), office: officeContext };
  const content = (await Promise.all((doc.content || []).map((child) => block(child, context)))).flat();
  if (settings.figures.enabled && !hasFigureList(doc)) content.push(...figureList(settings.figures.heading, context, settings.figures.pageBreakBefore));
  // Only threads anchored in the text become comments.
  const comments = officeContext ? officeContext.comments.flatMap((comment, index) => officeContext.anchored.has(comment.threadId)
    ? [{ id: index, author: comment.author, date: comment.date, children: [new Paragraph(comment.text)] }] : []) : [];
  const document = new Document({ creator: settings.metadata.author, title, subject: settings.metadata.subject, features: { updateFields: true },
    ...(comments.length ? { comments: { children: comments } } : {}),
    styles: {
      ...(office?.language ? { default: { document: { run: { language: { value: office.language } } } } } : {}),
      paragraphStyles: [{ id: "Caption", name: "Caption", basedOn: "Normal", run: { size: 20 }, paragraph: { spacing: { after: 120 } } }],
    },
    numbering: { config: [{ reference: "proposal-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start" }] }] },
    sections: [{ properties: { page: { size: { width: Math.round((settings.page.size === "A4" ? 210 : 215.9) * 56.693), height: Math.round((settings.page.size === "A4" ? 297 : 279.4) * 56.693), orientation: settings.page.orientation }, margin: Object.fromEntries(Object.entries(settings.page.marginsMm).map(([key, value]) => [key, Math.round(value * 56.693)])) } }, children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...content] }],
  });
  const bytes = applyDocxFigureCrops(await Packer.toBuffer(document), context.crops);
  return officeContext ? applyTaggedControls(bytes, officeContext.tags) : bytes;
}

/**
 * Replaces each `mpsdt_<n>` bookmark range (start, runs, end: siblings in one
 * paragraph) with an inline content control tagged `tags[n]`.
 */
export function applyTaggedControls(bytes: Uint8Array, tags: string[]) {
  if (!tags.length) return Buffer.from(bytes);
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const files = unzipSync(bytes);
  const document = new DOMParser().parseFromString(strFromU8(files["word/document.xml"]), "application/xml");
  for (const start of Array.from(document.getElementsByTagNameNS(W, "bookmarkStart"))) {
    const name = start.getAttributeNS(W, "name") || start.getAttribute("w:name") || "";
    if (!name.startsWith(TAG_BOOKMARK)) continue;
    const tag = tags[Number(name.slice(TAG_BOOKMARK.length))];
    const id = start.getAttributeNS(W, "id") || start.getAttribute("w:id");
    const parent = start.parentNode;
    if (!tag || !parent) continue;
    const moved: XmlNode[] = [];
    let end: XmlElement | null = null;
    for (let node = start.nextSibling; node; node = node.nextSibling) {
      const element = node as XmlElement;
      if (element.localName === "bookmarkEnd" && (element.getAttributeNS(W, "id") || element.getAttribute("w:id")) === id) { end = element; break; }
      moved.push(node);
    }
    if (!end) continue;
    const sdt = document.createElementNS(W, "w:sdt");
    const properties = document.createElementNS(W, "w:sdtPr");
    const tagElement = document.createElementNS(W, "w:tag");
    tagElement.setAttributeNS(W, "w:val", tag);
    properties.appendChild(tagElement);
    const content = document.createElementNS(W, "w:sdtContent");
    for (const node of moved) content.appendChild(node);
    sdt.appendChild(properties);
    sdt.appendChild(content);
    parent.insertBefore(sdt, start);
    parent.removeChild(start);
    parent.removeChild(end);
  }
  files["word/document.xml"] = strToU8(new XMLSerializer().serializeToString(document));
  return Buffer.from(zipSync(files));
}
