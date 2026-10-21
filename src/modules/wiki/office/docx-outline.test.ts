import { describe, expect, it } from "vitest";
import { docxOutline } from "./docx-outline";
import { unzipDocxBounded } from "./docx-safety";
import { para, testDocx, W_NS } from "./test-docx";
import { tiptapOutline, wikiSectionElements } from "../lib/presentation-wiki-import";

const styled = (style: string, text: string) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const styles = `<?xml version="1.0"?><w:styles ${W_NS}>
  <w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Zwischentitel"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
</w:styles>`;

describe("wiki document outlines", () => {
  it("reads localised heading styles, outline levels and the text under each heading", () => {
    const docx = testDocx([
      para("Vorwort"),
      styled("berschrift1", "Gegenstandsverleih"), para("Bohrmaschinen, Leitern"), para(""), para("Abholung im Gemeindeamt"),
      styled("Custom", "Ablauf"), para("Online reservieren"),
      `<w:del><w:p><w:r><w:delText>gelöscht</w:delText></w:r></w:p></w:del>`,
    ].join(""), { "word/styles.xml": styles });
    expect(docxOutline(unzipDocxBounded(docx))).toEqual([
      { id: "s0", title: "", level: 0, lines: ["Vorwort"] },
      { id: "s1", title: "Gegenstandsverleih", level: 1, lines: ["Bohrmaschinen, Leitern", "Abholung im Gemeindeamt"] },
      { id: "s2", title: "Ablauf", level: 2, lines: ["Online reservieren"] },
    ]);
  });

  it("reads legacy Tiptap pages the same way", () => {
    expect(tiptapOutline({ type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Mitfahrbörse" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Fahrten teilen" }] }] }] },
    ] })).toEqual([{ id: "s0", title: "Mitfahrbörse", level: 2, lines: ["Fahrten teilen"] }]);
  });

  it("lays a section out as a title and a bulleted body inside the frame", () => {
    let id = 0;
    const frame = { id: "page", type: "frame", x: 0, y: 1000, width: 1000, height: 500, rotation: 0, content: { label: "", shape: "rect", color: "" } } as const;
    const [title, body] = wikiSectionElements({ id: "s1", title: "Ablauf", level: 1, lines: ["a", "b"] }, frame, () => `e${++id}`);
    expect(title).toMatchObject({ parentId: "page", content: { text: "Ablauf", bold: true } });
    expect(body).toMatchObject({ parentId: "page", content: { text: "a\nb", list: "bullet" } });
    expect(body.y + body.height).toBeLessThanOrEqual(frame.y + frame.height);
  });
});
