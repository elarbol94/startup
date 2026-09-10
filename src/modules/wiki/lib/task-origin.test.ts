import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { resolveTaskOrigin } from "./task-origin";

const schema = new Schema({ nodes: { doc: { content: "block+" }, paragraph: { group: "block", content: "text*" }, text: {} }, marks: { bold: {} } });
const paragraph = (text: string) => schema.node("paragraph", null, schema.text(text));
describe("document task origins", () => {
  it("uses a verified original selection across formatting marks", () => {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Keep "), schema.text("formatting", [schema.mark("bold")])])]);
    expect(resolveTaskOrigin(doc, JSON.stringify({ from: 1, to: 16, quote: "Keep formatting" }))).toEqual({ from: 1, to: 16 });
  });
  it("relocates a unique quote after text has been inserted before it", () => {
    const doc = schema.node("doc", null, [paragraph("New"), paragraph("Original")]);
    expect(resolveTaskOrigin(doc, JSON.stringify({ from: 1, to: 9, quote: "Original" }))).toEqual({ from: 6, to: 14 });
  });
  it("finds selections spanning paragraphs", () => {
    const doc = schema.node("doc", null, [paragraph("First"), paragraph("Second")]);
    expect(resolveTaskOrigin(doc, JSON.stringify({ quote: "First Second" }))).toEqual({ from: 1, to: 14 });
  });
  it("does not guess for duplicate, removed or malformed origins", () => {
    const doc = schema.node("doc", null, [paragraph("Same Same")]);
    for (const anchor of ['{', 'null', JSON.stringify({ quote: "Same" }), JSON.stringify({ quote: "Removed" })]) {
      expect(resolveTaskOrigin(doc, anchor)).toBeNull();
    }
  });
});
