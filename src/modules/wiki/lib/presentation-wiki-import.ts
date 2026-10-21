// Filling a detail page from a wiki document: a page's outline (headings with the lines under
// them) and the slide elements one section turns into. Pure, so the server reads outlines and
// the editor lays them out with the same types.
import type { TiptapNode } from "./tiptap";
import type { PresentationElement } from "./presentation-model";

/** One heading of a wiki document and the text up to the next heading of any level. */
export type WikiOutlineSection = { id: string; title: string; level: number; lines: string[] };

export const WIKI_OUTLINE_MAX_SECTIONS = 300;
export const WIKI_OUTLINE_MAX_LINES = 40;
const LINE_LIMIT = 400;

/** Collects lines into sections; text before the first heading forms an untitled section. */
export function outlineBuilder() {
  const sections: WikiOutlineSection[] = [];
  return {
    heading(title: string, level: number) {
      const clean = title.replace(/\s+/g, " ").trim();
      if (clean && sections.length < WIKI_OUTLINE_MAX_SECTIONS) sections.push({ id: `s${sections.length}`, title: clean.slice(0, 200), level, lines: [] });
    },
    line(text: string) {
      const clean = text.replace(/\s+/g, " ").trim();
      if (!clean) return;
      if (!sections.length) sections.push({ id: "s0", title: "", level: 0, lines: [] });
      const lines = sections.at(-1)!.lines;
      if (lines.length < WIKI_OUTLINE_MAX_LINES) lines.push(clean.slice(0, LINE_LIMIT));
    },
    done: () => sections.filter((section) => section.title || section.lines.length),
  };
}

const inlineText = (node: TiptapNode): string => node.text ?? (node.type === "hardBreak" ? " " : (node.content ?? []).map(inlineText).join(""));

/** The outline of a (legacy) Tiptap page. */
export function tiptapOutline(doc: TiptapNode): WikiOutlineSection[] {
  const outline = outlineBuilder();
  const walk = (node: TiptapNode) => {
    for (const child of node.content ?? []) {
      if (child.type === "heading") outline.heading(inlineText(child), Number(child.attrs?.level) || 1);
      else if (child.type === "paragraph") outline.line(inlineText(child));
      else walk(child);
    }
  };
  walk(doc);
  return outline.done();
}

/**
 * A section as slide content inside `frame`: its heading as the title and its lines as a
 * bulleted text box below. The text boxes join the frame like anything placed in it.
 */
export function wikiSectionElements(section: WikiOutlineSection, frame: PresentationElement, createId: () => string): PresentationElement[] {
  const margin = Math.round(frame.width * 0.06);
  const width = frame.width - margin * 2;
  const titleHeight = Math.round(frame.height * 0.16);
  const elements: PresentationElement[] = [];
  if (section.title) elements.push({ id: createId(), type: "text", parentId: frame.id, x: frame.x + margin, y: frame.y + margin, width, height: titleHeight, rotation: 0,
    content: { text: section.title, fontSize: 44, bold: true, color: "", align: "left" } });
  const body = section.lines.join("\n");
  if (body) {
    const top = frame.y + margin + (section.title ? titleHeight + margin / 2 : 0);
    elements.push({ id: createId(), type: "text", parentId: frame.id, x: frame.x + margin, y: top, width, height: Math.max(40, frame.y + frame.height - margin - top), rotation: 0,
      content: { text: body.slice(0, 5000), fontSize: 24, bold: false, color: "", align: "left", list: section.lines.length > 1 ? "bullet" : "none",
        autoFit: { minFontSize: 12, maxFontSize: 24 } } });
  }
  return elements;
}
