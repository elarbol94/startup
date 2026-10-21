import { DOMParser, type Element } from "@xmldom/xmldom";
import { strFromU8 } from "fflate";
import { outlineBuilder, type WikiOutlineSection } from "../lib/presentation-wiki-import";

/**
 * The heading outline of a DOCX, for filling a presentation detail page. A paragraph is a
 * heading when its own properties or its style carry an outline level, or its style is one of
 * Word's built-in "heading N" / "Title" styles under any localised id ("Heading1", "berschrift1").
 * Tracked deletions are left out, as in `extractDocx`.
 */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const SKIPPED = new Set(["del", "moveFrom", "delText", "instrText", "pPr", "rPr", "sdtPr", "commentReference", "footnoteReference", "endnoteReference"]);

const parse = (bytes: Uint8Array | undefined) => {
  if (!bytes) return null;
  try { return new DOMParser({ onError: () => undefined }).parseFromString(strFromU8(bytes), "application/xml"); } catch { return null; }
};
const wAttr = (element: Element, name: string) => element.getAttributeNS(W, name) || element.getAttribute(`w:${name}`) || "";
const child = (element: Element | null | undefined, local: string) =>
  element ? Array.from(element.childNodes).find((node): node is Element => node.nodeType === 1 && (node as Element).localName === local) ?? null : null;

/** Outline level (1-based) by style id, from styles.xml. */
function styleLevels(styles: ReturnType<typeof parse>): Map<string, number> {
  const levels = new Map<string, number>();
  if (!styles) return levels;
  for (const style of Array.from(styles.getElementsByTagNameNS(W, "style"))) {
    const id = wAttr(style, "styleId");
    const name = wAttr(child(style, "name") ?? style, "val").toLowerCase();
    const outline = child(child(style, "pPr"), "outlineLvl");
    const heading = name.match(/^heading\s*(\d)$/);
    if (outline) levels.set(id, Number(wAttr(outline, "val")) + 1);
    else if (heading) levels.set(id, Number(heading[1]));
    else if (name === "title") levels.set(id, 1);
  }
  return levels;
}

function visibleText(node: Element, out: string[]) {
  for (const next of Array.from(node.childNodes)) {
    if (next.nodeType !== 1) continue;
    const element = next as Element;
    if (element.namespaceURI === W && SKIPPED.has(element.localName ?? "")) continue;
    if (element.namespaceURI === W && element.localName === "t") out.push(element.textContent ?? "");
    else if (element.namespaceURI === W && (element.localName === "tab" || element.localName === "br")) out.push(" ");
    else visibleText(element, out);
  }
}

export function docxOutline(files: Record<string, Uint8Array>): WikiOutlineSection[] {
  const document = parse(files["word/document.xml"]);
  if (!document) return [];
  const levels = styleLevels(parse(files["word/styles.xml"]));
  const outline = outlineBuilder();
  for (const paragraph of Array.from(document.getElementsByTagNameNS(W, "p"))) {
    let deleted = false;
    for (let parent = paragraph.parentNode; parent; parent = parent.parentNode) {
      if (parent.nodeType === 1 && ["del", "moveFrom"].includes((parent as Element).localName ?? "")) { deleted = true; break; }
    }
    if (deleted) continue;
    const properties = child(paragraph, "pPr");
    const ownLevel = child(properties, "outlineLvl");
    const style = wAttr(child(properties, "pStyle") ?? paragraph, "val");
    const level = ownLevel ? Number(wAttr(ownLevel, "val")) + 1 : levels.get(style) ?? (/^(heading|berschrift|.*überschrift)\s*(\d)$/i.exec(style) ? Number(style.at(-1)) : 0);
    const text: string[] = [];
    visibleText(paragraph, text);
    // Body text sits at outline level 10 ("w:val=9") in Word; only 1-9 are headings.
    if (level >= 1 && level <= 9) outline.heading(text.join(""), level);
    else outline.line(text.join(""));
  }
  return outline.done();
}
