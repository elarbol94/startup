import { describe, expect, it } from "vitest";
import { containsCitations, containsComments, sectionDocumentJson } from "./section-json";

const run = (text: string) => ({ type: "run", content: [text] });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", pPr: {}, content });
const cite = { type: "inlineLvlSdt", sdtPr: { tag: 'mp:cite:{"ids":["s1"]}' }, content: [run("[1]")] };
const comment = { type: "commentRangeStart", id: 1, data: { text: "Note" } };

const wrapper = JSON.stringify({
  type: "blockLvlSdt",
  sdtPr: { tag: 'mp:section-edit:{"id":"lock-0001","user":"u1","at":1}', lock: "sdtContentLocked" },
  sdtContent: { type: "docContent", bPresentation: false, content: [paragraph(run("Heading")), paragraph(run("Text"), cite)] },
  styles: { s1: { name: "Heading 1" } },
  numbering: { num: {} },
});

describe("sectionDocumentJson", () => {
  it("unwraps the locked control into a document body with styles and numberings", () => {
    expect(JSON.parse(sectionDocumentJson(wrapper))).toEqual({
      type: "document",
      content: [paragraph(run("Heading")), paragraph(run("Text"), cite)],
      styles: { s1: { name: "Heading 1" } },
      numbering: { num: {} },
    });
  });

  it("rejects anything but a block content control", () => {
    expect(() => sectionDocumentJson(JSON.stringify({ type: "paragraph", content: [] }))).toThrow();
    expect(() => sectionDocumentJson(JSON.stringify({ type: "blockLvlSdt", sdtContent: {} }))).toThrow();
    expect(() => sectionDocumentJson("[]")).toThrow();
    expect(() => sectionDocumentJson("{")).toThrow();
  });
});

describe("containsComments / containsCitations", () => {
  it("finds nested comments and citations", () => {
    const table = { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: { content: [paragraph(comment, run("x"))] } }] }] };
    const body = JSON.stringify({ type: "document", content: [paragraph(run("a")), table] });
    expect(containsComments(body)).toBe(true);
    expect(containsCitations(body)).toBe(false);
    expect(containsCitations(wrapper)).toBe(true);
    expect(containsComments(wrapper)).toBe(false);
  });

  it("ignores other content controls", () => {
    const task = { type: "inlineLvlSdt", sdtPr: { tag: 'mp:task:{"id":"t1"}' }, content: [] };
    expect(containsCitations(JSON.stringify({ type: "document", content: [paragraph(task)] }))).toBe(false);
  });
});
