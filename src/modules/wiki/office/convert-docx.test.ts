import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { generateDocumentDocx } from "../lib/document-docx";
import { DEFAULT_DOCUMENT_SETTINGS } from "../lib/document-settings";
import type { TiptapNode } from "../lib/tiptap";
import { extractDocx } from "./docx-extract";
import { missingWords } from "./text-compare";
import { unzipDocxBounded } from "./docx-safety";

const text = (value: string, marks?: TiptapNode["marks"]): TiptapNode => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: TiptapNode[]): TiptapNode => ({ type: "paragraph", content });

describe("office DOCX export", () => {
  it("keeps connections as tagged controls, links, checkboxes and comments", async () => {
    const doc: TiptapNode = { type: "doc", content: [
      paragraph(text("Siehe "), { type: "citation", attrs: { label: "[1]", items: [{ sourceId: "s1", locator: "12" }] } }, text(" und "), text("Ziel", [{ type: "link", attrs: { href: "/wiki/pages/ziel" } }])),
      { type: "taskReference", attrs: { taskId: "t1", title: "Angebot schicken" } },
      paragraph({ type: "pdfEvidence", attrs: { annotationId: "a1", quote: "Zitat", sourceTitle: "Quelle", pageNumber: 3 } }),
      { type: "taskList", content: [
        { type: "taskItem", attrs: { checked: true }, content: [paragraph(text("Erledigt"))] },
        { type: "taskItem", attrs: { checked: false }, content: [paragraph(text("Offen"))] },
      ] },
      paragraph(text("kommentiert", [{ type: "comment", attrs: { threadId: "th1" } }])),
    ] };
    const bytes = await generateDocumentDocx("Titel", doc, DEFAULT_DOCUMENT_SETTINGS, {}, () => undefined, {
      origin: "https://app.example", comments: [{ threadId: "th1", author: "Anna", date: new Date(0), text: "Anna: Bitte prüfen" }],
    });
    const files = unzipDocxBounded(bytes);
    const extract = extractDocx(files);
    expect(extract.citations).toEqual([{ ids: ["s1"], loc: "12" }]);
    expect(extract.taskIds).toEqual(["t1"]);
    expect(extract.evidenceAnnotationIds).toEqual(["a1"]);
    expect(extract.slugs).toEqual(["ziel"]);
    expect(extract.text).toContain("☑ Erledigt");
    expect(extract.text).toContain("☐ Offen");
    expect(strFromU8(unzipSync(bytes)["word/comments.xml"])).toContain("Bitte prüfen");
    // No helper bookmarks remain once they became content controls.
    expect(strFromU8(files["word/document.xml"])).not.toContain("mpsdt_");
  });

  it("reports words that went missing, as a multiset", () => {
    expect(missingWords("a b b c", "c b a")).toEqual(["b"]);
    expect(missingWords("x ☐ y", "x y")).toEqual([]);
  });
});
