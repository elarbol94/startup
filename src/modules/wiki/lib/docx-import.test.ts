import { strToU8, unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { boundedDocx, docxHtmlToTiptap } from "./docx-import";

describe("Word import", () => {
  it("preserves whitespace, nested formatting, escaped text and line breaks", () => {
    const doc = docxHtmlToTiptap('<p>Hello <strong>bold <em>and italic</em></strong> world &lt;tag&gt;.<br />Next</p>');
    expect(doc.content?.[0].content).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "bold ", marks: [{ type: "bold" }] },
      { type: "text", text: "and italic", marks: [{ type: "bold" }, { type: "italic" }] },
      { type: "text", text: " world <tag>." },
      { type: "hardBreak" },
      { type: "text", text: "Next" },
    ]);
  });
  it("retains nested lists and gives repeated headings distinct targets", () => {
    const doc = docxHtmlToTiptap('<h1>Overview</h1><h1>Overview</h1><ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>');
    expect(doc.content?.slice(0, 2).map((node) => node.attrs?.id)).toEqual(["overview", "overview-2"]);
    expect(doc.content?.[2].content).toHaveLength(2);
    expect(doc.content?.[2].content?.[0].content?.[1].type).toBe("bulletList");
    expect(JSON.stringify(doc)).toContain("Sibling");
  });
  it("preserves table paragraphs and does not turn a data row into a header", () => {
    const table = docxHtmlToTiptap('<table><tr><td><p>One</p><p>Two</p></td></tr></table>').content?.[0];
    expect(table?.content?.[0].content?.[0].type).toBe("markdownTableCell");
    expect(table?.content?.[0].content?.[0].content).toHaveLength(2);
  });
});

describe("boundedDocx", () => {
  it("rejects archives that inflate past the limits, including lying size headers", () => {
    const bomb = zipSync({ "word/document.xml": new Uint8Array(4 * 1024 * 1024) }, { level: 9 });
    expect(() => boundedDocx(bomb)).toThrow();
    // Declare 1 KB uncompressed in both the local and the central header.
    const lying = zipSync({ "word/document.xml": new Uint8Array(4 * 1024 * 1024) }, { level: 9 });
    const view = new DataView(lying.buffer);
    for (let offset = 0; offset < lying.length - 4; offset += 1) {
      const signature = view.getUint32(offset, true);
      if (signature === 0x04034b50) view.setUint32(offset + 22, 1024, true);
      if (signature === 0x02014b50) view.setUint32(offset + 24, 1024, true);
    }
    // fflate allocates the declared size, so the lie yields truncated bytes, never 4 MB.
    expect(unzipSync(new Uint8Array(boundedDocx(lying)))["word/document.xml"].length).toBe(1024);
  });

  it("keeps a normal document readable by mammoth", async () => {
    const docx = zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hallo</w:t></w:r></w:p></w:body></w:document>') });
    const result = await mammoth.convertToHtml({ buffer: boundedDocx(docx) });
    expect(result.value).toBe("<p>Hallo</p>");
  });
});
