import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractDocx, formatControlTag, parseControlTag, wikiSlugFromUrl } from "./docx-extract";
import { DocxLimitError, unzipDocxBounded } from "./docx-safety";
import { control, para, testDocx, W_NS } from "./test-docx";

const extract = (buffer: Buffer) => extractDocx(unzipDocxBounded(buffer));

describe("unzipDocxBounded", () => {
  it("rejects archives that are not DOCX, miss required parts or inflate too far", () => {
    expect(() => unzipDocxBounded(Buffer.from("not a zip"))).toThrow(DocxLimitError);
    expect(() => unzipDocxBounded(zipSync({ "word/document.xml": strToU8("<x/>") }))).toThrow(/required parts/);
    const bomb = zipSync({ "[Content_Types].xml": strToU8("<x/>"), "word/document.xml": new Uint8Array(30 * 1024 * 1024) }, { level: 9 });
    expect(() => unzipDocxBounded(bomb)).toThrow(DocxLimitError);
  });

  it("rejects too many entries", () => {
    const files: Record<string, Uint8Array> = { "[Content_Types].xml": strToU8("<x/>"), "word/document.xml": strToU8("<x/>") };
    for (let index = 0; index < 4001; index++) files[`word/media/${index}.bin`] = new Uint8Array(1);
    expect(() => unzipDocxBounded(zipSync(files, { level: 0 }))).toThrow(/decompression limit/);
  });
});

describe("control tags", () => {
  it("round-trips known tags and ignores malformed or oversized ones", () => {
    const tag = formatControlTag({ kind: "cite", ids: ["s1", "s2"], loc: "12" });
    expect(parseControlTag(tag)).toEqual({ kind: "cite", ids: ["s1", "s2"], loc: "12" });
    expect(parseControlTag("mp:bibliography")).toEqual({ kind: "bibliography" });
    expect(parseControlTag('mp:task:{"id":"t1"}')).toEqual({ kind: "task", id: "t1" });
    expect(parseControlTag("mp:cite:{broken")).toBeNull();
    expect(parseControlTag('mp:unknown:{"id":"x"}')).toBeNull();
    expect(parseControlTag('mp:cite:{"ids":[]}')).toBeNull();
    expect(parseControlTag(`mp:cite:{"ids":["${"x".repeat(1100)}"]}`)).toBeNull();
    expect(parseControlTag("other")).toBeNull();
  });
});

describe("extractDocx", () => {
  it("reads visible text, honouring tracked insertions and deletions", () => {
    const body = `<w:p><w:r><w:t>Kept </w:t></w:r><w:ins><w:r><w:t>inserted </w:t></w:r></w:ins><w:del><w:r><w:delText>deleted </w:delText></w:r></w:del><w:r><w:t>end</w:t></w:r></w:p>`;
    const result = extract(testDocx(body));
    expect(result.text).toBe("Kept inserted end");
  });

  it("collects connections from tagged controls in document order, deduplicated", () => {
    const body = [
      para("Intro"),
      `<w:p>${control('mp:cite:{"ids":["s2"],"loc":"4"}', "[1, p. 4]")}${control('mp:cite:{"ids":["s1","s2"]}', "[2, 1]")}</w:p>`,
      `<w:p>${control('mp:evidence:{"id":"a1"}', "„Quote“")}${control('mp:evidence:{"id":"a1"}', "copy")}</w:p>`,
      `<w:p>${control('mp:task:{"id":"t1"}', "do this")}${control('mp:deadline:{"id":"d1"}', "by then")}</w:p>`,
      `<w:sdt><w:sdtPr><w:tag w:val="mp:bibliography"/></w:sdtPr><w:sdtContent>${para("[1] Source")}</w:sdtContent></w:sdt>`,
    ].join("");
    const result = extract(testDocx(body));
    expect(result.citations).toEqual([{ ids: ["s2"], loc: "4" }, { ids: ["s1", "s2"] }]);
    expect(result.citationSourceIds).toEqual(["s2", "s1"]);
    expect(result.evidenceAnnotationIds).toEqual(["a1"]);
    expect(result.taskIds).toEqual(["t1"]);
    expect(result.deadlineIds).toEqual(["d1"]);
    expect(result.hasBibliography).toBe(true);
    expect(result.text).toContain("[1] Source");
  });

  it("drops relations of empty controls and of controls inside tracked deletions", () => {
    const body = `<w:p>${control('mp:cite:{"ids":["s1"]}', "  ")}<w:del>${control('mp:evidence:{"id":"a1"}', "gone")}</w:del>${control('mp:task:{"id":"t1"}', "kept")}</w:p>`;
    const result = extract(testDocx(body));
    expect(result.citations).toEqual([]);
    expect(result.evidenceAnnotationIds).toEqual([]);
    expect(result.taskIds).toEqual(["t1"]);
  });

  it("finds wiki page links through relationships and HYPERLINK fields", () => {
    const body = `<w:p><w:hyperlink r:id="rId5"><w:r><w:t>Other page</w:t></w:r></w:hyperlink><w:hyperlink r:id="rId6"><w:r><w:t>External</w:t></w:r></w:hyperlink></w:p>`
      + `<w:p><w:r><w:instrText> HYPERLINK "https://app.example/wiki/pages/field-page" </w:instrText></w:r></w:p>`;
    const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://app.example/wiki/pages/linked-page" TargetMode="External"/>`
      + `<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org/" TargetMode="External"/></Relationships>`;
    const result = extract(testDocx(body, { "word/_rels/document.xml.rels": rels }));
    expect(result.slugs.sort()).toEqual(["field-page", "linked-page"]);
  });

  it("includes footnotes and headers in searchable text", () => {
    const result = extract(testDocx(para("Body"), {
      "word/footnotes.xml": `<w:footnotes ${W_NS}><w:footnote w:id="1">${para("A footnote")}</w:footnote></w:footnotes>`,
      "word/header1.xml": `<w:hdr ${W_NS}>${para("Header text")}</w:hdr>`,
    }));
    expect(result.text).toContain("Body");
    expect(result.text).toContain("A footnote");
    expect(result.text).toContain("Header text");
  });

  it("rejects malformed XML", () => {
    expect(() => extract(testDocx("<w:p><w:r>"))).toThrow(DocxLimitError);
  });

  it("maps wiki URLs to slugs only for page paths", () => {
    expect(wikiSlugFromUrl("/wiki/pages/a%20b")).toBe("a b");
    expect(wikiSlugFromUrl("https://host/wiki/pages/x/")).toBe("x");
    expect(wikiSlugFromUrl("https://host/wiki/sources/x")).toBeNull();
  });
});
