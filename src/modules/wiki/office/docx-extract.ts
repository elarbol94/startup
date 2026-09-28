import { DOMParser, type Element, type Node as XmlNode } from "@xmldom/xmldom";
import { strFromU8 } from "fflate";
import { z } from "zod";
import { DocxLimitError } from "./docx-safety";

/**
 * Reads what the rest of the workspace needs from a DOCX: searchable text and
 * the connections stored as tagged content controls (`mp:<kind>:<json>`) and
 * hyperlinks to wiki pages. Tracked deletions are not part of the document;
 * tracked insertions are. Empty controls carry no relation.
 */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MAX_CONTROLS = 5000;
const MAX_TAG_LENGTH = 1024;

export const TAG_PREFIX = "mp:";

const idList = z.array(z.string().min(1).max(64)).min(1).max(50);
const tagSchemas = {
  cite: z.object({ ids: idList, loc: z.string().max(120).optional() }),
  evidence: z.object({ id: z.string().min(1).max(64) }),
  task: z.object({ id: z.string().min(1).max(64) }),
  deadline: z.object({ id: z.string().min(1).max(64) }),
};

export type ParsedTag =
  | { kind: "cite"; ids: string[]; loc?: string }
  | { kind: "evidence" | "task" | "deadline"; id: string }
  | { kind: "bibliography" };

export function parseControlTag(tag: string): ParsedTag | null {
  if (!tag.startsWith(TAG_PREFIX) || tag.length > MAX_TAG_LENGTH) return null;
  const rest = tag.slice(TAG_PREFIX.length);
  if (rest === "bibliography") return { kind: "bibliography" };
  const colon = rest.indexOf(":");
  if (colon < 0) return null;
  const kind = rest.slice(0, colon);
  if (!(kind in tagSchemas)) return null;
  let json: unknown;
  try { json = JSON.parse(rest.slice(colon + 1)); } catch { return null; }
  const parsed = tagSchemas[kind as keyof typeof tagSchemas].safeParse(json);
  if (!parsed.success) return null;
  return { kind, ...parsed.data } as ParsedTag;
}

export function formatControlTag(tag: ParsedTag): string {
  if (tag.kind === "bibliography") return `${TAG_PREFIX}bibliography`;
  const { kind, ...data } = tag;
  return `${TAG_PREFIX}${kind}:${JSON.stringify(data)}`;
}

export type DocxExtract = {
  text: string;
  citations: Array<{ ids: string[]; loc?: string }>;
  citationSourceIds: string[];
  evidenceAnnotationIds: string[];
  taskIds: string[];
  deadlineIds: string[];
  slugs: string[];
  hasBibliography: boolean;
};

const isW = (node: XmlNode, local: string) => node.nodeType === 1 && (node as Element).namespaceURI === W && (node as Element).localName === local;
const childElements = (node: XmlNode) => Array.from(node.childNodes ?? []).filter((child) => child.nodeType === 1) as Element[];
const wAttr = (element: Element, name: string) => element.getAttributeNS(W, name) || element.getAttribute(`w:${name}`) || "";
const SKIPPED = new Set(["del", "moveFrom", "delText", "instrText", "sdtPr", "rPr", "pPr", "commentReference", "footnoteReference", "endnoteReference"]);

function parseXml(bytes: Uint8Array | undefined) {
  if (!bytes) return null;
  let failed = false;
  try {
    const doc = new DOMParser({ onError: (level) => { if (level !== "warning") failed = true; } }).parseFromString(strFromU8(bytes), "application/xml");
    if (!failed && doc.documentElement) return doc;
  } catch {
    // xmldom throws on fatal errors; reported below.
  }
  throw new DocxLimitError("DOCX contains malformed XML");
}

/** Visible text of a subtree, honouring tracked changes. */
function visibleText(node: XmlNode, out: string[]) {
  for (const child of Array.from(node.childNodes ?? [])) {
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    if (element.namespaceURI === W) {
      if (SKIPPED.has(element.localName ?? "")) continue;
      if (element.localName === "t") { out.push(element.textContent ?? ""); continue; }
      if (element.localName === "tab") { out.push("\t"); continue; }
      if (element.localName === "br" || element.localName === "cr") { out.push("\n"); continue; }
    }
    visibleText(element, out);
    if (isW(element, "p")) out.push("\n");
  }
}

function hyperlinkTargets(files: Record<string, Uint8Array>, part: string) {
  const relsPath = part.replace(/^word\//, "word/_rels/") + ".rels";
  const rels = parseXml(files[relsPath]);
  const map = new Map<string, string>();
  if (!rels) return map;
  for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) {
    if ((rel.getAttribute("Type") ?? "").endsWith("/hyperlink")) map.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }
  return map;
}

export function wikiSlugFromUrl(target: string): string | null {
  let pathname: string;
  try { pathname = new URL(target, "https://workspace.invalid").pathname; } catch { return null; }
  const match = pathname.match(/^\/wiki\/pages\/([^/]+)\/?$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

const contentParts = (files: Record<string, Uint8Array>) => [
  "word/document.xml",
  ...Object.keys(files).filter((name) => /^word\/(header|footer)\d*\.xml$/.test(name)).sort(),
  "word/footnotes.xml",
  "word/endnotes.xml",
].filter((name) => files[name]);

export function extractDocx(files: Record<string, Uint8Array>): DocxExtract {
  const textParts: string[] = [];
  const citations: DocxExtract["citations"] = [];
  const evidence = new Set<string>(), tasks = new Set<string>(), deadlines = new Set<string>(), slugs = new Set<string>();
  let hasBibliography = false, controls = 0;

  for (const part of contentParts(files)) {
    const doc = parseXml(files[part])!;
    const partText: string[] = [];
    visibleText(doc.documentElement!, partText);
    textParts.push(partText.join(""));

    for (const sdt of Array.from(doc.getElementsByTagNameNS(W, "sdt"))) {
      if (++controls > MAX_CONTROLS) throw new DocxLimitError("Too many content controls");
      if (insideDeletion(sdt)) continue;
      const tagElement = childElements(sdt).find((child) => isW(child, "sdtPr"));
      const tag = tagElement && childElements(tagElement).find((child) => isW(child, "tag"));
      const parsed = tag ? parseControlTag(wAttr(tag, "val")) : null;
      if (!parsed) continue;
      if (parsed.kind === "bibliography") { hasBibliography = true; continue; }
      const content = childElements(sdt).find((child) => isW(child, "sdtContent"));
      const contentText: string[] = [];
      if (content) visibleText(content, contentText);
      if (!contentText.join("").trim()) continue;
      if (parsed.kind === "cite") citations.push({ ids: parsed.ids, ...(parsed.loc ? { loc: parsed.loc } : {}) });
      else if (parsed.kind === "evidence") evidence.add(parsed.id);
      else if (parsed.kind === "task") tasks.add(parsed.id);
      else deadlines.add(parsed.id);
    }

    const targets = hyperlinkTargets(files, part);
    for (const link of Array.from(doc.getElementsByTagNameNS(W, "hyperlink"))) {
      if (insideDeletion(link)) continue;
      const target = targets.get(link.getAttributeNS(R, "id") || link.getAttribute("r:id") || "");
      const slug = target ? wikiSlugFromUrl(target) : null;
      if (slug) slugs.add(slug);
    }
    for (const instr of Array.from(doc.getElementsByTagNameNS(W, "instrText"))) {
      const match = (instr.textContent ?? "").match(/HYPERLINK\s+"([^"]+)"/);
      const slug = match ? wikiSlugFromUrl(match[1]) : null;
      if (slug && !insideDeletion(instr)) slugs.add(slug);
    }
  }

  return {
    text: textParts.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    citations,
    citationSourceIds: [...new Set(citations.flatMap((citation) => citation.ids))],
    evidenceAnnotationIds: [...evidence],
    taskIds: [...tasks],
    deadlineIds: [...deadlines],
    slugs: [...slugs],
    hasBibliography,
  };
}

function insideDeletion(node: XmlNode) {
  for (let current = node.parentNode; current; current = current.parentNode) {
    if (isW(current, "del") || isW(current, "moveFrom")) return true;
  }
  return false;
}
