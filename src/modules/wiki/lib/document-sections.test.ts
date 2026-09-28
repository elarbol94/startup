import { describe, expect, it } from "vitest";
import { documentSections, withDocumentSectionIds } from "./document-sections";
import type { TiptapNode } from "./tiptap";

const heading = (title: string, id?: string): TiptapNode => ({ type: "heading", attrs: { level: 1, id }, content: [{ type: "text", text: title }] });

describe("document section identities", () => {
  it("repairs legacy and duplicate targets deterministically without mutating the document", () => {
    const doc = { type: "doc", content: [heading("A"), heading("B", "section-legacy-1"), heading("C", "section-legacy-1")] };
    const normalized = withDocumentSectionIds(doc);
    expect(documentSections(normalized).map((section) => section.id)).toEqual(["section-legacy-2", "section-legacy-1", "section-legacy-3"]);
    expect(withDocumentSectionIds(doc)).toEqual(normalized);
    expect(withDocumentSectionIds(normalized)).toBe(normalized);
    expect(doc.content[0].attrs?.id).toBeUndefined();
  });

  it("keeps identities when headings are renamed or moved and indexes nested headings", () => {
    const normalized = withDocumentSectionIds({ type: "doc", content: [heading("A"), heading("B")] });
    const first = { ...normalized.content![0], content: [{ type: "text", text: "Renamed" }] };
    const sections = documentSections({ type: "doc", content: [normalized.content![1], { type: "layoutSection", content: [first] }] });
    expect(sections.map((section) => section.id)).toEqual(["section-legacy-2", "section-legacy-1"]);
    expect(sections[1].title).toBe("Renamed");
  });
});
