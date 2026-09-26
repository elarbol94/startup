// Bounded reading of a .pptx package: zip-bomb, path and entity limits plus the small XML
// helpers shared by both PowerPoint import paths. Nothing here follows external links.
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";

export type PptxFiles = Record<string, Uint8Array>;
export type PptxRelation = { target: string; external: boolean; type: string };

export const MAX_PPTX_BYTES = 50 * 1024 * 1024;
const MAX_XML_BYTES = 5 * 1024 * 1024;

export const xmlNodes = (element: XmlElement, local: string) => Array.from(element.getElementsByTagNameNS("*", local));
export const xmlChildren = (element: XmlElement, local: string) => Array.from(element.childNodes).filter((node): node is XmlElement => node.nodeType === 1 && (node as XmlElement).localName === local);

/** Resolves a relationship target against the part that owns it; rejects external or escaping targets. */
export function resolvePptxPath(base: string, target: string) {
  if (/^[a-z]+:/i.test(target) || target.includes("\\") || target.includes("\0")) throw new Error("External relationship");
  const parts = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") { if (!parts.length) throw new Error("Invalid relationship"); parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** Extracts only `ppt/` and `[Content_Types].xml`, enforcing entry count, path and decompression limits while inflating. */
export function readPptxArchive(bytes: Uint8Array): PptxFiles {
  if (bytes.length > MAX_PPTX_BYTES) throw new Error("PPTX exceeds 50 MB");
  let total = 0, count = 0;
  const seen = new Set<string>();
  return unzipSync(bytes, { filter: (file) => {
    if (++count > 4000 || seen.has(file.name) || /(^|\/)\.\.(\/|$)/.test(file.name) || file.name.includes("\\")) throw new Error("Invalid PPTX archive");
    seen.add(file.name); total += file.originalSize;
    if (file.originalSize > 25 * 1024 * 1024 || total > 100 * 1024 * 1024 || file.originalSize > Math.max(1024 * 1024, file.size * 200)) throw new Error("PPTX decompression limit");
    return /^(ppt\/|\[Content_Types\]\.xml)/.test(file.name);
  } });
}

/** Size and DTD/entity check for one XML part; returns its text. */
export function checkedXmlText(files: PptxFiles, name: string) {
  if (!files[name] || files[name].length > MAX_XML_BYTES) throw new Error("Missing or oversized presentation XML");
  const xml = strFromU8(files[name]);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML entities are not supported");
  return xml;
}

/** Applies the per-part XML limits to every XML part before a third-party parser sees the package. */
export function assertPptxXmlLimits(files: PptxFiles) {
  for (const name of Object.keys(files)) if (/\.(xml|rels)$/i.test(name)) checkedXmlText(files, name);
}

export function readPptxXml(files: PptxFiles, name: string) {
  const xml = checkedXmlText(files, name);
  const root = new DOMParser({ onError: (level) => { if (level !== "warning") throw new Error("Malformed XML"); } }).parseFromString(xml, "application/xml").documentElement;
  if (!root) throw new Error("Empty XML document");
  return root;
}

export function readPptxRelations(files: PptxFiles, name: string) {
  const parts = name.split("/"), leaf = parts.pop()!;
  const path = `${parts.join("/")}/_rels/${leaf}.rels`;
  return files[path] ? new Map(xmlNodes(readPptxXml(files, path), "Relationship").map((rel) => [rel.getAttribute("Id")!, { target: rel.getAttribute("Target")!, external: rel.getAttribute("TargetMode") === "External", type: rel.getAttribute("Type") ?? "" }])) : new Map<string, PptxRelation>();
}

/** Slide part paths in presentation order (`sldIdLst`), which may differ from the file numbering. */
export function pptxSlidePaths(files: PptxFiles) {
  const root = readPptxXml(files, "ppt/presentation.xml"), rels = readPptxRelations(files, "ppt/presentation.xml");
  const slides = xmlNodes(root, "sldId");
  if (!slides.length || slides.length > 100) throw new Error("Use 1–100 slides");
  const size = xmlNodes(root, "sldSz")[0];
  const paths = slides.map((slide) => {
    const ref = slide.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? slide.getAttribute("r:id");
    const relation = rels.get(ref ?? "");
    if (!relation || relation.external) throw new Error("Missing slide relationship");
    return resolvePptxPath("ppt/presentation.xml", relation.target);
  });
  return { root, paths, cx: Number(size?.getAttribute("cx")) || 9144000, cy: Number(size?.getAttribute("cy")) || 5143500 };
}

/** The slide title placeholder's text (`title`/`ctrTitle`), used to name the frame and stop. */
export function pptxSlideTitle(files: PptxFiles, path: string) {
  const slide = readPptxXml(files, path);
  for (const shape of xmlNodes(slide, "sp")) {
    const type = xmlNodes(shape, "ph")[0]?.getAttribute("type");
    if (type !== "title" && type !== "ctrTitle") continue;
    const text = xmlNodes(shape, "p").map((paragraph) => xmlNodes(paragraph, "t").map((node) => node.textContent ?? "").join("")).join(" ").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 200);
  }
  return "";
}

export const pptxWarningCodes = [
  "unsupported", "formatting", "externalMedia", "missingMedia", "animations",
  "table", "tableAsText", "chartSimplified", "chartDropped", "customShape", "fillSimplified", "fontSizes",
  "smartArt", "math", "media", "imageCrop", "transform", "textTruncated", "objectLimit", "fallback",
] as const;
export type PptxImportWarning = { slide: number; code: (typeof pptxWarningCodes)[number] };
export type PptxImportMedia = { key: string; name: string; mime: string; bytes: Uint8Array };

const imageMimes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
export const pptxImageMime = (path: string) => imageMimes[path.split(".").pop()?.toLowerCase() ?? ""];
